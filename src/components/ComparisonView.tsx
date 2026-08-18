"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowRightLeft,
  Package,
  ShoppingBag,
  RefreshCw,
  CloudOff,
} from "lucide-react";
import { motion } from "framer-motion";
import { Order, UploadedFile } from "@/types/order";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { UserRole } from "@/contexts/AuthContext";
import { CardsSkeleton, TableSkeleton } from "@/components/Skeleton";

interface ComparisonViewProps {
  orders: Order[];
  userRole: UserRole;
  uploadedFiles?: UploadedFile[];
  onSyncComplete?: () => void | Promise<void>;
  isRefreshing?: boolean;
}

type MatchStatus = "matched" | "jubelio_only" | "platform_only" | "mismatch";
type FilterTab = "all" | "matched" | "mismatch" | "jubelio_only" | "platform_only";
type CompSortField = "status" | "orderNumber" | "matchedBy" | "customer" | "jubelioAmount" | "platformAmount" | "amountDiff" | "statusOrder";
type CompSortDir = "asc" | "desc";

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

type MarketplaceFilter = "all" | "tiktok" | "shopee";
type TtsChannelFilter = "all" | "tts" | "tokopedia";

function marketplaceOf(order?: Order): Exclude<MarketplaceFilter, "all"> {
  if (!order) return "tiktok";
  if (order.platform === "shopee") return "shopee";
  return "tiktok";
}

