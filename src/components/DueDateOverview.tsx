"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Cloud,
  Copy,
  ExternalLink,
  Link2,
  LogOut,
  Search,
  LayoutDashboard,
  Bell,
  ScanLine,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn, formatNumber } from "@/lib/utils";
import { ORDER_TODAY_CUTOFF_HINT, ORDER_TODAY_CUTOFF_SUBTITLE } from "@/lib/timezone";
import {
  buildDueDateOverview,
  formatAnalyzedAt,
  formatDueLabel,
  jubelioMenuBadge,
  jubelioMenuHint,
  jubelioMenuLabel,
  type DueDateRow,
  type ShippingBreakdown,
} from "@/lib/due-date";
import { Order } from "@/types/order";
import { OrderDetailPreview } from "@/components/OrderDetailPreview";
import { type ApiSyncSource } from "@/components/ApiSyncBar";
import { PlatformLogo } from "@/components/PlatformLogo";
import {
  StatListPreview,
  dueDateRowsToPreviewItems,
  placedTodayAsOrder,
  placedTodayToPreviewItems,
  type PlacedTodayPreviewOrder,
  type StatPreviewItem,
} from "@/components/StatListPreview";

export type OverviewSyncResult = {
  count: number;
  error?: string;
};

export type OverviewSyncProgress = {
  source: ApiSyncSource;
  percent: number;
  label: string;
};

export type RealtimeState = "connecting" | "live" | "error";

interface DueDateOverviewViewProps {
  orders: Order[];
  onSyncApi: (source: ApiSyncSource) => Promise<OverviewSyncResult>;
  syncing: ApiSyncSource | null;
  syncProgress?: OverviewSyncProgress | null;
  autoSyncing?: boolean;
  realtimeState?: RealtimeState;
  shopeeLinked: boolean | null;
  tiktokLinked: boolean | null;
  connectMsg?: string;
  onClear: () => Promise<void> | void;
  lastShopeeFile?: string | null;
  lastTiktokFile?: string | null;
  lastJubelioFile?: string | null;
  onSignOut: () => void;
  workerName?: string;
  placedToday?: {
    total: number;
    shopee: number;
    tiktok: number;
  };
}

function ShippingLines({ shipping }: { shipping: ShippingBreakdown }) {
  return (
    <div className="mt-2 pt-2 border-t border-brand-100 space-y-0.5 text-[11px] text-brand-500">
      <p className="flex justify-between gap-2">
        <span>Reguler</span>
        <span className="font-medium text-brand-800">{formatNumber(shipping.regular)}</span>
      </p>
      <p className="flex justify-between gap-2">
        <span>Instan</span>
        <span className="font-medium text-brand-800">{formatNumber(shipping.instant)}</span>
      </p>
      <p className="flex justify-between gap-2">
        <span>Same-day</span>
        <span className="font-medium text-brand-800">{formatNumber(shipping.sameDay)}</span>
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  valueClass,
  shipping,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: ReactNode;
  valueClass?: string;
  shipping?: ShippingBreakdown;
  onClick?: () => void;
}) {
  const className = cn(
    "bg-white rounded-xl shadow-sm border border-brand-200 px-3 py-2.5 sm:px-4 sm:py-3 text-left",
    onClick && "hover:border-brand-400 hover:bg-cream-50 cursor-pointer"
  );
  const body = (
    <>
      <p className="text-[11px] sm:text-xs text-brand-400">{label}</p>
      <p className={cn("text-xl sm:text-2xl font-semibold tracking-tight mt-0.5", valueClass || "text-brand-800")}>
        {value}
      </p>
      {hint ? (
        typeof hint === "string" ? (
          <p className="text-[11px] text-brand-400 mt-0.5 leading-snug">{hint}</p>
        ) : (
          <div className="text-[10px] sm:text-[11px] text-brand-400 mt-0.5 leading-snug space-y-0.5">{hint}</div>
        )
      ) : null}
      {shipping ? <ShippingLines shipping={shipping} /> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} title="Klik untuk lihat daftar">
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

function remainingClass(row: DueDateRow) {
  if (row.overdue) return "text-red-600 font-semibold";
  if (row.dueSoon) return "text-shopee-500 font-semibold";
  if (row.instant) return "text-red-600 font-semibold";
  return "text-brand-800 font-medium";
}

function rowTone(row: DueDateRow) {
  if (row.overdue) return "bg-red-50";
  if (row.dueSoon || row.instant) return "bg-amber-50";
  return "";
}

function platformBadge(name?: string) {
  if (name === "Shopee") return "text-shopee-600 bg-shopee-50";
  if (name === "TikTok" || name === "Tokopedia") return "text-brand-800 bg-brand-100";
  return "text-brand-600 bg-cream-200";
}

async function copyOrderNumbers(rows: DueDateRow[]) {
  const text = rows.map((row) => row.orderNumber).join("\n");
  await navigator.clipboard.writeText(text);
}

function CopyListButton({
  rows,
  listId,
  copiedList,
  onCopied,
}: {
  rows: DueDateRow[];
  listId: string;
  copiedList: string | null;
  onCopied: (id: string | null) => void;
}) {
  const copied = copiedList === listId;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await copyOrderNumbers(rows);
          onCopied(listId);
          window.setTimeout(() => onCopied(null), 2000);
        } catch {
          onCopied(null);
        }
      }}
      className="inline-flex items-center gap-1.5 self-start px-2.5 py-1.5 text-[11px] font-medium text-brand-800 bg-white border border-brand-200 rounded-lg hover:bg-cream-50"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Tersalin" : "Salin semua nomor"}
    </button>
  );
}

