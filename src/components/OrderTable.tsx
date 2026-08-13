"use client";

import { useState, useMemo } from "react";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Package,
  Clock,
  AlertTriangle,
  Truck,
  CheckCircle,
  XCircle,
  RotateCcw,
  CreditCard,
} from "lucide-react";
import { Order, Platform, OrderStatus } from "@/types/order";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  getPlatformName,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";
import { isBefore, addHours } from "date-fns";

interface OrderTableProps {
  orders: Order[];
}

type SortField = "orderDate" | "totalAmount" | "customerName" | "status" | "mustShipBefore";
type SortDirection = "asc" | "desc";
type StatusTab = "all" | "pending" | "processing" | "shipped" | "delivered" | "cancelled";

const ITEMS_PER_PAGE = 15;

export default function OrderTable({ orders }: OrderTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | "all">("all");
  const [selectedStatusTab, setSelectedStatusTab] = useState<StatusTab>("all");
  const [sortField, setSortField] = useState<SortField>("mustShipBefore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // Calculate counts for each status
  const statusCounts = useMemo(() => {
    const counts = {
      all: 0,
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      returned: 0,
    };

    const filteredByPlatform = selectedPlatform === "all" 
      ? orders 
      : orders.filter(o => o.platform === selectedPlatform);

    filteredByPlatform.forEach((order) => {
      counts.all++;
      counts[order.status]++;
    });

    // Merge cancelled and returned
    counts.cancelled = counts.cancelled + counts.returned;

    return counts;
  }, [orders, selectedPlatform]);

  // Platform counts (TikTok & Tokopedia combined)
  const platformCounts = useMemo(() => {
    return {
      all: orders.length,
      shopee: orders.filter(o => o.platform === "shopee").length,
      tiktok: orders.filter(o => o.platform === "tiktok" || o.platform === "tokopedia").length,
    };
  }, [orders]);

  const filteredAndSortedOrders = useMemo(() => {
    let filtered = orders;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.orderNumber.toLowerCase().includes(query) ||
          order.customerName.toLowerCase().includes(query) ||
          order.productName.toLowerCase().includes(query) ||
          order.recipientName?.toLowerCase().includes(query) ||
          order.sku?.toLowerCase().includes(query) ||
          order.trackingNumber?.toLowerCase().includes(query)
      );
    }

    // Platform filter (TikTok & Tokopedia combined)
    if (selectedPlatform !== "all") {
      if (selectedPlatform === "tiktok") {
        filtered = filtered.filter((order) => order.platform === "tiktok" || order.platform === "tokopedia");
      } else {
        filtered = filtered.filter((order) => order.platform === selectedPlatform);
      }
    }

    // Status tab filter
    if (selectedStatusTab !== "all") {
      if (selectedStatusTab === "cancelled") {
        filtered = filtered.filter((order) => order.status === "cancelled" || order.status === "returned");
      } else {
        filtered = filtered.filter((order) => order.status === selectedStatusTab);
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "orderDate":
          comparison = new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
          break;
        case "mustShipBefore":
          const aShip = a.mustShipBefore ? new Date(a.mustShipBefore).getTime() : Infinity;
          const bShip = b.mustShipBefore ? new Date(b.mustShipBefore).getTime() : Infinity;
          comparison = aShip - bShip;
          break;
        case "totalAmount":
          comparison = a.totalAmount - b.totalAmount;
          break;
        case "customerName":
          comparison = a.customerName.localeCompare(b.customerName);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [orders, searchQuery, selectedPlatform, selectedStatusTab, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredAndSortedOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = filteredAndSortedOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  const getPlatformBadgeColor = (platform: Platform) => {
    const colors: Record<Platform, string> = {
      shopee: "bg-shopee-100 text-shopee-600",
      tiktok: "bg-slate-900 text-white",
      tokopedia: "bg-tokopedia-100 text-tokopedia-600",
    };
    return colors[platform];
  };

  const getShipDeadlineStatus = (mustShipBefore?: Date) => {
    if (!mustShipBefore) return null;
    
    const now = new Date();
    const deadline = new Date(mustShipBefore);
    
    if (isBefore(deadline, now)) {
      return { color: "text-red-600 bg-red-50", label: "Terlambat!", icon: AlertTriangle };
    }
    if (isBefore(deadline, addHours(now, 6))) {
      return { color: "text-orange-600 bg-orange-50", label: "Segera!", icon: Clock };
    }
    if (isBefore(deadline, addHours(now, 24))) {
      return { color: "text-yellow-600 bg-yellow-50", label: "Hari ini", icon: Clock };
    }
    return null;
  };

  // Status tabs configuration
  const statusTabs: { value: StatusTab; label: string; icon: any; color: string }[] = [
    { value: "all", label: "Semua", icon: Package, color: "text-slate-600" },
    { value: "pending", label: "Belum Bayar", icon: CreditCard, color: "text-yellow-600" },
    { value: "processing", label: "Perlu Dikirim", icon: Clock, color: "text-orange-600" },
    { value: "shipped", label: "Dikirim", icon: Truck, color: "text-blue-600" },
    { value: "delivered", label: "Selesai", icon: CheckCircle, color: "text-green-600" },
    { value: "cancelled", label: "Batal/Retur", icon: XCircle, color: "text-red-600" },
  ];

  // Platform tabs
  const platformTabs: { value: Platform | "all"; label: string; color: string }[] = [
    { value: "all", label: "Semua", color: "bg-slate-500" },
    { value: "shopee", label: "Shopee", color: "bg-shopee-500" },
    { value: "tiktok", label: "TikTok & Tokopedia", color: "bg-black" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Platform Tabs */}
      <div className="px-4 pt-4 border-b border-slate-100">
        <div className="flex gap-2 overflow-x-auto pb-3">
          {platformTabs.map((tab) => {
            const count = platformCounts[tab.value];
            const isActive = selectedPlatform === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setSelectedPlatform(tab.value);
                  setCurrentPage(1);
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                  isActive
                    ? `${tab.color} text-white shadow-md`
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {tab.label}
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-xs",
                  isActive ? "bg-white/20" : "bg-slate-200"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Tabs */}
      <div className="px-4 border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto">
          {statusTabs.map((tab) => {
            const count = statusCounts[tab.value];
            const isActive = selectedStatusTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setSelectedStatusTab(tab.value);
                  setCurrentPage(1);
                  if (tab.value === "processing") {
                    setSortField("mustShipBefore");
                    setSortDirection("asc");
                  }
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all",
                  isActive
                    ? `border-blue-500 ${tab.color}`
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-xs",
                  isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search and Info Bar */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-slate-600">
            Menampilkan <span className="font-semibold">{filteredAndSortedOrders.length}</span> pesanan
            {selectedStatusTab === "processing" && statusCounts.processing > 0 && (
              <span className="text-orange-600 ml-2">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Perlu segera diproses
              </span>
            )}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari order, customer, SKU, resi..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-80"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 text-center">
              Belum ada data order.
              <br />
              Import file Excel untuk memulai.
            </p>
          </div>
        ) : filteredAndSortedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 text-center">
              Tidak ada pesanan yang ditemukan.
              <br />
              Coba ubah filter atau kata kunci pencarian.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  No. Pesanan
                </th>
                <th
                  className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center justify-center gap-1">
                    Status
                    <SortIcon field="status" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Produk
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Qty
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("totalAmount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Total
                    <SortIcon field="totalAmount" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("customerName")}
                >
                  <div className="flex items-center gap-1">
                    Penerima
                    <SortIcon field="customerName" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Kurir / Resi
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("mustShipBefore")}
                >
                  <div className="flex items-center gap-1">
                    Batas Kirim
                    <SortIcon field="mustShipBefore" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedOrders.map((order) => {
                const deadlineStatus = getShipDeadlineStatus(order.mustShipBefore);
                
                return (
                  <tr
                    key={order.id}
                    className={cn(
                      "hover:bg-slate-50 transition-colors",
                      order.status === "processing" && deadlineStatus?.color.includes("red") && "bg-red-50/50"
                    )}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                          getPlatformBadgeColor(order.platform)
                        )}
                      >
                        {getPlatformName(order.platform)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800 font-mono">
                        {order.orderNumber}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatDate(order.orderDate)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex px-2.5 py-1 rounded-full text-xs font-medium",
                          getStatusColor(order.status)
                        )}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700 max-w-[200px] truncate" title={order.productName}>
                        {order.productName}
                      </p>
                      {order.variation && (
                        <p className="text-xs text-slate-400 truncate max-w-[200px]" title={order.variation}>
                          {order.variation}
                        </p>
                      )}
                      {order.sku && (
                        <p className="text-xs text-blue-500 font-mono">
                          SKU: {order.sku}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-medium text-slate-700">
                        {order.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-semibold text-slate-800">
                        {formatCurrency(order.totalAmount)}
                      </p>
                      {order.originalPrice && order.originalPrice !== order.price && (
                        <p className="text-xs text-slate-400 line-through">
                          {formatCurrency(order.originalPrice * order.quantity)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">
                        {order.recipientName || order.customerName}
                      </p>
                      {order.phone && (
                        <p className="text-xs text-slate-400">{order.phone}</p>
                      )}
                      {order.city && (
                        <p className="text-xs text-slate-400">{order.city}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">
                        {order.shippingOption || order.courier || "-"}
                      </p>
                      {order.trackingNumber && (
                        <p className="text-xs text-blue-600 font-mono">
                          {order.trackingNumber}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {order.mustShipBefore ? (
                        <div className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded text-xs",
                          deadlineStatus?.color || "text-slate-600"
                        )}>
                          {deadlineStatus?.icon && <deadlineStatus.icon className="w-3 h-3" />}
                          <span className="font-medium">
                            {formatDateTime(order.mustShipBefore)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
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
        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{" "}
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedOrders.length)}{" "}
            dari {filteredAndSortedOrders.length} pesanan
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                      currentPage === pageNum
                        ? "bg-blue-500 text-white"
                        : "hover:bg-slate-100 text-slate-600"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