function ttsChannelOf(order?: Order): Exclude<TtsChannelFilter, "all"> {
  if (!order) return "tts";
  if (order.platform === "tokopedia") return "tokopedia";

  const hint = [order.channelName, order.storeName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (hint.includes("tiktok")) return "tts";
  if (hint.includes("tokopedia") || hint.includes("tokped")) return "tokopedia";
  return "tts";
}

function marketplaceLabel(order?: Order): string {
  if (!order) return "-";
  if (order.platform === "shopee") return "Shopee";
  return ttsChannelOf(order) === "tokopedia" ? "Tokopedia" : "TikTok Shop by Tokopedia";
}

export default function ComparisonView({ orders, userRole, uploadedFiles = [], onSyncComplete, isRefreshing = false }: ComparisonViewProps) {
  const hideMoney = userRole === "warehouse";
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState<MarketplaceFilter>("all");
  const [ttsChannelFilter, setTtsChannelFilter] = useState<TtsChannelFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<CompSortField>("status");
  const [sortDir, setSortDir] = useState<CompSortDir>("asc");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");

  const tiktokSyncFile = [...uploadedFiles]
    .filter((f) => f.platform === "tiktok" || f.platform === "tokopedia")
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
  const lastSyncLabel = tiktokSyncFile?.uploadedAt
    ? new Date(tiktokSyncFile.uploadedAt).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const handleSyncTikTok = async () => {
    setSyncing(true);
    setSyncError("");
    try {
      const res = await fetch("/api/tiktok/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || "Gagal sinkronisasi TikTok");
      } else if (onSyncComplete) {
        await onSyncComplete();
      }
    } catch (err: any) {
      setSyncError(err.message || "Terjadi kesalahan jaringan");
    } finally {
      setSyncing(false);
    }
  };

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

    const comparisonRows: ComparisonRow[] = Array.from(matched.values());

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

    if (filterTab === "platform_only" && marketplaceFilter !== "all") {
      result = result.filter((r) => marketplaceOf(r.platformOrder) === marketplaceFilter);
    }

    if (
      filterTab === "platform_only" &&
      marketplaceFilter === "tiktok" &&
      ttsChannelFilter !== "all"
    ) {
      result = result.filter((r) => ttsChannelOf(r.platformOrder) === ttsChannelFilter);
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

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "status": {
          const order: MatchStatus[] = ["mismatch", "platform_only", "jubelio_only", "matched"];
          cmp = order.indexOf(a.status) - order.indexOf(b.status);
          break;
        }
        case "orderNumber":
          cmp = a.orderNumber.localeCompare(b.orderNumber);
          break;
        case "matchedBy":
          cmp = (a.matchedBy || "").localeCompare(b.matchedBy || "");
          break;
        case "customer": {
          const aCust = a.jubelioOrder?.customerName || a.platformOrder?.customerName || "";
          const bCust = b.jubelioOrder?.customerName || b.platformOrder?.customerName || "";
          cmp = aCust.localeCompare(bCust);
          break;
        }
        case "jubelioAmount":
          cmp = (a.jubelioOrder?.totalAmount || 0) - (b.jubelioOrder?.totalAmount || 0);
          break;
        case "platformAmount":
          cmp = (a.platformOrder?.totalAmount || 0) - (b.platformOrder?.totalAmount || 0);
          break;
        case "amountDiff":
          cmp = (a.amountDiff || 0) - (b.amountDiff || 0);
          break;
        case "statusOrder":
          cmp = (a.statusMatch ? 1 : 0) - (b.statusMatch ? 1 : 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [rows, filterTab, marketplaceFilter, ttsChannelFilter, searchQuery, sortField, sortDir]);

  const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE);
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleCompSort = (field: CompSortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setCurrentPage(1);
  };

  const CompSortIcon = ({ field }: { field: CompSortField }) => {
    if (sortField !== field) {
      return <ChevronDown className="w-3 h-3 opacity-30" />;
    }
    return sortDir === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 text-brand-700" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-brand-700" />
    );
  };

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

  const marketplaceCounts = useMemo(() => {
    const only = rows.filter((r) => r.status === "platform_only");
    return {
      all: only.length,
      tiktok: only.filter((r) => marketplaceOf(r.platformOrder) === "tiktok").length,
      shopee: only.filter((r) => marketplaceOf(r.platformOrder) === "shopee").length,
    };
  }, [rows]);

  const ttsChannelCounts = useMemo(() => {
    const only = rows.filter(
      (r) => r.status === "platform_only" && marketplaceOf(r.platformOrder) === "tiktok"
    );
    return {
      all: only.length,
      tts: only.filter((r) => ttsChannelOf(r.platformOrder) === "tts").length,
      tokopedia: only.filter((r) => ttsChannelOf(r.platformOrder) === "tokopedia").length,
    };
  }, [rows]);

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
      {/* Header + Sync */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs sm:text-sm text-brand-400">
          Data TikTok &amp; Tokopedia ditarik dari <strong className="text-brand-600">TikTok Shop API</strong> (siap dikirim).
        </p>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleSyncTikTok}
            disabled={syncing || isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            {syncing ? "Menyinkronkan..." : "Sync TikTok"}
          </button>
          {syncError ? (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <CloudOff className="w-3.5 h-3.5" /> {syncError}
            </span>
          ) : (
            <span className="text-xs text-brand-400">
              {lastSyncLabel ? `Terakhir di-sync: ${lastSyncLabel}` : "Belum pernah di-sync"}
            </span>
          )}
        </div>
      </div>

      {syncing || isRefreshing ? (
        <>
          <CardsSkeleton />
          <TableSkeleton rows={8} columns={7} />
        </>
      ) : (
      <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Jubelio", value: formatNumber(summary.jubelioCount), sub: "order", border: "border-brand-200", valueColor: "text-brand-800", labelColor: "text-brand-400", subColor: "text-brand-300" },
          { label: "Platform", value: formatNumber(summary.platformCount), sub: "Shopee + TikTok", border: "border-brand-200", valueColor: "text-brand-800", labelColor: "text-brand-400", subColor: "text-brand-300" },
          { label: "Tercocokkan", value: formatNumber(summary.matched + summary.mismatch), sub: `${matchRate.toFixed(1)}% match rate`, border: "border-green-200", valueColor: "text-green-700", labelColor: "text-green-600", subColor: "text-green-500" },
          { label: "Tidak Cocok", value: formatNumber(summary.jubelioOnly + summary.platformOnly), sub: "perlu dicek", border: "border-red-200", valueColor: "text-red-700", labelColor: "text-red-600", subColor: "text-red-400" },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className={cn("bg-white rounded-xl shadow-sm border p-4", card.border)}
          >
            <p className={cn("text-xs font-medium", card.labelColor)}>{card.label}</p>
            <p className={cn("text-xl sm:text-2xl font-bold mt-1", card.valueColor)}>{card.value}</p>
            <p className={cn("text-[10px] sm:text-xs mt-1", card.subColor)}>{card.sub}</p>
          </motion.div>
        ))}
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
                    setMarketplaceFilter("all");
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

        {filterTab === "platform_only" && (
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-brand-100 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] sm:text-xs font-medium text-brand-400 mr-0.5 sm:mr-1">Marketplace:</span>
            {([
              { value: "all" as MarketplaceFilter, label: "Semua" },
              { value: "tiktok" as MarketplaceFilter, label: "TikTok & Tokopedia" },
              { value: "shopee" as MarketplaceFilter, label: "Shopee" },
            ]).map((item) => {
              const isActive = marketplaceFilter === item.value;
              const count = marketplaceCounts[item.value];
              return (
                <button
                  key={item.value}
                  onClick={() => {
                    setMarketplaceFilter(item.value);
                    setTtsChannelFilter("all");
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    isActive
                      ? "bg-brand-500 text-white shadow-sm"
                      : "bg-cream-200 text-brand-400 hover:bg-cream-300"
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px]",
                      isActive ? "bg-white/20" : "bg-brand-200 text-brand-500"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {filterTab === "platform_only" && marketplaceFilter === "tiktok" && (
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-brand-100 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] sm:text-xs font-medium text-brand-400 mr-0.5 sm:mr-1">Platform:</span>
            {([
              { value: "all" as TtsChannelFilter, label: "Semua" },
              { value: "tts" as TtsChannelFilter, label: "TikTok Shop by Tokopedia" },
              { value: "tokopedia" as TtsChannelFilter, label: "Tokopedia" },
            ]).map((item) => {
              const isActive = ttsChannelFilter === item.value;
              const count = ttsChannelCounts[item.value];
              return (
                <button
                  key={item.value}
                  onClick={() => {
                    setTtsChannelFilter(item.value);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    isActive
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-cream-200 text-brand-400 hover:bg-cream-300"
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px]",
                      isActive ? "bg-white/20" : "bg-brand-200 text-brand-500"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

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
                  <th
                    className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                    onClick={() => handleCompSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      Status <CompSortIcon field="status" />
                    </div>
                  </th>
                  <th
                    className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                    onClick={() => handleCompSort("orderNumber")}
                  >
                    <div className="flex items-center gap-1">
                      No. Pesanan <CompSortIcon field="orderNumber" />
                    </div>
                  </th>
                  <th
                    className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                    onClick={() => handleCompSort("matchedBy")}
                  >
                    <div className="flex items-center gap-1">
                      Match Via <CompSortIcon field="matchedBy" />
                    </div>
                  </th>
                  <th
                    className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                    onClick={() => handleCompSort("customer")}
                  >
                    <div className="flex items-center gap-1">
                      Customer <CompSortIcon field="customer" />
                    </div>
                  </th>
                  {!hideMoney && (
                    <>
                      <th
                        className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                        onClick={() => handleCompSort("jubelioAmount")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Jubelio (Rp) <CompSortIcon field="jubelioAmount" />
                        </div>
                      </th>
                      <th
                        className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                        onClick={() => handleCompSort("platformAmount")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Platform (Rp) <CompSortIcon field="platformAmount" />
                        </div>
                      </th>
                      <th
                        className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                        onClick={() => handleCompSort("amountDiff")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Selisih <CompSortIcon field="amountDiff" />
                        </div>
                      </th>
                    </>
                  )}
                  <th
                    className="px-3 sm:px-4 py-2.5 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                    onClick={() => handleCompSort("statusOrder")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Status Order <CompSortIcon field="statusOrder" />
                    </div>
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
                            {marketplaceLabel(row.platformOrder)}
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
      </>
      )}
    </div>
  );
}