type TypeFilter = "instant" | "regular" | "all";
type PlatformFilter = "all" | "shopee" | "tiktok" | "jubelio";

function rowPlatform(row: DueDateRow): Exclude<PlatformFilter, "all"> {
  if (row.marketplace === "Shopee") return "shopee";
  if (row.marketplace === "TikTok" || row.marketplace === "Tokopedia") return "tiktok";
  return "jubelio";
}

function SyncProgressBar({ percent, label }: { percent: number; label: string }) {
  const width = Math.max(6, Math.min(100, percent));
  return (
    <div className="space-y-1">
      <div className="h-1.5 rounded-full bg-brand-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="text-[11px] text-brand-500">{label}</p>
    </div>
  );
}

function SourceCard({
  title,
  titleClass,
  logo,
  hint,
  linked,
  showLinkStatus = false,
  connectHref,
  sellerHref,
  lastFile,
  syncing,
  busy,
  progress,
  onSync,
}: {
  title: string;
  titleClass: string;
  logo?: "shopee" | "tiktok" | "jubelio";
  hint?: string;
  linked?: boolean | null;
  showLinkStatus?: boolean;
  connectHref?: string;
  sellerHref: string;
  lastFile?: string | null;
  syncing: boolean;
  busy: boolean;
  progress?: OverviewSyncProgress | null;
  onSync: () => void;
}) {
  const needsConnect = showLinkStatus && linked === false && connectHref;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-brand-200 px-3 py-2.5">
      <span className={cn("inline-flex items-center text-xs font-semibold", titleClass)}>
        {logo ? <PlatformLogo platform={logo} className="h-5 sm:h-6 max-w-[6.5rem]" /> : title}
      </span>
      {hint ? <p className="text-[11px] text-brand-400">{hint}</p> : null}
      {showLinkStatus ? (
        linked == null ? (
          <p className="text-[11px] text-brand-400">Memeriksa status toko...</p>
        ) : (
          <p className={cn("text-[11px]", linked ? "text-green-700" : "text-amber-700")}>
            {linked ? "Toko sudah terhubung" : "Toko belum terhubung"}
          </p>
        )
      ) : null}
      {needsConnect ? (
        <a
          href={connectHref}
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-medium hover:underline",
            titleClass
          )}
        >
          <Link2 className="w-3.5 h-3.5" />
          Hubungkan toko
        </a>
      ) : (
        <button
          type="button"
          onClick={onSync}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-50 text-left"
        >
          <Cloud className={cn("w-3.5 h-3.5", syncing && "animate-pulse")} />
          {syncing ? "Mengambil API..." : busy ? "Menunggu sinkron otomatis..." : "Ambil data API"}
        </button>
      )}
      {syncing && progress ? (
        <SyncProgressBar percent={progress.percent} label={progress.label} />
      ) : (
        <>
          <a
            href={sellerHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-500 hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Seller Centre
          </a>
          <span className="text-[11px] text-brand-400">{lastFile || "Belum ada data"}</span>
        </>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-lg text-[11px] font-medium",
        active ? "bg-brand-600 text-white" : "bg-white text-brand-500 border border-brand-200 hover:bg-cream-100"
      )}
    >
      {children}
    </button>
  );
}

function useGoogleClock() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let offset = 0;
    let cancelled = false;

    const tick = () => {
      if (!cancelled) setNow(new Date(Date.now() + offset));
    };

    const sync = async () => {
      try {
        const res = await fetch("/api/time", { cache: "no-store" });
        const data = (await res.json()) as { at?: string };
        if (data.at) {
          const server = new Date(data.at).getTime();
          if (!Number.isNaN(server)) offset = server - Date.now();
        }
      } catch {
        // Pakai jam perangkat kalau Google tidak terjangkau.
      }
      tick();
    };

    sync();
    const clock = window.setInterval(tick, 1000);
    const resync = window.setInterval(sync, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(clock);
      window.clearInterval(resync);
    };
  }, []);

  return now;
}

