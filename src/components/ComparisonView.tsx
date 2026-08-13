"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowRightLeft,
  Package,
  ShoppingBag,
} from "lucide-react";
import { Order } from "@/types/order";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { UserRole } from "@/contexts/AuthContext";

interface ComparisonViewProps {
  orders: Order[];
  userRole: UserRole;
}

type MatchStatus = "matched" | "jubelio_only" | "platform_only" | "mismatch";
type FilterTab = "all" | "matched" | "mismatch" | "jubelio_only" | "platform_only";

interface ComparisonRow {
  orderNumber: string;
  matchedBy: string;
  status: MatchStatus;
  jubelioOrder?: Order;
  platformOrder?: Order;
  amountDiff?: number;
  statusMatch: boolean;
}

const ITEMS_PER_PAGE = 20;

function normalize(s: string): string {
  return s.replace(/[\s\-_.#]+/g, "").toUpperCase();
}

export default function ComparisonView({ orders, userRole }: ComparisonViewProps) {
  const hideMoney = userRole === "warehouse";
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { rows, summary } = useMemo(() => {
    const jubelioOrders = orders.filter((o) => o.platform === "jubelio");
    const platformOrders = orders.filter(
      (o) => o.platform === "shopee" || o.platform === "tiktok" || o.platform === "tokopedia"
    );

    const matched = new Map<string, ComparisonRow>();
    const matchedJubelioIds = new Set<string>();
    const matchedPlatformIds = new Set<string>();

    // Strategy 1: Match via Jubelio refNo -> platform orderNumber
    for (const jOrder of jubelioOrders) {
      if (matchedJubelioIds.has(jOrder.id)) continue;
      const refKey = jOrder.refNo ? normalize(jOrder.refNo) : null;
      if (!refKey) continue;

      for (const pOrder of platformOrders) {
        if (matchedPlatformIds.has(pOrder.id)) continue;
        if (normalize(pOrder.orderNumber) === refKey) {
          const amountDiff = Math.abs(jOrder.totalAmount - pOrder.totalAmount);
          const statusMatch = jOrder.status === pOrder.status;
          const key = pOrder.orderNumber;
          matched.set(key, {
            orderNumber: pOrder.orderNumber,
            matchedBy: "Ref No",
            status: amountDiff > 1 || !statusMatch ? "mismatch" : "matched",
            jubelioOrder: jOrder,
            platformOrder: pOrder,
            amountDiff,
            statusMatch,
          });
          matchedJubelioIds.add(jOrder.id);
          matchedPlatformIds.add(pOrder.id);
          break;
        }
      }
    }

    // Strategy 2: Match via order number directly
    for (const jOrder of jubelioOrders) {
      if (matchedJubelioIds.has(jOrder.id)) continue;
      const jKey = normalize(jOrder.orderNumber);

      for (const pOrder of platformOrders) {
        if (matchedPlatformIds.has(pOrder.id)) continue;
        if (normalize(pOrder.orderNumber) === jKey) {
          const amountDiff = Math.abs(jOrder.totalAmount - pOrder.totalAmount);
          const statusMatch = jOrder.status === pOrder.status;
          matched.set(pOrder.orderNumber, {
            orderNumber: pOrder.orderNumber,
            matchedBy: "Order No",
            status: amountDiff > 1 || !statusMatch ? "mismatch" : "matched",
            jubelioOrder: jOrder,
            platformOrder: pOrder,
            amountDiff,
            statusMatch,
          });
          matchedJubelioIds.add(jOrder.id);
          matchedPlatformIds.add(pOrder.id);
          break;
        }
      }
    }

    // Strategy 3: Match via tracking number
    for (const jOrder of jubelioOrders) {
      if (matchedJubelioIds.has(jOrder.id)) continue;
      const jTracking = jOrder.trackingNumber ? normalize(jOrder.trackingNumber) : null;
      if (!jTracking || jTracking.length < 5) continue;

      for (const pOrder of platformOrders) {
        if (matchedPlatformIds.has(pOrder.id)) continue;
        const pTracking = pOrder.trackingNumber ? normalize(pOrder.trackingNumber) : null;
        if (!pTracking) continue;

        if (jTracking === pTracking) {
          const amountDiff = Math.abs(jOrder.totalAmount - pOrder.totalAmount);
          const statusMatch = jOrder.status === pOrder.status;
          matched.set(`tracking-${jTracking}`, {
            orderNumber: pOrder.orderNumber,
            matchedBy: "Resi",
            status: amountDiff > 1 || !statusMatch ? "mismatch" : "matched",
            jubelioOrder: jOrder,
            platformOrder: pOrder,
            amountDiff,
            statusMatch,
          });
          matchedJubelioIds.add(jOrder.id);
          matchedPlatformIds.add(pOrder.id);
          break;
        }
      }
    }

    const comparisonRows: ComparisonRow[] = [...matched.values()];

    // Add unmatched Jubelio
    for (const jOrder of jubelioOrders) {
      if (matchedJubelioIds.has(jOrder.id)) continue;
      comparisonRows.push({
        orderNumber: jOrder.orderNumber,
        matchedBy: "-",
        status: "jubelio_only",
        jubelioOrder: jOrder,
        statusMatch: false,
      });
    }

    // Add unmatched platform
    for (const pOrder of platformOrders) {
      if (matchedPlatformIds.has(pOrder.id)) continue;
      comparisonRows.push({
        orderNumber: pOrder.orderNumber,
        matchedBy: "-",
        status: "platform_only",
        platformOrder: pOrder,
        statusMatch: false,
      });
    }

    comparisonRows.sort((a, b) => {
      const order: MatchStatus[] = ["mismatch", "platform_only", "jubelio_only", "matched"];
      return order.indexOf(a.status) - order.indexOf(b.status);
    });

    const matchedCount = comparisonRows.filter((r) => r.status === "matched").length;
    const mismatchCount = comparisonRows.filter((r) => r.status === "mismatch").length;
    const jubelioOnlyCount = comparisonRows.filter((r) => r.status === "jubelio_only").length;
    const platformOnlyCount = comparisonRows.filter((r) => r.status === "platform_only").length;

    return {
      rows: comparisonRows,
      summary: {
        total: comparisonRows.length,
        matched: matchedCount,
        mismatch: mismatchCount,
        jubelioOnly: jubelioOnlyCount,
        platformOnly: platformOnlyCount,
        jubelioCount: jubelioOrders.length,
        platformCount: platformOrders.length,
      },
    };
  }, [orders]);

  const filteredRows = useMemo(() => {
    let result = rows;

    if (filterTab !== "all") {
      result = result.filter((r) => r.status === filterTab);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.orderNumber.toLowerCase().includes(q) ||
          r.jubelioOrder?.customerName?.toLowerCase().includes(q) ||
          r.platformOrder?.customerName?.toLowerCase().includes(q) ||
          r.jubelioOrder?.trackingNumber?.toLowerCase().includes(q) ||
          r.platformOrder?.trackingNumber?.toLowerCase().includes(q) ||
          r.jubelioOrder?.refNo?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [rows, filterTab, searchQuery]);

  const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE);
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const jubelioOrders = orders.filter((o) => o.platform === "jubelio");
  const platformOrders = orders.filter(
    (o) => o.platform === "shopee" || o.platform === "tiktok" || o.platform === "tokopedia"
  );

  if (jubelioOrders.length === 0 && platformOrders.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-8 sm:p-12 text-center">
        <div className="w-16 sm:w-20 h-16 sm:h-20 bg-cream-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <ArrowRightLeft className="w-8 sm:w-10 h-8 sm:h-10 text-brand-300" />
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-brand-700 mb-2">
          Belum Ada Data untuk Komparasi
        </h3>
        <p className="text-brand-400 text-sm sm:text-base">
          Import data dari Jubelio dan minimal satu platform (Shopee / TikTok) untuk memulai komparasi.
        </p>
      </div>
    );
  }

  if (jubelioOrders.length === 0 || platformOrders.length === 0) {
    const missing = jubelioOrders.length === 0 ? "Jubelio" : "Shopee / TikTok";
    return (
      <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-8 sm:p-12 text-center">
        <div className="w-16 sm:w-20 h-16 sm:h-20 bg-cream-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 sm:w-10 h-8 sm:h-10 text-orange-400" />
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-brand-700 mb-2">
          Data {missing} Belum Ada
        </h3>
        <p className="text-brand-400 text-sm sm:text-base">
          Komparasi membutuhkan data dari <strong>Jubelio</strong> dan minimal satu platform (<strong>Shopee / TikTok</strong>).
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: MatchStatus) => {
    switch (status) {
      case "matched":
        return { label: "Cocok", color: "bg-green-100 text-green-700", icon: CheckCircle };
      case "mismatch":
        return { label: "Selisih", color: "bg-red-100 text-red-700", icon: AlertTriangle };
      case "jubelio_only":
        return { label: "Jubelio Only", color: "bg-amber-100 text-amber-700", icon: Package };
      case "platform_only":
        return { label: "Platform Only", color: "bg-blue-100 text-blue-700", icon: ShoppingBag };
    }
  };

  const filterTabs: { value: FilterTab; label: string; count: number; color: string }[] = [
    { value: "all", label: "Semua", count: summary.total, color: "text-brand-700" },
    { value: "matched", label: "Cocok", count: summary.matched, color: "text-green-600" },
    { value: "mismatch", label: "Selisih", count: summary.mismatch, color: "text-red-600" },
    { value: "jubelio_only", label: "Jubelio Only", count: summary.jubelioOnly, color: "text-amber-600" },
    { value: "platform_only", label: "Platform Only", count: summary.platformOnly, color: "text-blue-600" },
  ];

  const matchRate =
    summary.total > 0 ? (((summary.matched + summary.mismatch) / summary.total) * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-4">
          <p className="text-xs text-brand-400 font-medium">Jubelio</p>
          <p className="text-xl sm:text-2xl font-bold text-brand-800 mt-1">
            {formatNumber(summary.jubelioCount)}
          </p>
          <p className="text-[10px] sm:text-xs text-brand-300 mt-1">order</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-4">
          <p className="text-xs text-brand-400 font-medium">Platform</p>
          <p className="text-xl sm:text-2xl font-bold text-brand-800 mt-1">
            {formatNumber(summary.platformCount)}
          </p>
          <p className="text-[10px] sm:text-xs text-brand-300 mt-1">Shopee + TikTok</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-4">
          <p className="text-xs text-green-600 font-medium">Tercocokkan</p>
          <p className="text-xl sm:text-2xl font-bold text-green-700 mt-1">
            {formatNumber(summary.matched + summary.mismatch)}
          </p>
          <p className="text-[10px] sm:text-xs text-green-500 mt-1">
            {matchRate.toFixed(1)}% match rate
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4">
          <p className="text-xs text-red-600 font-medium">Tidak Cocok</p>
          <p className="text-xl sm:text-2xl font-bold text-red-700 mt-1">
            {formatNumber(summary.jubelioOnly + summary.platformOnly)}
          </p>
          <p className="text-[10px] sm:text-xs text-red-400 mt-1">
            perlu dicek
          </p>
        </div>
      </div>

      {/* Matching info */}
      {summary.matched + summary.mismatch > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 sm:p-4 text-xs sm:text-sm text-brand-600">
          Matching dilakukan via: <strong>Ref No</strong> (nomor order platform di Jubelio), <strong>Order Number</strong>, dan <strong>No. Resi</strong>.
          {summary.matched + summary.mismatch === 0 && " Untuk hasil lebih baik, re-import data Jubelio agar ref_no tersimpan."}
        </div>
      )}

      {/* Comparison Table */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-200">
        {/* Filter Tabs */}
        <div className="px-3 sm:px-4 border-b border-brand-200">
          <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide">
            {filterTabs.map((tab) => {
              const isActive = filterTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => {
                    setFilterTab(tab.value);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-all",
                    isActive
                      ? `border-brand-500 ${tab.color}`
                      : "border-transparent text-brand-300 hover:text-brand-500"
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs",
                      isActive ? "bg-brand-100 text-brand-700" : "bg-cream-200 text-brand-400"
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="p-3 sm:p-4 border-b border-brand-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <p className="text-xs sm:text-sm text-brand-400">
            <span className="font-semibold text-brand-700">{filteredRows.length}</span> hasil
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-300" />
            <input
              type="text"
              placeholder="Cari no. order, customer, resi..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 border border-brand-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent w-full sm:w-72 bg-cream-50 text-brand-700 placeholder:text-brand-300"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-brand-300" />
              </div>
              <p className="text-brand-400 text-center">Tidak ada data yang cocok dengan filter.</p>
            </div>
          ) : (
            <table className="w-full min-w-[950px]">
              <thead className="bg-cream-100">
                <tr>
                  <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider">
                    No. Pesanan
                  </th>
                  <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider">
                    Match Via
                  </th>
                  <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider">
                    Customer
                  </th>
                  {!hideMoney && (
                    <>
                      <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider">
                        Jubelio (Rp)
                      </th>
                      <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider">
                        Platform (Rp)
                      </th>
                      <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider">
                        Selisih
                      </th>
                    </>
                  )}
                  <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider">
                    Status Order
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {paginatedRows.map((row, idx) => {
                  const badge = getStatusBadge(row.status);
                  const BadgeIcon = badge.icon;

                  return (
                    <tr
                      key={`${row.orderNumber}-${idx}`}
                      className={cn(
                        "hover:bg-cream-50 transition-colors",
                        row.status === "mismatch" && "bg-red-50/40"
                      )}
                    >
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium",
                            badge.color
                          )}
                        >
                          <BadgeIcon className="w-3 h-3" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                        <p className="text-xs sm:text-sm font-medium text-brand-800 font-mono">
                          {row.orderNumber}
                        </p>
                        {row.jubelioOrder && row.platformOrder && (
                          <p className="text-[10px] text-brand-300 mt-0.5 font-mono">
                            J: {row.jubelioOrder.orderNumber}
                          </p>
                        )}
                        {row.platformOrder && (
                          <p className="text-[10px] text-brand-300 mt-0.5">
                            {row.platformOrder.platform === "shopee" ? "Shopee" : "TikTok"}
                          </p>
                        )}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                        <span className="text-[10px] sm:text-xs text-brand-400 bg-cream-200 px-1.5 py-0.5 rounded">
                          {row.matchedBy}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                        <p className="text-xs sm:text-sm text-brand-700 truncate max-w-[130px]">
                          {row.jubelioOrder?.customerName ||
                            row.platformOrder?.customerName ||
                            "-"}
                        </p>
                      </td>
                      {!hideMoney && (
                        <>
                          <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right">
                            {row.jubelioOrder ? (
                              <p className="text-xs sm:text-sm font-medium text-brand-800">
                                {formatCurrency(row.jubelioOrder.totalAmount)}
                              </p>
                            ) : (
                              <p className="text-xs text-brand-300">-</p>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right">
                            {row.platformOrder ? (
                              <p className="text-xs sm:text-sm font-medium text-brand-800">
                                {formatCurrency(row.platformOrder.totalAmount)}
                              </p>
                            ) : (
                              <p className="text-xs text-brand-300">-</p>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right">
                            {row.jubelioOrder && row.platformOrder ? (
                              <p
                                className={cn(
                                  "text-xs sm:text-sm font-semibold",
                                  (row.amountDiff ?? 0) > 1
                                    ? "text-red-600"
                                    : "text-green-600"
                                )}
                              >
                                {(row.amountDiff ?? 0) > 1
                                  ? formatCurrency(row.amountDiff!)
                                  : "0"}
                              </p>
                            ) : (
                              <p className="text-xs text-brand-300">-</p>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-center">
                        {row.jubelioOrder && row.platformOrder ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1 text-[10px]">
                              <span className="text-brand-400">J:</span>
                              <span className="text-brand-700">
                                {row.jubelioOrder.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px]">
                              <span className="text-brand-400">P:</span>
                              <span
                                className={cn(
                                  "font-medium",
                                  row.statusMatch
                                    ? "text-brand-700"
                                    : "text-red-600"
                                )}
                              >
                                {row.platformOrder.status}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] text-brand-700">
                            {(row.jubelioOrder || row.platformOrder)?.status ||
                              "-"}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-3 sm:px-5 py-3 sm:py-4 border-t border-brand-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs sm:text-sm text-brand-400 order-2 sm:order-1">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{" "}
              {Math.min(
                currentPage * ITEMS_PER_PAGE,
                filteredRows.length
              )}{" "}
              dari {filteredRows.length}
            </p>
            <div className="flex items-center gap-1.5 sm:gap-2 order-1 sm:order-2">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 sm:p-2 rounded-lg border border-brand-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cream-100"
              >
                <ChevronLeft className="w-4 h-4 text-brand-400" />
              </button>
              <div className="flex items-center gap-0.5 sm:gap-1">
                {Array.from(
                  { length: Math.min(5, totalPages) },
                  (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (currentPage <= 3) pageNum = i + 1;
                    else if (currentPage >= totalPages - 2)
                      pageNum = totalPages - 4 + i;
                    else pageNum = currentPage - 2 + i;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={cn(
                          "w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs sm:text-sm font-medium transition-colors",
                          currentPage === pageNum
                            ? "bg-brand-500 text-white"
                            : "hover:bg-cream-200 text-brand-400"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                )}
              </div>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 sm:p-2 rounded-lg border border-brand-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cream-100"
              >
                <ChevronRight className="w-4 h-4 text-brand-400" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
