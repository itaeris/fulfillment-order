"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Loader2,
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
  Zap,
  PackageCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Order, Platform, OrderStatus } from "@/types/order";
import { cn, formatCurrency, formatDate, formatDateTime, formatNumber, getPlatformName, getStatusColor, getStatusLabel, isMarketplacePlatform } from "@/lib/utils";
import { isBefore, addHours } from "date-fns";
import type { UserRole } from "@/contexts/AuthContext";
import { TableSkeleton } from "@/components/Skeleton";
import ApiSyncBar, { type ApiSyncState } from "@/components/ApiSyncBar";
import { OrderDetailPreview } from "@/components/OrderDetailPreview";
import { hydrateOrders } from "@/lib/client-data";
import { groupOrdersByNumber, orderItems } from "@/lib/order-group";

interface OrderTableProps {
  orders: Order[];
  userRole: UserRole;
  isLoading?: boolean;
  isRefreshing?: boolean;
  apiSync: ApiSyncState;
}

type SortField = "platform" | "orderNumber" | "status" | "productName" | "quantity" | "totalAmount" | "customerName" | "trackingNumber" | "pickupTime" | "mustShipBefore" | "orderDate";
type SortDirection = "asc" | "desc";
type StatusTab = "all" | "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "returned";

type ShippingFilter = "all" | "instant" | "reguler";
type PickupStage = "all" | "before_pickup" | "after_pickup" | "ready_to_ship";
type TtsChannelFilter = "all" | "tts" | "tokopedia";

const ITEMS_PER_PAGE = 15;

const INSTANT_KEYWORDS = [
  "instant", "instan", "same day", "sameday", "same-day",
  "grab", "gojek", "gosend", "now", "ojol",
];