export default function DueDateOverviewView({
  orders,
  onSyncApi,
  syncing,
  syncProgress = null,
  autoSyncing = false,
  realtimeState = "connecting",
  shopeeLinked,
  tiktokLinked,
  connectMsg,
  onClear,
  lastShopeeFile,
  lastTiktokFile,
  lastJubelioFile,
  onSignOut,
  workerName,
  placedToday,
}: DueDateOverviewViewProps) {
  const [showSources, setShowSources] = useState(orders.length === 0);
  const [syncMsg, setSyncMsg] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("instant");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [previewRow, setPreviewRow] = useState<DueDateRow | null>(null);
  const [previewPlaced, setPreviewPlaced] = useState<PlacedTodayPreviewOrder | null>(null);
  const [copiedList, setCopiedList] = useState<string | null>(null);
  const [orderQuery, setOrderQuery] = useState("");
  const [listPreview, setListPreview] = useState<{
    title: string;
    subtitle?: string;
    items: StatPreviewItem[];
    loading?: boolean;
    error?: string;
  } | null>(null);
  const listReq = useRef(0);

  const overview = useMemo(() => buildDueDateOverview(orders), [orders]);
  const liveNow = useGoogleClock();
  const maxCourier = Math.max(1, ...overview.couriers.map((c) => c.orders));
  const busy = !!syncing || autoSyncing;

  useEffect(() => {
    if (!connectMsg) return;
    setShowSources(true);
    setSyncMsg(connectMsg);
  }, [connectMsg]);

  const matchesType = (row: DueDateRow) => {
    if (typeFilter === "instant") return row.instant;
    if (typeFilter === "regular") return !row.instant;
    return true;
  };
  const matchesPlatform = (row: DueDateRow) => {
    if (platformFilter === "all") return true;
    if (platformFilter === "jubelio") return !row.jubelioOrder || row.jubelioMenu === "penjualan";
    return rowPlatform(row) === platformFilter;
  };
  const matchesSearch = (row: DueDateRow) => {
    const q = orderQuery.replace(/[\s\-_.#]+/g, "").toLowerCase();
    if (!q) return true;
    const hay = [
      row.orderNumber,
      row.marketplaceOrder?.orderNumber,
      row.jubelioOrder?.orderNumber,
      row.jubelioOrder?.refNo,
      row.marketplaceOrder?.refNo,
      row.marketplaceOrder?.trackingNumber,
      row.jubelioOrder?.trackingNumber,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/[\s\-_.#]+/g, "")
      .toLowerCase();
    return hay.includes(q);
  };
  const visibleRows = orderQuery.trim()
    ? overview.rows.filter(matchesSearch)
    : overview.rows.filter((row) => matchesType(row) && matchesPlatform(row));
  const typeCount = (id: TypeFilter) =>
    overview.rows.filter((row) => {
      if (!matchesPlatform(row)) return false;
      if (id === "instant") return row.instant;
      if (id === "regular") return !row.instant;
      return true;
    }).length;
  const platformCount = (id: PlatformFilter) =>
    overview.rows.filter((row) => {
      if (!matchesType(row)) return false;
      if (id === "all") return true;
      if (id === "jubelio") return !row.jubelioOrder || row.jubelioMenu === "penjualan";
      return rowPlatform(row) === id;
    }).length;

  const handleSync = async (source: ApiSyncSource) => {
    setShowSources(true);
    setSyncMsg("");
    const result = await onSyncApi(source);
    const label =
      source === "jubelio" ? "Jubelio" : source === "shopee" ? "Shopee" : "TikTok";
    if (result.error) {
      setSyncMsg(result.error);
      return;
    }
    setSyncMsg(`${result.count} pesanan ${label} untuk kirim hari ini.`);
  };

  const mustSendNow = overview.overdue + overview.dueSoon;
  const wajibCount = mustSendNow > 0 ? mustSendNow : overview.critical;
  const shopeeShare = overview.totalOrders
    ? Math.round((overview.shopee / overview.totalOrders) * 100)
    : 0;
  const tiktokShare = overview.totalOrders
    ? Math.round((overview.tiktok / overview.totalOrders) * 100)
    : 0;
  const queueRows = overview.processRows.filter(
    (row) => row.marketplace === "Shopee" || row.marketplace === "TikTok" || row.marketplace === "Tokopedia"
  );
  const wajibRows =
    mustSendNow > 0
      ? overview.rows.filter((row) => row.overdue || row.dueSoon)
      : overview.rows.filter((row) => row.critical);
  const belumShippingRows = [...overview.missingJubelioRows, ...overview.penjualanOnlyRows];

  const openRowList = (title: string, rows: DueDateRow[], subtitle?: string) => {
    listReq.current += 1;
    setListPreview({
      title,
      subtitle: subtitle || `${formatNumber(rows.length)} pesanan`,
      items: dueDateRowsToPreviewItems(rows),
    });
  };

  const openPlacedTodayList = async () => {
    const req = ++listReq.current;
    setListPreview({
      title: "Order hari ini",
      subtitle: ORDER_TODAY_CUTOFF_SUBTITLE,
      items: [],
      loading: true,
    });
    try {
      const response = await fetch("/api/orders/placed-today?list=1", { cache: "no-store" });
      const data = (await response.json()) as {
        orders?: PlacedTodayPreviewOrder[];
        error?: string;
        summary?: { total: number; shopee: number; tiktok: number };
      };
      if (req !== listReq.current) return;
      if (!response.ok) throw new Error(data.error || "Gagal memuat");
      const orders = data.orders || [];
      setListPreview({
        title: "Order hari ini",
        subtitle: `${formatNumber(data.summary?.total ?? orders.length)} pesanan · Shopee ${formatNumber(data.summary?.shopee ?? 0)} · TikTok/Tokped ${formatNumber(data.summary?.tiktok ?? 0)}`,
        items: placedTodayToPreviewItems(orders),
      });
    } catch {
      if (req !== listReq.current) return;
      setListPreview({
        title: "Order hari ini",
        items: [],
        error: "Gagal memuat daftar order hari ini.",
      });
    }
  };

  const onListSelect = (item: StatPreviewItem) => {
    if (item.row) {
      setPreviewPlaced(null);
      setPreviewRow(item.row);
      return;
    }
    const number = item.orderNumber.trim().toUpperCase();
    const match =
      queueRows.find((row) => row.orderNumber.trim().toUpperCase() === number) ||
      overview.rows.find((row) => row.orderNumber.trim().toUpperCase() === number);
    if (match) {
      setPreviewPlaced(null);
      setPreviewRow(match);
      return;
    }
    if (item.placed) {
      setPreviewRow(null);
      setPreviewPlaced(item.placed);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-cream-100 text-brand-800">
      <header className="bg-white border-b border-brand-200 px-3 sm:px-6 py-2.5 sm:py-3 shrink-0">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-semibold text-brand-800">Kirim hari ini</h1>
            <p className="text-[11px] sm:text-xs text-brand-400 mt-0.5">
              Dicek {formatAnalyzedAt(liveNow)}
              {workerName ? ` · ${workerName}` : ""}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] mt-0.5">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  realtimeState === "live" && "bg-green-500 animate-pulse",
                  realtimeState === "connecting" && "bg-amber-400",
                  realtimeState === "error" && "bg-red-500"
                )}
              />
              <span
                className={cn(
                  realtimeState === "live" && "text-green-700",
                  realtimeState === "connecting" && "text-amber-700",
                  realtimeState === "error" && "text-red-600"
                )}
              >
                {realtimeState === "live"
                  ? "Realtime aktif"
                  : realtimeState === "error"
                    ? "Realtime terputus"
                    : "Menghubungkan realtime..."}
              </span>
              <span className="text-brand-400">
                {autoSyncing
                  ? "· sinkron otomatis..."
                  : "· antrian otomatis tiap 3 menit"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-500 border border-brand-200 rounded-lg hover:bg-cream-100"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </Link>
            <Link
              href="/scanner-barcode"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-cream-100"
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Validasi scan</span>
              <span className="sm:hidden">Scan</span>
            </Link>
            <button
              onClick={() => setShowSources((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
            >
              <Cloud className="w-3.5 h-3.5" />
              Ambil data
            </button>
            <button
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-cream-100"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
        {syncing && syncProgress ? (
          <div className="mt-2.5">
            <SyncProgressBar percent={syncProgress.percent} label={syncProgress.label} />
          </div>
        ) : null}
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3 sm:space-y-5">
          {showSources && (
            <section className="bg-white rounded-xl shadow-sm border border-brand-200 p-3 sm:p-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-brand-800">Masukkan data 3 platform</h2>
                <p className="text-xs text-brand-400 mt-0.5">
                  Realtime sudah jalan: status pesanan ikut berubah langsung, antrian kirim
                  disinkronkan otomatis saat halaman ini terbuka (tiap 3 menit) dan di server
                  tiap 5 menit. Tombol Ambil data API untuk tarik ulang sekarang — ada progress
                  bar selama prosesnya. Antrian kirim dari Shopee & TikTok saja; Jubelio cermin
                  omnichannel, bukan menambah jumlah pesanan.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <SourceCard
                  title="Shopee"
                  logo="shopee"
                  titleClass="text-shopee-500"
                  showLinkStatus
                  linked={shopeeLinked}
                  connectHref="/api/shopee/authorize?next=/overview-duedate"
                  sellerHref="https://accounts.shopee.co.id/seller/login?next=https%3A%2F%2Fseller.shopee.co.id%2F"
                  lastFile={lastShopeeFile}
                  syncing={syncing === "shopee"}
                  busy={busy}
                  progress={syncing === "shopee" ? syncProgress : null}
                  onSync={() => handleSync("shopee")}
                />
                <SourceCard
                  title="TikTok / Tokopedia"
                  logo="tiktok"
                  titleClass="text-brand-800"
                  showLinkStatus
                  linked={tiktokLinked}
                  connectHref="/api/tiktok/authorize?next=/overview-duedate"
                  sellerHref="https://seller-id.tokopedia.com/"
                  lastFile={lastTiktokFile}
                  syncing={syncing === "tiktok"}
                  busy={busy}
                  progress={syncing === "tiktok" ? syncProgress : null}
                  onSync={() => handleSync("tiktok")}
                />
                <SourceCard
                  title="Jubelio (cermin)"
                  logo="jubelio"
                  titleClass="text-brand-800"
                  hint="Tidak menambah antrian kirim"
                  sellerHref="https://v2.jubelio.com/"
                  lastFile={lastJubelioFile}
                  syncing={syncing === "jubelio"}
                  busy={busy}
                  progress={syncing === "jubelio" ? syncProgress : null}
                  onSync={() => handleSync("jubelio")}
                />
              </div>
              {syncMsg ? <p className="text-xs text-brand-500">{syncMsg}</p> : null}
              <button
                type="button"
                disabled={busy || orders.length === 0}
                onClick={async () => {
                  if (!window.confirm("Hapus data halaman ini saja? Data dashboard utama tidak berubah.")) return;
                  await onClear();
                  setSyncMsg("Data halaman ini sudah dikosongkan.");
                }}
                className="text-[11px] text-red-600 hover:underline disabled:opacity-40"
              >
                Hapus data halaman ini
              </button>
            </section>
          )}

          {overview.totalOrders > 0 && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-cream-50 px-3 py-2.5 sm:px-4">
                <Bell className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-brand-700">
                  <span className="font-semibold">Pengingat:</span>{" "}
                  {formatNumber(overview.todayProcessCount)} pesanan Shopee/TikTok antrian hari ini
                  ({formatNumber(overview.todayProcessItems)} item). Jubelio tidak dijumlahkan.
                  Pickup kurir dan instant yang sudah "sedang dikirim" tidak mengurangi total ini.
                </p>
              </div>
              {overview.overdue > 0 || overview.dueSoon > 0 || overview.critical > 0 ? (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 sm:px-4">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-red-700">
                    <span className="font-semibold">Peringatan — wajib dikirim sekarang:</span>{" "}
                    {overview.overdue > 0 ? `${overview.overdue} terlambat` : null}
                    {overview.overdue > 0 && (overview.dueSoon > 0 || overview.instant > 0) ? " · " : null}
                    {overview.dueSoon > 0 ? `${overview.dueSoon} sisa ≤ 1 jam` : null}
                    {overview.dueSoon > 0 && overview.instant > 0 ? " · " : null}
                    {overview.instant > 0 ? `${overview.instant} instant / same-day` : null}
                    . Kerjakan ini dulu sebelum antrian lain.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
            <StatCard
              label="Order hari ini"
              value={formatNumber(placedToday?.total ?? 0)}
              hint={ORDER_TODAY_CUTOFF_HINT.map((line) => (
                <p key={line}>{line}</p>
              ))}
              onClick={() => void openPlacedTodayList()}
            />
            <StatCard
              label="Antrian kirim"
              value={formatNumber(overview.todayProcessCount)}
              hint={`${formatNumber(overview.todayProcessItems)} item · Shopee Regular/Hemat/Next Day sebelum 12.00 due 23.59 · TikTok 09.00–17.00 due 17.00`}
              onClick={() =>
                openRowList(
                  "Antrian kirim",
                  queueRows,
                  overview.todayPickedUp > 0
                    ? `${formatNumber(queueRows.length)} pesanan · ${formatNumber(overview.todayPickedUp)} sudah berangkat`
                    : `${formatNumber(queueRows.length)} pesanan tenggat hari ini`
                )
              }
            />
            <StatCard
              label="Sisa di gudang"
              value={formatNumber(overview.totalOrders)}
              hint={
                overview.todayPickedUp > 0
                  ? `${formatNumber(overview.todayPickedUp)} sudah berangkat (pickup / instant dikirim)`
                  : "Belum pickup · instant masih diproses ikut di sini"
              }
              onClick={() => openRowList("Sisa di gudang", overview.rows, `${formatNumber(overview.totalOrders)} masih di gudang`)}
            />
            <StatCard
              label="Wajib dikirim sekarang"
              value={formatNumber(wajibCount)}
              valueClass="text-red-600"
              hint="Terlambat / sisa ≤ 1 jam. Jangan ditunda."
              onClick={() => openRowList("Wajib dikirim sekarang", wajibRows)}
            />
            <StatCard
              label="Shopee"
              value={formatNumber(overview.shopee)}
              valueClass="text-shopee-500"
              hint="Total pesanan, semua jenis pengiriman"
              shipping={overview.shopeeShipping}
              onClick={() =>
                openRowList(
                  "Shopee — sisa di gudang",
                  overview.rows.filter((row) => row.marketplace === "Shopee")
                )
              }
            />
            <StatCard
              label="TikTok / Tokopedia"
              value={formatNumber(overview.tiktok)}
              hint="Total pesanan, semua jenis pengiriman"
              shipping={overview.tiktokShipping}
              onClick={() =>
                openRowList(
                  "TikTok / Tokopedia — sisa di gudang",
                  overview.rows.filter((row) => row.marketplace === "TikTok" || row.marketplace === "Tokopedia")
                )
              }
            />
            <StatCard
              label="Belum di Shipping"
              value={formatNumber(overview.missingJubelioRows.length + overview.penjualanOnlyRows.length)}
              valueClass={
                overview.missingJubelioRows.length + overview.penjualanOnlyRows.length > 0
                  ? "text-amber-700"
                  : undefined
              }
              hint={
                overview.penjualanOnlyRows.length > 0
                  ? `${overview.penjualanOnlyRows.length} ketemu di Penjualan, ${overview.missingJubelioRows.length} belum ketemu`
                  : "Ada di Shopee/TikTok, belum di Jubelio Shipping"
              }
              onClick={() => openRowList("Belum di Shipping", belumShippingRows)}
            />
          </div>

          {overview.totalOrders > 0 ? (
            <section className="bg-white rounded-xl shadow-sm border border-brand-200 overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 border-b border-brand-100 flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-brand-800">Cermin Jubelio</h2>
                  <p className="text-[11px] text-brand-400 mt-0.5">
                    Jubelio hanya mirroring omnichannel. Tidak menambah jumlah pesanan Shopee/TikTok.
                    Pakai daftar ini untuk cek yang benar-benar belum ketemu, atau yang hanya
                    ada di menu Penjualan (bukan Shipping / Siap Kirim).
                    {" "}
                    {formatNumber(overview.jubelio)} di Shipping, {formatNumber(overview.penjualanOnlyRows.length)} di Penjualan, {formatNumber(overview.missingJubelioRows.length)} belum ketemu.
                  </p>
                </div>
                <Link
                  href="/overview-duedate/cermin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 self-start px-2.5 py-1.5 text-[11px] font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Full size
                </Link>
              </div>
              {overview.missingJubelioRows.length === 0 &&
              overview.penjualanOnlyRows.length === 0 &&
              overview.jubelioOnlyRows.length === 0 ? (
                <p className="px-3 sm:px-4 py-3 text-xs text-brand-600">
                  Semua pesanan Shopee / TikTok / Tokopedia hari ini sudah ada di Jubelio Shipping. Tidak ada data Jubelio yang tidak ketemu di Shopee / TikTok / Tokopedia.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-brand-100">
                  <div>
                    <div className="px-3 sm:px-4 py-2.5 flex items-start justify-between gap-2 bg-amber-50/70">
                      <div>
                        <h3 className="text-xs font-semibold text-amber-900">Tidak ketemu di Jubelio</h3>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          {formatNumber(overview.missingJubelioRows.length)} nomor — coba cari di menu Penjualan
                        </p>
                      </div>
                      {overview.missingJubelioRows.length > 0 ? (
                        <CopyListButton
                          rows={overview.missingJubelioRows}
                          listId="missing"
                          copiedList={copiedList}
                          onCopied={setCopiedList}
                        />
                      ) : null}
                    </div>
                    {overview.missingJubelioRows.length === 0 ? (
                      <p className="px-3 sm:px-4 py-3 text-[11px] text-brand-400">Tidak ada.</p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto divide-y divide-brand-100">
                        {overview.missingJubelioRows.map((row) => (
                          <button
                            key={row.key}
                            type="button"
                            onClick={() => setPreviewRow(row)}
                            className="w-full text-left px-3 sm:px-4 py-2 hover:bg-cream-50"
                          >
                            <p className="text-xs font-semibold font-mono break-all text-brand-800">{row.orderNumber}</p>
                            <p className="text-[11px] text-brand-500 mt-0.5">
                              {row.marketplace || "Marketplace"} {formatDueLabel(row.marketplaceDue)}
                            </p>
                            <p className="text-[11px] text-amber-800 mt-0.5">{jubelioMenuHint(row)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="px-3 sm:px-4 py-2.5 flex items-start justify-between gap-2 bg-orange-50/80">
                      <div>
                        <h3 className="text-xs font-semibold text-orange-950">Ada di Penjualan, belum Shipping</h3>
                        <p className="text-[11px] text-orange-900 mt-0.5">
                          {formatNumber(overview.penjualanOnlyRows.length)} nomor — ketemu di menu Penjualan
                        </p>
                      </div>
                      {overview.penjualanOnlyRows.length > 0 ? (
                        <CopyListButton
                          rows={overview.penjualanOnlyRows}
                          listId="penjualan"
                          copiedList={copiedList}
                          onCopied={setCopiedList}
                        />
                      ) : null}
                    </div>
                    {overview.penjualanOnlyRows.length === 0 ? (
                      <p className="px-3 sm:px-4 py-3 text-[11px] text-brand-400">Tidak ada.</p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto divide-y divide-brand-100">
                        {overview.penjualanOnlyRows.map((row) => (
                          <button
                            key={row.key}
                            type="button"
                            onClick={() => setPreviewRow(row)}
                            className="w-full text-left px-3 sm:px-4 py-2 hover:bg-cream-50"
                          >
                            <p className="text-xs font-semibold font-mono break-all text-brand-800">{row.orderNumber}</p>
                            <p className="text-[11px] text-orange-900 mt-0.5 font-mono break-all">
                              Jubelio: {row.jubelioOrder?.orderNumber}
                            </p>
                            <p className="text-[11px] text-orange-800 mt-0.5">{jubelioMenuHint(row)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="px-3 sm:px-4 py-2.5 flex items-start justify-between gap-2 bg-cream-50">
                      <div>
                        <h3 className="text-xs font-semibold text-brand-800">Ada di Jubelio, tidak di channel</h3>
                        <p className="text-[11px] text-brand-500 mt-0.5">
                          {formatNumber(overview.jubelioOnlyRows.length)} nomor — tidak di Shopee / TikTok
                        </p>
                      </div>
                      {overview.jubelioOnlyRows.length > 0 ? (
                        <CopyListButton
                          rows={overview.jubelioOnlyRows}
                          listId="jubelioOnly"
                          copiedList={copiedList}
                          onCopied={setCopiedList}
                        />
                      ) : null}
                    </div>
                    {overview.jubelioOnlyRows.length === 0 ? (
                      <p className="px-3 sm:px-4 py-3 text-[11px] text-brand-400">Tidak ada.</p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto divide-y divide-brand-100">
                        {overview.jubelioOnlyRows.map((row) => (
                          <button
                            key={row.key}
                            type="button"
                            onClick={() => setPreviewRow(row)}
                            className="w-full text-left px-3 sm:px-4 py-2 hover:bg-cream-50"
                          >
                            <p className="text-xs font-semibold font-mono break-all text-brand-800">{row.orderNumber}</p>
                            <p className="text-[11px] text-brand-500 mt-0.5">
                              Jubelio {formatDueLabel(row.jubelioDue)}
                            </p>
                            <p className="text-[11px] text-brand-500 mt-0.5">{jubelioMenuHint(row)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {overview.mismatchRows.length > 0 ? (
            <section className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 border-b border-amber-100 bg-amber-50 flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                    Tenggat tidak cocok
                  </h2>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    {formatNumber(overview.mismatchRows.length)} nomor order beda tanggal kirim
                    antara Shopee/TikTok dan Jubelio. Cek di gudang.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await copyOrderNumbers(overview.mismatchRows);
                      setCopiedList("mismatch");
                      window.setTimeout(() => setCopiedList(null), 2000);
                    } catch {
                      setCopiedList(null);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 self-start px-2.5 py-1.5 text-[11px] font-medium text-amber-900 bg-white border border-amber-200 rounded-lg hover:bg-amber-50"
                >
                  {copiedList === "mismatch" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedList === "mismatch" ? "Tersalin" : "Salin semua nomor"}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-amber-100">
                {overview.mismatchRows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => setPreviewRow(row)}
                    className="w-full text-left px-3 sm:px-4 py-2 hover:bg-amber-50/70"
                  >
                    <p className="text-xs font-semibold font-mono break-all text-brand-800">{row.orderNumber}</p>
                    <p className="text-[11px] text-brand-500 mt-0.5">
                      {row.marketplace || "Marketplace"} {formatDueLabel(row.marketplaceDue)}
                      {" · "}
                      Jubelio {formatDueLabel(row.jubelioDue)}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="bg-white rounded-xl shadow-sm border border-brand-200 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-brand-100">
              <h2 className="text-sm font-semibold text-brand-800">Pesanan per tenggat</h2>
              <p className="text-[11px] text-brand-400">
                Shopee Regular/Hemat/Next Day: masuk sebelum 12.00 wajib serah hari kerja itu (paling lama 23.59).
                TikTok/Tokped tetap 09.00–17.00 due 17.00, 17.00–09.00 due besok 09.00.
              </p>
            </div>
            {overview.buckets.length === 0 ? (
              <p className="px-4 py-8 text-sm text-brand-400 text-center">
                Belum ada pesanan untuk hari ini. Ambil data API dulu.
              </p>
            ) : (
              <div className="divide-y divide-brand-100">
                {overview.buckets.map((bucket) => (
                  <div key={bucket.key} className="px-3 sm:px-4 py-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-brand-800">{bucket.label}</p>
                      <p className="text-sm font-semibold text-brand-800 whitespace-nowrap">
                        {formatNumber(bucket.orders)} pesanan
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="rounded-lg bg-shopee-50/70 px-3 py-2.5">
                        <div className="flex items-end justify-between gap-2">
                          <p className="text-xs font-medium text-shopee-500">Shopee</p>
                          <p className="text-lg font-semibold text-shopee-600 leading-none">
                            {formatNumber(bucket.shopee.total)}
                          </p>
                        </div>
                        <p className="text-[10px] text-shopee-500/70 mt-0.5">Total, semua jenis pengiriman</p>
                        <ShippingLines shipping={bucket.shopee} />
                      </div>
                      <div className="rounded-lg bg-cream-100 px-3 py-2.5">
                        <div className="flex items-end justify-between gap-2">
                          <p className="text-xs font-medium text-brand-500">TikTok / Tokopedia</p>
                          <p className="text-lg font-semibold text-brand-800 leading-none">
                            {formatNumber(bucket.tiktok.total)}
                          </p>
                        </div>
                        <p className="text-[10px] text-brand-400 mt-0.5">Total, semua jenis pengiriman</p>
                        <ShippingLines shipping={bucket.tiktok} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-brand-200 p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-brand-800 mb-3">Pesanan & qty per kurir</h2>
            {overview.couriers.length === 0 ? (
              <p className="text-sm text-brand-400">Belum ada data kurir.</p>
            ) : (
              <div className="space-y-2">
                {overview.couriers.map((courier) => (
                  <div key={courier.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{courier.name}</p>
                      <div className="h-2 bg-cream-200 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${Math.max(4, (courier.orders / maxCourier) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] sm:text-xs text-brand-500 whitespace-nowrap">
                      {courier.orders} pesanan · {courier.quantity} item
                      {courier.urgentItems > 0 ? (
                        <span className="text-red-600"> ({courier.urgentItems} instant)</span>
                      ) : null}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-brand-200 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-brand-100 flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-brand-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  {typeFilter === "regular" ? "Reguler" : typeFilter === "all" ? "Antrian hari ini" : "Instant / urgent"}
                </h2>
                <p className="text-[11px] text-brand-400">
                  {typeFilter === "regular"
                    ? "Antrian reguler yang perlu dikirim hari ini."
                    : typeFilter === "all"
                      ? "Semua pesanan yang perlu dikirim hari ini."
                      : "Instant dan same-day wajib dikirim sekarang. Kerjakan ini dulu."}
                </p>
              </div>
              <div className="flex flex-col items-stretch sm:items-end gap-1.5">
                <div className="flex flex-wrap gap-1">
                  {([
                    { id: "instant" as const, label: "Instant" },
                    { id: "regular" as const, label: "Reguler" },
                    { id: "all" as const, label: "Semua" },
                  ]).map((tab) => (
                    <FilterPill key={tab.id} active={typeFilter === tab.id} onClick={() => setTypeFilter(tab.id)}>
                      {tab.label} {typeCount(tab.id)}
                    </FilterPill>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {([
                    { id: "all" as const, label: "Semua platform" },
                    { id: "shopee" as const, label: "Shopee" },
                    { id: "tiktok" as const, label: "TikTok / Tokopedia" },
                    { id: "jubelio" as const, label: "Belum di Shipping" },
                  ]).map((tab) => (
                    <FilterPill key={tab.id} active={platformFilter === tab.id} onClick={() => setPlatformFilter(tab.id)}>
                      {tab.label} {platformCount(tab.id)}
                    </FilterPill>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-3 sm:px-4 py-2 border-b border-brand-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-300" />
                <input
                  type="search"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  placeholder="Cari nomor pesanan..."
                  className="w-full pl-8 pr-8 py-1.5 text-sm border border-brand-200 rounded-lg bg-cream-50 text-brand-800 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                {orderQuery ? (
                  <button
                    type="button"
                    onClick={() => setOrderQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-brand-400 hover:text-brand-700"
                    aria-label="Hapus pencarian"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
            </div>

            {visibleRows.length === 0 ? (
              <p className="px-4 py-8 text-sm text-brand-400 text-center">
                {orderQuery.trim()
                  ? "Nomor pesanan tidak ketemu di antrian hari ini."
                  : "Tidak ada pesanan di filter ini."}
              </p>
            ) : (
              <>
                <div className="md:hidden divide-y divide-brand-100">
                  {visibleRows.map((row) => (
                    <article
                      key={row.key}
                      onClick={() => setPreviewRow(row)}
                      className={cn(
                        "px-3 py-2.5 space-y-1 cursor-pointer",
                        rowTone(row),
                        previewRow?.key === row.key && "ring-1 ring-inset ring-brand-300"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold break-all">{row.orderNumber}</p>
                        <span className={cn("text-xs shrink-0", remainingClass(row))}>{row.remainingLabel}</span>
                      </div>
                      <p className="text-[11px] text-brand-400">
                        Qty {row.quantity} · {row.marketplace || "Jubelio"} · {row.courier}
                      </p>
                      {row.deadlineMismatch ? (
                        <p className="text-[11px] font-medium text-amber-800">
                          Beda tenggat · Marketplace {formatDueLabel(row.marketplaceDue)} · Jubelio {formatDueLabel(row.jubelioDue)}
                        </p>
                      ) : (
                        <p className="text-[11px]">
                          Marketplace {formatDueLabel(row.marketplaceDue)} · Jubelio {formatDueLabel(row.jubelioDue)}
                        </p>
                      )}
                      <p className="text-[11px] text-brand-600">{jubelioMenuHint(row)}</p>
                      <p className={cn("text-[11px]", row.critical ? "text-red-700 font-medium" : "text-brand-500")}>{row.reason}</p>
                    </article>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-cream-100 text-brand-400">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Pesanan</th>
                        <th className="text-right font-medium px-2 py-2">Qty</th>
                        <th className="text-left font-medium px-2 py-2">Platform</th>
                        <th className="text-left font-medium px-2 py-2">Kurir</th>
                        <th className="text-left font-medium px-2 py-2">Tenggat marketplace</th>
                        <th className="text-left font-medium px-2 py-2">Tenggat Jubelio</th>
                        <th className="text-left font-medium px-2 py-2">Sisa</th>
                        <th className="text-left font-medium px-2 py-2">Menu Jubelio</th>
                        <th className="text-left font-medium px-3 py-2">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-100">
                      {visibleRows.map((row) => (
                        <tr
                          key={row.key}
                          onClick={() => setPreviewRow(row)}
                          className={cn(
                            "cursor-pointer",
                            rowTone(row) || "hover:bg-cream-50",
                            previewRow?.key === row.key && "bg-brand-50"
                          )}
                        >
                          <td className="px-3 py-2 font-medium">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {row.orderNumber}
                              {row.deadlineMismatch ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-800 bg-amber-100">
                                  Beda tenggat
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">{row.quantity}</td>
                          <td className="px-2 py-2">
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", platformBadge(row.marketplace))}>
                              {row.marketplace || "Jubelio"}
                            </span>
                          </td>
                          <td className="px-2 py-2 max-w-[140px] truncate">{row.courier}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatDueLabel(row.marketplaceDue)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatDueLabel(row.jubelioDue)}</td>
                          <td className={cn("px-2 py-2 whitespace-nowrap", remainingClass(row))}>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {row.remainingLabel}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", jubelioMenuBadge(row).className)}>
                              {jubelioMenuBadge(row).label}
                            </span>
                            {row.jubelioOrder?.orderNumber && row.jubelioOrder.orderNumber !== row.orderNumber ? (
                              <p className="font-mono text-[10px] text-brand-400 mt-0.5 break-all">
                                {row.jubelioOrder.orderNumber}
                              </p>
                            ) : null}
                          </td>
                          <td className={cn("px-3 py-2 max-w-[280px]", row.critical ? "text-red-700 font-medium" : "text-brand-500")}>{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 pb-4">
            <div className="bg-white rounded-xl shadow-sm border border-brand-200 px-4 py-3">
              <p className="text-xs text-brand-400">Porsi Shopee</p>
              <p className="text-2xl font-semibold text-shopee-500 mt-0.5">{shopeeShare}%</p>
              <p className="text-[11px] text-brand-300">{overview.shopee} dari {overview.totalOrders} pesanan</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-brand-200 px-4 py-3">
              <p className="text-xs text-brand-400">Porsi TikTok / Tokopedia</p>
              <p className="text-2xl font-semibold text-brand-800 mt-0.5">{tiktokShare}%</p>
              <p className="text-[11px] text-brand-300">{overview.tiktok} dari {overview.totalOrders} pesanan</p>
            </div>
          </div>
        </div>
      </main>
      <StatListPreview
        open={!!listPreview}
        title={listPreview?.title || "Daftar pesanan"}
        subtitle={listPreview?.subtitle}
        items={listPreview?.items || []}
        loading={listPreview?.loading}
        error={listPreview?.error}
        detailOpen={!!previewRow || !!previewPlaced}
        onClose={() => {
          listReq.current += 1;
          setListPreview(null);
        }}
        onSelect={onListSelect}
      />
      <OrderDetailPreview
        open={!!previewRow || !!previewPlaced}
        onClose={() => {
          setPreviewRow(null);
          setPreviewPlaced(null);
        }}
        title={previewRow?.orderNumber || previewPlaced?.orderNumber || "Detail pesanan"}
        notes={
          previewRow
            ? [
                { label: "Sisa waktu", value: previewRow.remainingLabel },
                { label: "Kurir", value: previewRow.courier || "-" },
                { label: "Menu Jubelio", value: jubelioMenuLabel(previewRow) },
                { label: "Keterangan Jubelio", value: jubelioMenuHint(previewRow) },
                { label: "Catatan", value: previewRow.reason },
                ...(previewRow.deadlineMismatch
                  ? [
                      {
                        label: "Tenggat marketplace",
                        value: formatDueLabel(previewRow.marketplaceDue),
                      },
                      {
                        label: "Tenggat Jubelio",
                        value: formatDueLabel(previewRow.jubelioDue),
                      },
                    ]
                  : []),
                ...(previewRow.preorder ? [{ label: "Tipe", value: "Preorder" }] : []),
              ]
            : previewPlaced
              ? [
                  { label: "Sumber", value: "Order hari ini — cutoff proses gudang" },
                  { label: "Kurir", value: previewPlaced.courier || "-" },
                  { label: "Pengiriman", value: previewPlaced.shippingOption || "-" },
                ]
              : undefined
        }
        sections={
          previewRow
            ? [
                ...(previewRow.marketplaceOrder
                  ? [
                      {
                        label: previewRow.marketplace || "Marketplace",
                        order: previewRow.marketplaceOrder,
                      },
                    ]
                  : []),
                ...(previewRow.jubelioOrder
                  ? [{ label: "Jubelio", order: previewRow.jubelioOrder }]
                  : []),
              ]
            : previewPlaced
              ? [{ label: "Marketplace", order: placedTodayAsOrder(previewPlaced) }]
              : []
        }
      />
    </div>
  );
}
