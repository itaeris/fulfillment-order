"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowRightLeft,
  Package,
  ShoppingBag,
} from "lucide-react";
import { motion } from "framer-motion";
import { Order } from "@/types/order";
import { cn, formatNumber, getStatusLabel } from "@/lib/utils";
import type { UserRole } from "@/contexts/AuthContext";
import { CardsSkeleton, TableSkeleton } from "@/components/Skeleton";
import ApiSyncBar, { type ApiSyncState } from "@/components/ApiSyncBar";
import { OrderDetailPreview } from "@/components/OrderDetailPreview";
import { DayPicker } from "@/components/DayPicker";
import {
  formatDayKeyLabel,
  formatDueLabel,
  isMarketplaceShipOnDate,
  jubelioMenuBadge,
  parseJubelioMenu,
  todayKey,
  warehouseEffectiveDue,
  type JubelioMenu,
} from "@/lib/due-date";
import { orderNumberKeys, trackingKeys } from "@/lib/order-match";
import { groupOrdersByNumber } from "@/lib/order-group";

interface ComparisonViewProps {
  orders: Order[];
  userRole: UserRole;
  apiSync: ApiSyncState;
  isRefreshing?: boolean;
}

type MatchStatus = "matched" | "penjualan" | "jubelio_only" | "platform_only";
type FilterTab = "all" | "matched" | "jubelio_only" | "platform_only" | "ship_today";
type CompSortField = "status" | "orderNumber" | "matchedBy" | "customer" | "qty" | "courier" | "due" | "menu";
type CompSortDir = "asc" | "desc";

interface ComparisonRow {
  orderNumber: string;
  matchedBy: string;
  status: MatchStatus;
  jubelioOrder?: Order;
  platformOrder?: Order;
  jubelioMenu: JubelioMenu | null;
  qty: number;
}

const ITEMS_PER_PAGE = 20;

function indexOrdersByKeys(orders: Order[], keysOf: (order: Order) => string[]) {
  const map = new Map<string, Order[]>();
  for (const order of orders) {
    for (const key of keysOf(order)) {
      const list = map.get(key);
      if (list) list.push(order);
      else map.set(key, [order]);
    }
  }
  return map;
}

function comparisonOf(jOrder: Order, pOrder: Order, matchedBy: string): ComparisonRow {
  const menu = parseJubelioMenu(jOrder);
  return {
    orderNumber: pOrder.orderNumber || jOrder.refNo || jOrder.orderNumber,
    matchedBy,
    status: menu === "penjualan" ? "penjualan" : "matched",
    jubelioOrder: jOrder,
    platformOrder: pOrder,
    jubelioMenu: menu,
    qty: pOrder.quantity || jOrder.quantity || 1,
  };
}

type MarketplaceFilter = "all" | "tiktok" | "shopee";
type TtsChannelFilter = "all" | "tts" | "tokopedia";
type ShippingFilter = "all" | "instant" | "reguler";

const INSTANT_KEYWORDS = [
  "instant", "instan", "same day", "sameday", "same-day",
  "grab", "gojek", "gosend", "now", "ojol",
];

function classifyShipping(order?: Order): Exclude<ShippingFilter, "all"> {
  if (!order) return "reguler";
  const text = [order.shippingOption, order.courier].filter(Boolean).join(" ").toLowerCase();
  return INSTANT_KEYWORDS.some((kw) => text.includes(kw)) ? "instant" : "reguler";
}

function marketplaceOf(order?: Order): Exclude<MarketplaceFilter, "all"> {
  if (!order) return "tiktok";
  if (order.platform === "shopee") return "shopee";
  return "tiktok";
}

function ttsChannelOf(order?: Order): Exclude<TtsChannelFilter, "all"> {
  if (!order) return "tts";
  if (order.platform === "tokopedia") return "tokopedia";
  const hint = [order.channelName, order.storeName].filter(Boolean).join(" ").toLowerCase();
  if (hint.includes("tokopedia") || hint.includes("tokped")) return "tokopedia";
  return "tts";
}

function marketplaceLabel(order?: Order): string {
  if (!order) return "-";
  if (order.platform === "shopee") return "Shopee";
  return ttsChannelOf(order) === "tokopedia" ? "Tokopedia" : "TikTok Shop by Tokopedia";
}