function classifyShipping(order: Order): "instant" | "reguler" {
  const text = [
    order.shippingOption,
    order.courier,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return INSTANT_KEYWORDS.some((kw) => text.includes(kw)) ? "instant" : "reguler";
}

function classifyPickupStage(order: Order): PickupStage {
  if (order.shippedTime || order.trackingNumber) return "ready_to_ship";
  if (order.pickupTime) return "after_pickup";
  return "before_pickup";
}

function ttsChannelOf(order: Order): Exclude<TtsChannelFilter, "all"> {
  if (order.platform === "tokopedia") return "tokopedia";
  const hint = [order.channelName, order.storeName].filter(Boolean).join(" ").toLowerCase();
  if (hint.includes("tiktok")) return "tts";
  if (hint.includes("tokopedia") || hint.includes("tokped")) return "tokopedia";
  return "tts";
}

function looksLikeOrderNumber(value: string) {
  const compact = value.replace(/[\s\-_.#]+/g, "");
  return compact.length >= 8 && /^[A-Za-z0-9]+$/.test(compact);
}

function OrderProductPreview({ order }: { order: Order }) {
  const items = orderItems(order);
  const first = items[0];
  return (
    <>
      <p className="text-xs sm:text-sm text-brand-700 whitespace-normal break-words">
        {first?.productName || order.productName}
      </p>
      {first?.variation ? (
        <p className="text-[10px] sm:text-xs text-brand-300 whitespace-normal break-words">
          {first.variation}
        </p>
      ) : null}
      {items.length > 1 ? (
        <p className="text-[10px] sm:text-xs text-brand-500 mt-0.5">
          +{items.length - 1} produk lain
        </p>
      ) : first?.sku || order.sku ? (
        <p className="text-[10px] sm:text-xs text-brand-500 font-mono break-all">
          SKU: {first?.sku || order.sku}
        </p>
      ) : null}
    </>
  );
}

function matchesSearch(order: Order, rawQuery: string) {
  const q = rawQuery.replace(/[\s\-_.#]+/g, "").toLowerCase();
  if (!q) return true;
  const hay = [
    order.orderNumber,
    order.customerName,
    order.productName,
    order.variation,
    order.sku,
    ...(order.items || []).flatMap((item) => [item.productName, item.variation, item.sku]),
    order.recipientName,
    order.trackingNumber,
    order.refNo,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/[\s\-_.#]+/g, "")
    .toLowerCase();
  return hay.includes(q);
}

function matchesPlatform(
  order: Order,
  selectedPlatform: Platform | "all",
  ttsChannelFilter: TtsChannelFilter
) {
  if (selectedPlatform === "all") return isMarketplacePlatform(order.platform);
  if (selectedPlatform === "tiktok") {
    if (order.platform !== "tiktok" && order.platform !== "tokopedia") return false;
    if (ttsChannelFilter !== "all" && ttsChannelOf(order) !== ttsChannelFilter) return false;
    return true;
  }
  return order.platform === selectedPlatform;
}

function isUnpaid(order: Order) {
  return order.status === "pending";
}

export default function OrderTable({
  orders,
  userRole,
  isLoading = false,
  isRefreshing = false,
  apiSync,
}: OrderTableProps) {
  const hideMoney = userRole === "warehouse";
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | "all">("all");
  const [ttsChannelFilter, setTtsChannelFilter] = useState<TtsChannelFilter>("all");
  const [selectedStatusTab, setSelectedStatusTab] = useState<StatusTab>("all");
  const [shippingFilter, setShippingFilter] = useState<ShippingFilter>("all");
  const [pickupStage, setPickupStage] = useState<PickupStage>("all");
  const [sortField, setSortField] = useState<SortField>("mustShipBefore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const [lookedUp, setLookedUp] = useState<Order[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const lookupReq = useRef(0);

  const catalog = useMemo(() => {
    const lookedKeys = new Set(
      lookedUp.map((order) => `${order.platform}:${String(order.orderNumber || "").toUpperCase()}`)
    );
    const kept =
      lookedUp.length === 0
        ? orders
        : orders.filter(
            (order) => !lookedKeys.has(`${order.platform}:${String(order.orderNumber || "").toUpperCase()}`)
          );
    return groupOrdersByNumber(lookedUp.length === 0 ? orders : [...kept, ...lookedUp]);
  }, [orders, lookedUp]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!looksLikeOrderNumber(q)) {
      lookupReq.current += 1;
      setLookedUp([]);
      setLookingUp(false);
      return;
    }

    const compact = q.replace(/[\s\-_.#]+/g, "");
    const req = ++lookupReq.current;
    const timer = window.setTimeout(async () => {
      setLookingUp(true);
      try {
        const res = await fetch(`/api/orders/lookup?q=${encodeURIComponent(compact)}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({ orders: [] }))) as { orders?: Order[] };
        if (req !== lookupReq.current) return;
        setLookedUp(hydrateOrders(Array.isArray(data.orders) ? data.orders : []));
      } catch {
        if (req !== lookupReq.current) return;
        setLookedUp([]);
      } finally {
        if (req === lookupReq.current) setLookingUp(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

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

    const inPlatform = catalog.filter((o) =>
      matchesPlatform(o, selectedPlatform, ttsChannelFilter)
    );

    inPlatform.forEach((order) => {
      if (isUnpaid(order)) {
        counts.pending++;
        return;
      }
      counts.all++;
      if (order.status === "processing") counts.processing++;
      else if (order.status === "shipped") counts.shipped++;
      else if (order.status === "delivered") counts.delivered++;
      else if (order.status === "cancelled") counts.cancelled++;
      else if (order.status === "returned") counts.returned++;
    });

    return counts;
  }, [catalog, selectedPlatform, ttsChannelFilter]);

  // Shipping type counts (for "processing" and "shipped" tabs)
  const shippingCounts = useMemo(() => {
    const targetStatus = selectedStatusTab === "shipped" ? "shipped" : "processing";
    const baseOrders = catalog
      .filter((o) => matchesPlatform(o, selectedPlatform, ttsChannelFilter))
      .filter((o) => o.status === targetStatus);

    return {
      all: baseOrders.length,
      instant: baseOrders.filter((o) => classifyShipping(o) === "instant").length,
      reguler: baseOrders.filter((o) => classifyShipping(o) === "reguler").length,
    };
  }, [catalog, selectedPlatform, selectedStatusTab, ttsChannelFilter]);

  const pickupStageCounts = useMemo(() => {
    const targetStatus = selectedStatusTab === "shipped" ? "shipped" : "processing";
    const baseOrders = catalog
      .filter((o) => matchesPlatform(o, selectedPlatform, ttsChannelFilter))
      .filter((o) => o.status === targetStatus);

    const regulerOrders = baseOrders.filter((o) => classifyShipping(o) === "reguler");

    return {
      all: regulerOrders.length,
      before_pickup: regulerOrders.filter(o => classifyPickupStage(o) === "before_pickup").length,
      after_pickup: regulerOrders.filter(o => classifyPickupStage(o) === "after_pickup").length,
      ready_to_ship: regulerOrders.filter(o => classifyPickupStage(o) === "ready_to_ship").length,
    };
  }, [catalog, selectedPlatform, selectedStatusTab, ttsChannelFilter]);

  const platformCounts: Record<string, number> = useMemo(() => {
    const paid = catalog.filter((o) => !isUnpaid(o));
    return {
      all: paid.filter((o) => isMarketplacePlatform(o.platform)).length,
      shopee: paid.filter(o => o.platform === "shopee").length,
      tiktok: paid.filter(o => o.platform === "tiktok" || o.platform === "tokopedia").length,
      jubelio: paid.filter(o => o.platform === "jubelio").length,
    };
  }, [catalog]);

  const ttsChannelCounts = useMemo(() => {
    const ttsOrders = catalog.filter((o) => (o.platform === "tiktok" || o.platform === "tokopedia") && !isUnpaid(o));
    return {
      all: ttsOrders.length,
      tts: ttsOrders.filter((o) => ttsChannelOf(o) === "tts").length,
      tokopedia: ttsOrders.filter((o) => ttsChannelOf(o) === "tokopedia").length,
    };
  }, [catalog]);

  const filteredAndSortedOrders = useMemo(() => {
    let filtered = catalog;
    const querying = Boolean(searchQuery.trim());
    const snQuery = looksLikeOrderNumber(searchQuery);

    if (querying) {
      filtered = filtered.filter((order) => matchesSearch(order, searchQuery));
      if (!snQuery) {
        filtered = filtered.filter((order) =>
          matchesPlatform(order, selectedPlatform, ttsChannelFilter)
        );
        if (selectedStatusTab === "pending") {
          filtered = filtered.filter(isUnpaid);
        } else {
          filtered = filtered.filter((order) => !isUnpaid(order));
        }
      }
    } else {
      filtered = filtered.filter((order) =>
        matchesPlatform(order, selectedPlatform, ttsChannelFilter)
      );

      if (selectedStatusTab === "pending") {
        filtered = filtered.filter(isUnpaid);
      } else {
        filtered = filtered.filter((order) => !isUnpaid(order));
        if (selectedStatusTab !== "all") {
          filtered = filtered.filter((order) => order.status === selectedStatusTab);
        }
      }

      if ((selectedStatusTab === "processing" || selectedStatusTab === "shipped") && shippingFilter !== "all") {
        filtered = filtered.filter((order) => classifyShipping(order) === shippingFilter);
      }

      if (
        (selectedStatusTab === "processing" || selectedStatusTab === "shipped") &&
        shippingFilter === "reguler" &&
        pickupStage !== "all"
      ) {
        filtered = filtered.filter((order) => classifyPickupStage(order) === pickupStage);
      }
    }

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "platform":
          comparison = (a.platform || "").localeCompare(b.platform || "");
          break;
        case "orderNumber":
          comparison = (a.orderNumber || "").localeCompare(b.orderNumber || "");
          break;
        case "status":
          comparison = (a.status || "").localeCompare(b.status || "");
          break;
        case "productName":
          comparison = (a.productName || "").localeCompare(b.productName || "");
          break;
        case "quantity":
          comparison = (a.quantity || 0) - (b.quantity || 0);
          break;
        case "totalAmount":
          comparison = (a.totalAmount || 0) - (b.totalAmount || 0);
          break;
        case "customerName":
          comparison = (a.customerName || "").localeCompare(b.customerName || "");
          break;
        case "trackingNumber":
          comparison = (a.trackingNumber || "").localeCompare(b.trackingNumber || "");
          break;
        case "pickupTime": {
          const aT = a.pickupTime ? new Date(a.pickupTime).getTime() : Infinity;
          const bT = b.pickupTime ? new Date(b.pickupTime).getTime() : Infinity;
          comparison = aT - bT;
          break;
        }
        case "mustShipBefore": {
          const aShip = a.mustShipBefore ? new Date(a.mustShipBefore).getTime() : Infinity;
          const bShip = b.mustShipBefore ? new Date(b.mustShipBefore).getTime() : Infinity;
          comparison = aShip - bShip;
          break;
        }
        case "orderDate":
          comparison = new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [catalog, searchQuery, selectedPlatform, ttsChannelFilter, selectedStatusTab, shippingFilter, pickupStage, sortField, sortDirection]);

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
    if (sortField !== field) {
      return <ChevronDown className="w-3 h-3 opacity-30" />;
    }
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 text-brand-700" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-brand-700" />
    );
  };

  const getPlatformBadgeColor = (platform: Platform) => {
    const colors: Record<Platform, string> = {
      shopee: "bg-shopee-100 text-shopee-600",
      tiktok: "bg-brand-100 text-brand-800",
      tokopedia: "bg-brand-100 text-brand-800",
      jubelio: "bg-brand-100 text-brand-600",
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

  const statusTabs: { value: StatusTab; label: string; icon: any; color: string }[] = [
    { value: "all", label: "Semua", icon: Package, color: "text-brand-700" },
    { value: "pending", label: "Belum Bayar", icon: CreditCard, color: "text-yellow-600" },
    { value: "processing", label: "Perlu Dikirim", icon: Clock, color: "text-orange-600" },
    { value: "shipped", label: "Dikirim", icon: Truck, color: "text-blue-600" },
    { value: "delivered", label: "Selesai", icon: CheckCircle, color: "text-green-600" },
    { value: "cancelled", label: "Batal", icon: XCircle, color: "text-red-600" },
    { value: "returned", label: "Retur", icon: RotateCcw, color: "text-stone-600" },
  ];

  const platformTabs: { value: Platform | "all"; label: string; color: string }[] = [
    { value: "all", label: "Channel", color: "bg-brand-400" },
    { value: "shopee", label: "Shopee", color: "bg-shopee-500" },
    { value: "tiktok", label: "TikTok & Tokopedia", color: "bg-brand-800" },
    { value: "jubelio", label: "Jubelio (cermin)", color: "bg-brand-500" },
  ];

  const unpaidView = selectedStatusTab === "pending";
  const unpaidTotal = unpaidView
    ? filteredAndSortedOrders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0)
    : 0;

  const showSyncSkeleton = (isLoading || isRefreshing) && orders.length === 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-brand-200">
      <div className="px-3 sm:px-4 pt-3 sm:pt-4">
        <ApiSyncBar
          {...apiSync}
          hint="Tab Channel = Shopee + TikTok/Tokped yang sudah bayar. Jubelio adalah cermin gudang (nomor SP-), jangan dijumlah ke Channel. Angka Komparasi beda karena di sana semua status dan barisnya pasangan SN vs Jubelio."
        />
      </div>

      {showSyncSkeleton ? (
        <div className="p-3 sm:p-4">
          <TableSkeleton rows={8} columns={6} showFilters={false} embedded />
        </div>
      ) : (
        <>
      {/* Platform Tabs */}
      <div className="px-3 sm:px-4 pt-3 sm:pt-4 border-b border-brand-100">
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-3 scrollbar-hide min-w-0">
          {platformTabs.map((tab) => {
            const count = platformCounts[tab.value];
            const isActive = selectedPlatform === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setSelectedPlatform(tab.value);
                  setTtsChannelFilter("all");
                  setCurrentPage(1);
                }}
                className={cn(
                  "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all shrink-0",
                  isActive
                    ? `${tab.color} text-white shadow-md`
                    : "bg-cream-200 text-brand-400 hover:bg-cream-300"
                )}
              >
                {tab.label}
                <span className={cn(
                  "px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs",
                  isActive ? "bg-white/20" : "bg-brand-200 text-brand-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-brand-400 pb-3">
          Channel = Shopee + TikTok/Tokped, sudah bayar, 1 nomor = 1 baris. Jubelio (cermin) pakai nomor SP- sendiri — bukan sales, jangan dijumlah ke Channel.
        </p>
        {selectedPlatform === "tiktok" && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pb-3">
            <span className="text-[10px] sm:text-xs font-medium text-brand-400 mr-0.5">Platform:</span>
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
      </div>

      {/* Status Tabs */}
      <div className="px-3 sm:px-4 border-b border-brand-200">
        <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide min-w-0">
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
                  if (tab.value !== "processing" && tab.value !== "shipped") {
                    setShippingFilter("all");
                  }
                  setPickupStage("all");
                }}
                className={cn(
                  "flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-all shrink-0",
                  isActive
                    ? `border-brand-500 ${tab.color}`
                    : "border-transparent text-brand-300 hover:text-brand-500"
                )}
              >
                <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                {tab.label}
                <span className={cn(
                  "px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs",
                  isActive ? "bg-brand-100 text-brand-700" : "bg-cream-200 text-brand-400"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Shipping Type Filter (visible on "Perlu Dikirim" and "Dikirim") */}
      {(selectedStatusTab === "processing" || selectedStatusTab === "shipped") && (
        <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-brand-100 flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-[10px] sm:text-xs font-medium text-brand-400 mr-0.5 sm:mr-1">Tipe Pengiriman:</span>
          {([
            { value: "all" as ShippingFilter, label: "Semua", icon: Package },
            { value: "instant" as ShippingFilter, label: "Instant", icon: Zap },
            { value: "reguler" as ShippingFilter, label: "Reguler", icon: PackageCheck },
          ]).map((item) => {
            const isActive = shippingFilter === item.value;
            const count = shippingCounts[item.value];
            return (
              <button
                key={item.value}
                onClick={() => {
                  setShippingFilter(item.value);
                  setPickupStage("all");
                  setCurrentPage(1);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                  isActive
                    ? "bg-brand-500 text-white shadow-sm"
                    : "bg-cream-200 text-brand-400 hover:bg-cream-300"
                )}
              >
                <item.icon className="w-3 h-3" />
                {item.label}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px]",
                  isActive ? "bg-white/20" : "bg-brand-200 text-brand-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Pickup Stage Filter (visible when Reguler is selected on processing/shipped) */}
      {(selectedStatusTab === "processing" || selectedStatusTab === "shipped") && shippingFilter === "reguler" && (
        <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-brand-100 flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-[10px] sm:text-xs font-medium text-brand-400 mr-0.5 sm:mr-1">Status Pickup:</span>
          {([
            { value: "all" as PickupStage, label: "Semua", icon: Package },
            { value: "before_pickup" as PickupStage, label: "Sebelum Pickup", icon: ArrowDownToLine },
            { value: "after_pickup" as PickupStage, label: "Sesudah Pickup", icon: ArrowUpFromLine },
            { value: "ready_to_ship" as PickupStage, label: "Siap Dikirim", icon: Send },
          ]).map((item) => {
            const isActive = pickupStage === item.value;
            const count = pickupStageCounts[item.value];
            return (
              <button
                key={item.value}
                onClick={() => {
                  setPickupStage(item.value);
                  setCurrentPage(1);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                  isActive
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-cream-200 text-brand-400 hover:bg-cream-300"
                )}
              >
                <item.icon className="w-3 h-3" />
                {item.label}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px]",
                  isActive ? "bg-white/20" : "bg-brand-200 text-brand-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search and Info Bar */}
      <div className="p-3 sm:p-4 border-b border-brand-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <div>
          <p className="text-xs sm:text-sm text-brand-400">
            <span className="font-semibold text-brand-700">{formatNumber(filteredAndSortedOrders.length)}</span>{" "}
            {selectedPlatform === "jubelio"
              ? "cermin Jubelio"
              : selectedPlatform === "all"
                ? "pesanan channel"
                : "pesanan"}
            {unpaidView && (
              <span className="ml-2 font-semibold text-yellow-700">
                · {formatCurrency(unpaidTotal)}
              </span>
            )}
            {selectedStatusTab === "processing" && statusCounts.processing > 0 && (
              <span className="text-orange-600 ml-2">
                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />
                <span className="hidden sm:inline">Perlu segera diproses</span>
                <span className="sm:hidden">Segera proses</span>
              </span>
            )}
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-300" />
          <input
            type="text"
            placeholder="Cari nomor order, customer, SKU..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 pr-10 py-2 border border-brand-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent w-full sm:w-80 bg-cream-50 text-brand-700 placeholder:text-brand-300"
          />
          {lookingUp && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400 animate-spin" />
          )}
        </div>
      </div>

      {/* Table (desktop) / Cards (mobile) */}
      <div>
        <AnimatePresence mode="wait">
        {catalog.length === 0 && !lookingUp ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-brand-300" />
            </div>
            <p className="text-brand-400 text-center">
              Belum ada pesanan.
              <br />
              Klik Ambil data Shopee, TikTok, atau Jubelio di atas.
            </p>
          </motion.div>
        ) : filteredAndSortedOrders.length === 0 ? (
          <motion.div key="no-results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mb-4">
              {lookingUp ? (
                <Loader2 className="w-8 h-8 text-brand-300 animate-spin" />
              ) : (
                <Search className="w-8 h-8 text-brand-300" />
              )}
            </div>
            <p className="text-brand-400 text-center">
              {lookingUp ? (
                <>
                  Mencari pesanan di Shopee...
                  <br />
                  Order batal ikut dicek dari nomor order.
                </>
              ) : (
                <>
                  Tidak ada pesanan yang ditemukan.
                  <br />
                  {searchQuery.trim()
                    ? "Tempel nomor order lengkap. Order batal ikut dicari, tidak tergantung tab status."
                    : "Coba ubah filter atau kata kunci pencarian."}
                </>
              )}
            </p>
          </motion.div>
        ) : (
          <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="md:hidden divide-y divide-cream-200">
            {paginatedOrders.map((order) => {
              const deadlineStatus = getShipDeadlineStatus(order.mustShipBefore);
              return (
                <article
                  key={order.id}
                  onClick={() => setPreviewOrder(order)}
                  className={cn(
                    "p-3 space-y-2 cursor-pointer",
                    order.status === "processing" && deadlineStatus?.color.includes("red") && "bg-red-50/50",
                    previewOrder?.id === order.id && "bg-brand-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap",
                        getPlatformBadgeColor(order.platform)
                      )}
                    >
                      {getPlatformName(order.platform)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium",
                        getStatusColor(order.status)
                      )}
                    >
                      {getStatusLabel(order.status)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-brand-800 font-mono break-all leading-snug">
                    {order.orderNumber}
                  </p>
                  {unpaidView ? (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium",
                          getStatusColor(order.status)
                        )}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                      <span className="font-semibold text-brand-800">
                        {formatCurrency(order.totalAmount)}
                      </span>
                    </div>
                  ) : (
                    <>
                  <OrderProductPreview order={order} />
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-brand-500">
                    <span>Qty {order.quantity}</span>
                    {!hideMoney && (
                      <span className="font-semibold text-brand-800">
                        {formatCurrency(order.totalAmount)}
                      </span>
                    )}
                    <span>{order.recipientName || order.customerName}</span>
                  </div>
                  <div className="text-xs text-brand-400">
                    {order.shippingOption || order.courier || "Kurir -"}
                    {order.trackingNumber ? ` · ${order.trackingNumber}` : ""}
                  </div>
                  {order.mustShipBefore ? (
                    <div
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 rounded text-xs",
                        deadlineStatus?.color || "text-brand-400 bg-cream-100"
                      )}
                    >
                      {deadlineStatus?.icon && <deadlineStatus.icon className="w-3 h-3" />}
                      <span>Batas {formatDateTime(order.mustShipBefore)}</span>
                    </div>
                  ) : null}
                    </>
                  )}
                </article>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
          <table className={cn("w-full", unpaidView ? "min-w-[520px]" : "min-w-[800px]")}>
            <thead className="bg-cream-100">
              <tr>
                <th
                  className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                  onClick={() => handleSort("platform")}
                >
                  <div className="flex items-center gap-1">
                    Platform <SortIcon field="platform" />
                  </div>
                </th>
                <th
                  className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                  onClick={() => handleSort("orderNumber")}
                >
                  <div className="flex items-center gap-1">
                    No. Pesanan <SortIcon field="orderNumber" />
                  </div>
                </th>
                <th
                  className="px-3 sm:px-4 py-2.5 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center justify-center gap-1">
                    Status <SortIcon field="status" />
                  </div>
                </th>
                {unpaidView && (
                  <th
                    className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                    onClick={() => handleSort("totalAmount")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Harga <SortIcon field="totalAmount" />
                    </div>
                  </th>
                )}
                {!unpaidView && (
                  <>
                    <th
                      className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                      onClick={() => handleSort("productName")}
                    >
                      <div className="flex items-center gap-1">
                        Produk <SortIcon field="productName" />
                      </div>
                    </th>
                    <th
                      className="px-3 sm:px-4 py-2.5 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                      onClick={() => handleSort("quantity")}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Qty <SortIcon field="quantity" />
                      </div>
                    </th>
                    {!hideMoney && (
                      <th
                        className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                        onClick={() => handleSort("totalAmount")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Total <SortIcon field="totalAmount" />
                        </div>
                      </th>
                    )}
                    <th
                      className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                      onClick={() => handleSort("customerName")}
                    >
                      <div className="flex items-center gap-1">
                        Penerima <SortIcon field="customerName" />
                      </div>
                    </th>
                    <th
                      className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                      onClick={() => handleSort("trackingNumber")}
                    >
                      <div className="flex items-center gap-1">
                        Kurir / Resi <SortIcon field="trackingNumber" />
                      </div>
                    </th>
                    {(selectedStatusTab === "processing" || selectedStatusTab === "shipped") && (
                      <th
                        className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                        onClick={() => handleSort("pickupTime")}
                      >
                        <div className="flex items-center gap-1">
                          Waktu Pickup <SortIcon field="pickupTime" />
                        </div>
                      </th>
                    )}
                    <th
                      className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none"
                      onClick={() => handleSort("mustShipBefore")}
                    >
                      <div className="flex items-center gap-1">
                        Batas Kirim <SortIcon field="mustShipBefore" />
                      </div>
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {paginatedOrders.map((order) => {
                const deadlineStatus = getShipDeadlineStatus(order.mustShipBefore);
                
                return (
                  <tr
                    key={order.id}
                    onClick={() => setPreviewOrder(order)}
                    className={cn(
                      "hover:bg-cream-50 transition-colors cursor-pointer",
                      order.status === "processing" && deadlineStatus?.color.includes("red") && "bg-red-50/50",
                      previewOrder?.id === order.id && "bg-brand-50"
                    )}
                  >
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                      <span
                        className={cn(
                          "inline-flex px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap",
                          getPlatformBadgeColor(order.platform)
                        )}
                      >
                        {getPlatformName(order.platform)}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                      <p className="text-xs sm:text-sm font-medium text-brand-800 font-mono">
                        {order.orderNumber}
                      </p>
                      <p className="text-[10px] sm:text-xs text-brand-300 mt-0.5">
                        {formatDate(order.orderDate)}
                      </p>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium",
                          getStatusColor(order.status)
                        )}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    {unpaidView && (
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right">
                        <p className="text-xs sm:text-sm font-semibold text-brand-800">
                          {formatCurrency(order.totalAmount)}
                        </p>
                      </td>
                    )}
                    {!unpaidView && (
                      <>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                      <OrderProductPreview order={order} />
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-center">
                      <span className="text-xs sm:text-sm font-medium text-brand-700">
                        {order.quantity}
                      </span>
                    </td>
                    {!hideMoney && (
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right">
                        <p className="text-xs sm:text-sm font-semibold text-brand-800">
                          {formatCurrency(order.totalAmount)}
                        </p>
                        {order.originalPrice && order.originalPrice !== order.price && (
                          <p className="text-[10px] sm:text-xs text-brand-300 line-through">
                            {formatCurrency(order.originalPrice * order.quantity)}
                          </p>
                        )}
                      </td>
                    )}
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                      <p className="text-xs sm:text-sm text-brand-700">
                        {order.recipientName || order.customerName}
                      </p>
                      {order.phone && (
                        <p className="text-[10px] sm:text-xs text-brand-300">{order.phone}</p>
                      )}
                      {order.city && (
                        <p className="text-[10px] sm:text-xs text-brand-300">{order.city}</p>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                      <p className="text-xs sm:text-sm text-brand-700">
                        {order.shippingOption || order.courier || "-"}
                      </p>
                      {order.trackingNumber && (
                        <p className="text-[10px] sm:text-xs text-brand-500 font-mono">
                          {order.trackingNumber}
                        </p>
                      )}
                    </td>
                    {(selectedStatusTab === "processing" || selectedStatusTab === "shipped") && (
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                        {order.pickupTime ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-brand-700">
                              {formatDateTime(order.pickupTime)}
                            </span>
                            <span className={cn(
                              "inline-flex items-center gap-1 text-[10px] font-medium",
                              classifyPickupStage(order) === "ready_to_ship"
                                ? "text-green-600"
                                : classifyPickupStage(order) === "after_pickup"
                                  ? "text-blue-600"
                                  : "text-orange-500"
                            )}>
                              {classifyPickupStage(order) === "ready_to_ship" && <Send className="w-2.5 h-2.5" />}
                              {classifyPickupStage(order) === "after_pickup" && <ArrowUpFromLine className="w-2.5 h-2.5" />}
                              {classifyPickupStage(order) === "before_pickup" && <ArrowDownToLine className="w-2.5 h-2.5" />}
                              {classifyPickupStage(order) === "ready_to_ship"
                                ? "Siap Dikirim"
                                : classifyPickupStage(order) === "after_pickup"
                                  ? "Sudah Pickup"
                                  : "Belum Pickup"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-brand-300">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                      {order.mustShipBefore ? (
                        <div className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded text-xs",
                          deadlineStatus?.color || "text-brand-400"
                        )}>
                          {deadlineStatus?.icon && <deadlineStatus.icon className="w-3 h-3" />}
                          <span className="font-medium">
                            {formatDateTime(order.mustShipBefore)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-brand-300">-</span>
                      )}
                    </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-3 sm:px-5 py-3 sm:py-4 border-t border-brand-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs sm:text-sm text-brand-400 order-2 sm:order-1">
            {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedOrders.length)}{" "}
            dari {filteredAndSortedOrders.length}
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
                      "w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs sm:text-sm font-medium transition-colors",
                      currentPage === pageNum
                        ? "bg-brand-500 text-white"
                        : "hover:bg-cream-200 text-brand-400"
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
              className="p-1.5 sm:p-2 rounded-lg border border-brand-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cream-100"
            >
              <ChevronRight className="w-4 h-4 text-brand-400" />
            </button>
          </div>
        </div>
      )}
        </>
      )}
      <OrderDetailPreview
        open={!!previewOrder}
        onClose={() => setPreviewOrder(null)}
        title={previewOrder?.orderNumber || "Detail pesanan"}
        hideMoney={hideMoney}
        sections={previewOrder ? [{ label: getPlatformName(previewOrder.platform), order: previewOrder }] : []}
      />
    </div>
  );
}