function rowDue(row: ComparisonRow) {
  const order = row.platformOrder || row.jubelioOrder;
  return order ? warehouseEffectiveDue(order) || order.mustShipBefore : undefined;
}

export default function ComparisonView({ orders, userRole, apiSync, isRefreshing = false }: ComparisonViewProps) {
  const hideMoney = true;
  void userRole;
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState<MarketplaceFilter>("all");
  const [ttsChannelFilter, setTtsChannelFilter] = useState<TtsChannelFilter>("all");
  const [shippingFilter, setShippingFilter] = useState<ShippingFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<CompSortField>("status");
  const [sortDir, setSortDir] = useState<CompSortDir>("asc");
  const [previewRow, setPreviewRow] = useState<ComparisonRow | null>(null);
  const [shipDate, setShipDate] = useState(() => todayKey());
  const today = todayKey();
  const shipDateIsToday = shipDate === today;

  const setSelectedShipDate = (next: string) => {
    setShipDate(next);
    setFilterTab("ship_today");
    setMarketplaceFilter("all");
    setTtsChannelFilter("all");
    setShippingFilter("all");
    setCurrentPage(1);
  };

  const { rows, summary } = useMemo(() => {
    const grouped = groupOrdersByNumber(orders);
    const jubelioOrders = grouped.filter((o) => o.platform === "jubelio");
    const platformOrders = grouped.filter(
      (o) => o.platform === "shopee" || o.platform === "tiktok" || o.platform === "tokopedia"
    );

    const byOrderNumber = indexOrdersByKeys(platformOrders, orderNumberKeys);
    const byTracking = indexOrdersByKeys(platformOrders, trackingKeys);

    const matched = new Map<string, ComparisonRow>();
    const matchedJubelioIds = new Set<string>();
    const matchedPlatformIds = new Set<string>();

    const pairAll = (jOrder: Order, candidates: Order[], matchedBy: string) => {
      let hit = false;
      for (const pOrder of candidates) {
        if (matchedPlatformIds.has(pOrder.id)) continue;
        matched.set(`${jOrder.id}-${pOrder.id}`, comparisonOf(jOrder, pOrder, matchedBy));
        matchedJubelioIds.add(jOrder.id);
        matchedPlatformIds.add(pOrder.id);
        hit = true;
      }
      return hit;
    };

    for (const jOrder of jubelioOrders) {
      if (orderNumberKeys(jOrder).some((key) => pairAll(jOrder, byOrderNumber.get(key) || [], "No. pesanan / source"))) {
        continue;
      }
      trackingKeys(jOrder).some((key) => pairAll(jOrder, byTracking.get(key) || [], "Resi"));
    }

    const comparisonRows: ComparisonRow[] = Array.from(matched.values());
    let jubelioOnlyCount = 0;
    let platformOnlyCount = 0;

    for (const jOrder of jubelioOrders) {
      if (matchedJubelioIds.has(jOrder.id)) continue;
      jubelioOnlyCount += 1;
      comparisonRows.push({
        orderNumber: jOrder.refNo || jOrder.orderNumber,
        matchedBy: "-",
        status: "jubelio_only",
        jubelioOrder: jOrder,
        jubelioMenu: parseJubelioMenu(jOrder),
        qty: jOrder.quantity || 1,
      });
    }

    for (const pOrder of platformOrders) {
      if (matchedPlatformIds.has(pOrder.id)) continue;
      platformOnlyCount += 1;
      comparisonRows.push({
        orderNumber: pOrder.orderNumber,
        matchedBy: "-",
        status: "platform_only",
        platformOrder: pOrder,
        jubelioMenu: null,
        qty: pOrder.quantity || 1,
      });
    }

    const statusOrder: MatchStatus[] = ["platform_only", "penjualan", "jubelio_only", "matched"];
    comparisonRows.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));

    let mirroredCount = 0;
    let penjualanCount = 0;
    for (const row of comparisonRows) {
      if (row.status === "matched") mirroredCount += 1;
      else if (row.status === "penjualan") penjualanCount += 1;
    }

    return {
      rows: comparisonRows,
      summary: {
        total: comparisonRows.length,
        matched: mirroredCount,
        penjualan: penjualanCount,
        jubelioOnly: jubelioOnlyCount,
        platformOnly: platformOnlyCount,
        jubelioCount: jubelioOrders.length,
        platformCount: platformOrders.length,
        shopeeCount: platformOrders.filter((order) => order.platform === "shopee").length,
        tiktokCount: platformOrders.filter((order) => order.platform === "tiktok" || order.platform === "tokopedia").length,
      },
    };
  }, [orders]);

  const shipTodayCount = useMemo(
    () =>
      rows.filter(
        (row) => row.platformOrder && isMarketplaceShipOnDate(row.platformOrder, shipDate)
      ).length,
    [rows, shipDate]
  );

  const filteredRows = useMemo(() => {
    let result = rows;

    if (filterTab !== "all" && filterTab !== "ship_today") {
      result = result.filter((r) => r.status === filterTab);
    }

    if (filterTab === "ship_today") {
      result = result.filter(
        (r) => r.platformOrder && isMarketplaceShipOnDate(r.platformOrder, shipDate)
      );
    }

    if (marketplaceFilter !== "all") {
      result = result.filter((r) => r.platformOrder && marketplaceOf(r.platformOrder) === marketplaceFilter);
    }

    if (marketplaceFilter === "tiktok" && ttsChannelFilter !== "all") {
      result = result.filter((r) => ttsChannelOf(r.platformOrder) === ttsChannelFilter);
    }

    if (filterTab === "ship_today" && shippingFilter !== "all") {
      result = result.filter((r) => classifyShipping(r.platformOrder) === shippingFilter);
    }

    if (searchQuery) {
      const q = searchQuery.replace(/[\s\-_.#]+/g, "").toLowerCase();
      result = result.filter((r) => {
        const hay = [
          r.orderNumber,
          r.jubelioOrder?.orderNumber,
          r.jubelioOrder?.refNo,
          r.platformOrder?.orderNumber,
          r.jubelioOrder?.customerName,
          r.platformOrder?.customerName,
          r.jubelioOrder?.trackingNumber,
          r.platformOrder?.trackingNumber,
          r.platformOrder?.courier,
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/[\s\-_.#]+/g, "")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "status": {
          const order: MatchStatus[] = ["platform_only", "penjualan", "jubelio_only", "matched"];
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
        case "qty":
          cmp = a.qty - b.qty;
          break;
        case "courier":
          cmp = (a.platformOrder?.courier || a.jubelioOrder?.courier || "").localeCompare(
            b.platformOrder?.courier || b.jubelioOrder?.courier || ""
          );
          break;
        case "due": {
          const aDue = rowDue(a)?.valueOf() || 0;
          const bDue = rowDue(b)?.valueOf() || 0;
          cmp = aDue - bDue;
          break;
        }
        case "menu":
          cmp = (a.jubelioMenu || "").localeCompare(b.jubelioMenu || "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [rows, filterTab, marketplaceFilter, ttsChannelFilter, shippingFilter, searchQuery, sortField, sortDir, shipDate]);

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

  const marketplaceSourceRows = useMemo(() => {
    if (filterTab === "ship_today") {
      return rows.filter(
        (r) => r.platformOrder && isMarketplaceShipOnDate(r.platformOrder, shipDate)
      );
    }
    if (filterTab === "jubelio_only") return [];
    if (filterTab === "all") return rows.filter((r) => Boolean(r.platformOrder));
    return rows.filter((r) => r.status === filterTab && r.platformOrder);
  }, [rows, filterTab, shipDate]);

  const marketplaceCounts = useMemo(() => {
    return {
      all: marketplaceSourceRows.length,
      tiktok: marketplaceSourceRows.filter((r) => marketplaceOf(r.platformOrder) === "tiktok").length,
      shopee: marketplaceSourceRows.filter((r) => marketplaceOf(r.platformOrder) === "shopee").length,
    };
  }, [marketplaceSourceRows]);

  const ttsChannelCounts = useMemo(() => {
    const only = marketplaceSourceRows.filter((r) => marketplaceOf(r.platformOrder) === "tiktok");
    return {
      all: only.length,
      tts: only.filter((r) => ttsChannelOf(r.platformOrder) === "tts").length,
      tokopedia: only.filter((r) => ttsChannelOf(r.platformOrder) === "tokopedia").length,
    };
  }, [marketplaceSourceRows]);

  const shippingSourceRows = useMemo(() => {
    let result = marketplaceSourceRows;
    if (marketplaceFilter !== "all") {
      result = result.filter((r) => marketplaceOf(r.platformOrder) === marketplaceFilter);
    }
    if (marketplaceFilter === "tiktok" && ttsChannelFilter !== "all") {
      result = result.filter((r) => ttsChannelOf(r.platformOrder) === ttsChannelFilter);
    }
    return result;
  }, [marketplaceSourceRows, marketplaceFilter, ttsChannelFilter]);

  const shippingCounts = useMemo(() => {
    return {
      all: shippingSourceRows.length,
      instant: shippingSourceRows.filter((r) => classifyShipping(r.platformOrder) === "instant").length,
      reguler: shippingSourceRows.filter((r) => classifyShipping(r.platformOrder) === "reguler").length,
    };
  }, [shippingSourceRows]);

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
          Ambil data Jubelio dan Shopee / TikTok dulu. Komparasi mencocokkan nomor pesanan, bukan harga.
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
          Komparasi cermin order: nomor pesanan Shopee/TikTok vs Jubelio. Bukan selisih sales atau harga.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: MatchStatus) => {
    switch (status) {
      case "matched":
        return { label: "Tercermin · Shipping", color: "bg-green-100 text-green-700", icon: CheckCircle };
      case "penjualan":
        return { label: "Ketemu di Penjualan", color: "bg-orange-100 text-orange-800", icon: AlertTriangle };
      case "jubelio_only":
        return { label: "Ada di Jubelio, tidak di channel", color: "bg-amber-100 text-amber-700", icon: Package };
      case "platform_only":
        return { label: "Tidak ketemu di Jubelio", color: "bg-blue-100 text-blue-700", icon: ShoppingBag };
    }
  };

  const filterTabs: { value: FilterTab; label: string; count: number; color: string }[] = [
    { value: "all", label: "Semua", count: summary.total, color: "text-brand-700" },
    { value: "ship_today", label: shipDateIsToday ? "Kirim hari ini" : `Kirim ${formatDayKeyLabel(shipDate)}`, count: shipTodayCount, color: "text-orange-600" },
    { value: "matched", label: "Tercermin", count: summary.matched, color: "text-green-600" },
    { value: "platform_only", label: "Belum di Jubelio", count: summary.platformOnly, color: "text-blue-600" },
    { value: "jubelio_only", label: "Hanya di Jubelio", count: summary.jubelioOnly, color: "text-amber-600" },
  ];

  const foundInJubelio = summary.matched + summary.penjualan;
  const mirrorRate = summary.platformCount > 0 ? (foundInJubelio / summary.platformCount) * 100 : 0;
  const missingRate = Math.max(0, 100 - mirrorRate);

  const selectStatusTab = (tab: FilterTab) => {
    setFilterTab(tab);
    setMarketplaceFilter("all");
    setTtsChannelFilter("all");
    setShippingFilter("all");
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <ApiSyncBar
        {...apiSync}
        hint="Cermin order: nomor pesanan Shopee/TikTok vs Jubelio. Bukan sales atau selisih harga."
      />

      {!!apiSync.syncing || isRefreshing ? (
        <>
          <CardsSkeleton count={5} />
          <TableSkeleton rows={8} columns={7} />
        </>
      ) : (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: "Order channel", value: formatNumber(summary.platformCount), sub: `Shopee ${formatNumber(summary.shopeeCount)} · TikTok/Tokped ${formatNumber(summary.tiktokCount)} · semua status`, border: "border-brand-200", valueColor: "text-brand-800", labelColor: "text-brand-400", subColor: "text-brand-300" },
          { label: "Jubelio", value: formatNumber(summary.jubelioCount), sub: "Nomor SP- cermin WMS · jangan dijumlah ke channel", border: "border-brand-200", valueColor: "text-brand-800", labelColor: "text-brand-400", subColor: "text-brand-300" },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i, duration: 0.18, ease: "easeOut" }}
            className={cn("bg-white rounded-xl shadow-sm border p-4", card.border)}
          >
            <p className={cn("text-xs font-medium", card.labelColor)}>{card.label}</p>
            <p className={cn("text-xl sm:text-2xl font-bold mt-1", card.valueColor)}>{card.value}</p>
            <p className={cn("text-[10px] sm:text-xs mt-1", card.subColor)}>{card.sub}</p>
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.18, ease: "easeOut" }}
          className={cn(
            "relative z-20 overflow-visible bg-white rounded-xl shadow-sm border border-orange-200 p-4",
            filterTab === "ship_today" && "ring-2 ring-orange-300"
          )}
        >
          <button
            type="button"
            onClick={() => {
              setFilterTab(filterTab === "ship_today" ? "all" : "ship_today");
              setMarketplaceFilter("all");
              setTtsChannelFilter("all");
              setShippingFilter("all");
              setCurrentPage(1);
            }}
            className="w-full text-left"
          >
            <p className="text-xs font-medium text-orange-600">
              {shipDateIsToday ? "Kirim hari ini" : "Kirim"}
            </p>
            <p className="text-xl sm:text-2xl font-bold mt-1 text-orange-700">
              {formatNumber(shipTodayCount)}
            </p>
            <p className="text-[10px] sm:text-xs mt-1 text-orange-500">
              Order channel
              {shipDateIsToday ? " · termasuk terlambat" : ` · ${formatDayKeyLabel(shipDate)}`}
            </p>
          </button>
          <DayPicker value={shipDate} onChange={setSelectedShipDate} />
          {!shipDateIsToday ? (
            <button
              type="button"
              onClick={() => setSelectedShipDate(today)}
              className="mt-1 text-[10px] text-orange-600 hover:underline"
            >
              Kembali ke hari ini
            </button>
          ) : null}
        </motion.div>

        {[
          { tab: "matched" as FilterTab, label: "Tercermin", value: formatNumber(summary.matched), sub: "SN channel ketemu di Jubelio Shipping", border: "border-green-200", valueColor: "text-green-700", labelColor: "text-green-600", subColor: "text-green-500", ring: "ring-green-300" },
          { tab: "platform_only" as FilterTab, label: "Belum di Jubelio", value: formatNumber(summary.platformOnly), sub: `${missingRate.toFixed(0)}% channel belum ketemu`, border: "border-red-200", valueColor: "text-red-700", labelColor: "text-red-600", subColor: "text-red-400", ring: "ring-red-300" },
        ].map((card, i) => (
          <motion.button
            type="button"
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.09 + 0.03 * i, duration: 0.18, ease: "easeOut" }}
            onClick={() => selectStatusTab(filterTab === card.tab ? "all" : card.tab)}
            className={cn(
              "bg-white rounded-xl shadow-sm border p-4 text-left",
              card.border,
              filterTab === card.tab && `ring-2 ${card.ring}`
            )}
          >
            <p className={cn("text-xs font-medium", card.labelColor)}>{card.label}</p>
            <p className={cn("text-xl sm:text-2xl font-bold mt-1", card.valueColor)}>{card.value}</p>
            <p className={cn("text-[10px] sm:text-xs mt-1", card.subColor)}>{card.sub}</p>
          </motion.button>
        ))}
      </div>

      <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 sm:p-4 text-xs sm:text-sm text-brand-600 space-y-1.5">
        <p>
          Angka di sini <strong>memang beda</strong> dengan menu Pesanan — bukan data rusak.
        </p>
        <ul className="list-disc pl-4 space-y-1 text-brand-500">
          <li>
            <strong>Order channel</strong> = unique nomor Shopee/TikTok/Tokped, semua status (batal ikut).
            Di Pesanan, tab channel hanya yang <strong>sudah bayar</strong>.
          </li>
          <li>
            <strong>Jubelio</strong> = unique nomor SP- gudang. Bukan SN marketplace, jangan dijumlah ke Shopee/TikTok.
          </li>
          <li>
            <strong>Tercermin + Belum di Jubelio</strong> = pecahan Order channel ({formatNumber(summary.matched)} + {formatNumber(summary.platformOnly)} = {formatNumber(summary.platformCount)}).
          </li>
          <li>
            Tab tabel <strong>Semua {formatNumber(summary.total)}</strong> = baris cermin (ketemu, belum, atau hanya di Jubelio), bukan total Pesanan.
          </li>
          <li>
            <strong>Kirim hari ini</strong> = yang tenggat kirim tanggal itu, bukan semua order.
          </li>
        </ul>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.2, ease: "easeOut" }}
        className="bg-white rounded-xl shadow-sm border border-brand-200"
      >
        <div className="px-3 sm:px-4 border-b border-brand-200">
          <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide min-w-0">
            {filterTabs.map((tab) => {
              const isActive = filterTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => {
                    setFilterTab(tab.value);
                    setMarketplaceFilter("all");
                    setTtsChannelFilter("all");
                    setShippingFilter("all");
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-all shrink-0",
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

        {filterTab === "ship_today" && (
          <div className="relative z-20 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-brand-100 flex flex-wrap items-center gap-2">
            <span className="text-[10px] sm:text-xs font-medium text-brand-400">Tanggal kirim:</span>
            <DayPicker value={shipDate} onChange={setSelectedShipDate} compact />
            {!shipDateIsToday ? (
              <button
                type="button"
                onClick={() => setSelectedShipDate(today)}
                className="text-[11px] font-medium text-orange-600 hover:underline"
              >
                Hari ini
              </button>
            ) : (
              <span className="text-[11px] text-brand-400">Termasuk yang terlambat</span>
            )}
          </div>
        )}

        {filterTab !== "jubelio_only" && (
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
                    setShippingFilter("all");
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

        {filterTab !== "jubelio_only" && marketplaceFilter === "tiktok" && (
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
                    setShippingFilter("all");
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

        {filterTab === "ship_today" && (
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-brand-100 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] sm:text-xs font-medium text-brand-400 mr-0.5 sm:mr-1">Pengiriman:</span>
            {([
              { value: "all" as ShippingFilter, label: "Semua" },
              { value: "reguler" as ShippingFilter, label: "Reguler" },
              { value: "instant" as ShippingFilter, label: "Instant" },
            ]).map((item) => {
              const isActive = shippingFilter === item.value;
              const count = shippingCounts[item.value];
              return (
                <button
                  key={item.value}
                  onClick={() => {
                    setShippingFilter(item.value);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    isActive
                      ? "bg-orange-600 text-white shadow-sm"
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

        <div className="p-3 sm:p-4 border-b border-brand-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <p className="text-xs sm:text-sm text-brand-400">
            <span className="font-semibold text-brand-700">{filteredRows.length}</span> pesanan
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

        <div>
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-brand-300" />
              </div>
              <p className="text-brand-400 text-center">Tidak ada pesanan yang cocok dengan filter.</p>
            </div>
          ) : (
            <>
            <div className="md:hidden divide-y divide-cream-200">
              {paginatedRows.map((row, idx) => {
                const badge = getStatusBadge(row.status);
                const BadgeIcon = badge.icon;
                const menu = jubelioMenuBadge(row);
                const due = rowDue(row);
                return (
                  <article
                    key={`${row.orderNumber}-${idx}`}
                    onClick={() => setPreviewRow(row)}
                    className={cn(
                      "p-3 space-y-1.5 cursor-pointer",
                      previewRow?.orderNumber === row.orderNumber &&
                        previewRow?.matchedBy === row.matchedBy &&
                        "bg-brand-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                          badge.color
                        )}
                      >
                        <BadgeIcon className="w-3 h-3" />
                        {badge.label}
                      </span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded", menu.className)}>
                        {menu.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-brand-800 font-mono break-all">
                      {row.orderNumber}
                    </p>
                    <p className="text-xs text-brand-500">
                      Qty {row.qty}
                      {row.platformOrder ? ` · ${marketplaceLabel(row.platformOrder)}` : ""}
                      {(row.platformOrder?.courier || row.jubelioOrder?.courier)
                        ? ` · ${row.platformOrder?.courier || row.jubelioOrder?.courier}`
                        : ""}
                    </p>
                    <p className="text-[11px] text-brand-400">{formatDueLabel(due)}</p>
                  </article>
                );
              })}
            </div>
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead className="bg-cream-100">
                <tr>
                  {([
                    { field: "status" as const, label: "Status", align: "left" },
                    { field: "orderNumber" as const, label: "No. Pesanan", align: "left" },
                    { field: "qty" as const, label: "Qty", align: "right" },
                    { field: "courier" as const, label: "Kurir", align: "left" },
                    { field: "menu" as const, label: "Menu Jubelio", align: "left" },
                    { field: "due" as const, label: "Tenggat", align: "left" },
                    { field: "matchedBy" as const, label: "Match via", align: "left" },
                  ]).map((col) => (
                    <th
                      key={col.field}
                      className={cn(
                        "px-3 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-wider cursor-pointer hover:text-brand-600 select-none",
                        col.align === "right" ? "text-right" : "text-left"
                      )}
                      onClick={() => handleCompSort(col.field)}
                    >
                      <div className={cn("flex items-center gap-1", col.align === "right" && "justify-end")}>
                        {col.label} <CompSortIcon field={col.field} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {paginatedRows.map((row, idx) => {
                  const badge = getStatusBadge(row.status);
                  const BadgeIcon = badge.icon;
                  const menu = jubelioMenuBadge(row);
                  const due = rowDue(row);
                  const order = row.platformOrder || row.jubelioOrder;

                  return (
                    <tr
                      key={`${row.orderNumber}-${idx}`}
                      onClick={() => setPreviewRow(row)}
                      className={cn(
                        "hover:bg-cream-50 transition-colors cursor-pointer",
                        row.status === "platform_only" && "bg-amber-50/40",
                        row.status === "penjualan" && "bg-orange-50/40",
                        previewRow?.orderNumber === row.orderNumber &&
                          previewRow?.matchedBy === row.matchedBy &&
                          "bg-brand-50"
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
                        {row.platformOrder ? (
                          <p className="text-[10px] text-brand-300 mt-0.5">
                            {marketplaceLabel(row.platformOrder)}
                          </p>
                        ) : null}
                        {order?.status ? (
                          <p className="text-[10px] text-brand-400 mt-0.5">{getStatusLabel(order.status)}</p>
                        ) : null}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-xs sm:text-sm font-medium text-brand-800">
                        {row.qty}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs text-brand-700">
                        {row.platformOrder?.courier || row.jubelioOrder?.courier || "—"}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                        <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium", menu.className)}>
                          {menu.label}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs text-brand-700 whitespace-nowrap">
                        {formatDueLabel(due)}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                        <span className="text-[10px] sm:text-xs text-brand-400 bg-cream-200 px-1.5 py-0.5 rounded">
                          {row.matchedBy}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </>
          )}
        </div>

        {totalPages > 1 && (
          <div className="px-3 sm:px-5 py-3 sm:py-4 border-t border-brand-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs sm:text-sm text-brand-400 order-2 sm:order-1">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{" "}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredRows.length)} dari {filteredRows.length}
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
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
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
      </motion.div>
      </>
      )}
      <OrderDetailPreview
        open={!!previewRow}
        onClose={() => setPreviewRow(null)}
        title={previewRow?.orderNumber || "Detail pesanan"}
        hideMoney={hideMoney}
        notes={
          previewRow
            ? [
                { label: "Status komparasi", value: getStatusBadge(previewRow.status).label },
                { label: "Menu Jubelio", value: jubelioMenuBadge(previewRow).label },
                { label: "Match via", value: previewRow.matchedBy },
                { label: "Qty", value: String(previewRow.qty) },
                { label: "Tenggat", value: formatDueLabel(rowDue(previewRow)) },
              ]
            : undefined
        }
        sections={
          previewRow
            ? [
                ...(previewRow.platformOrder
                  ? [
                      {
                        label: marketplaceLabel(previewRow.platformOrder),
                        order: previewRow.platformOrder,
                      },
                    ]
                  : []),
                ...(previewRow.jubelioOrder
                  ? [{ label: "Jubelio", order: previewRow.jubelioOrder }]
                  : []),
              ]
            : []
        }
      />
    </div>
  );
}
