"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Clock,
  LogOut,
  Upload,
  LayoutDashboard,
  Bell,
} from "lucide-react";
import Link from "next/link";
import { cn, formatNumber } from "@/lib/utils";
import {
  buildDueDateOverview,
  formatAnalyzedAt,
  formatDueLabel,
  type DueDateRow,
} from "@/lib/due-date";
import { Order, Platform } from "@/types/order";
import { OrderDetailPreview } from "@/components/OrderDetailPreview";

export type OverviewUploadResult = {
  count: number;
  matched?: number;
  platform: Platform;
  reconciled: boolean;
  apiError?: string;
};

interface DueDateOverviewViewProps {
  orders: Order[];
  onUploadExcel: (file: File, platform: Platform) => Promise<OverviewUploadResult>;
  onClear: () => Promise<void> | void;
  lastShopeeFile?: string | null;
  lastTiktokFile?: string | null;
  lastJubelioFile?: string | null;
  onSignOut: () => void;
  workerName?: string;
}

function StatCard({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string | number;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-brand-200 px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="text-[11px] sm:text-xs text-brand-400">{label}</p>
      <p className={cn("text-xl sm:text-2xl font-semibold tracking-tight mt-0.5", valueClass || "text-brand-800")}>
        {value}
      </p>
      {hint ? <p className="text-[11px] text-brand-400 mt-0.5">{hint}</p> : null}
    </div>
  );
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

type TypeFilter = "instant" | "regular" | "all";
type PlatformFilter = "all" | "shopee" | "tiktok" | "jubelio";

function rowPlatform(row: DueDateRow): Exclude<PlatformFilter, "all"> {
  if (row.marketplace === "Shopee") return "shopee";
  if (row.marketplace === "TikTok" || row.marketplace === "Tokopedia") return "tiktok";
  return "jubelio";
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
  onUploadExcel,
  onClear,
  lastShopeeFile,
  lastTiktokFile,
  lastJubelioFile,
  onSignOut,
  workerName,
}: DueDateOverviewViewProps) {
  const [showUpload, setShowUpload] = useState(orders.length === 0);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("instant");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [previewRow, setPreviewRow] = useState<DueDateRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<Platform>("shopee");

  const overview = useMemo(() => buildDueDateOverview(orders), [orders]);
  const liveNow = useGoogleClock();
  const maxCourier = Math.max(1, ...overview.couriers.map((c) => c.orders));
  const busy = uploading;

  const matchesType = (row: DueDateRow) => {
    if (typeFilter === "instant") return row.instant;
    if (typeFilter === "regular") return !row.instant;
    return true;
  };
  const matchesPlatform = (row: DueDateRow) => {
    if (platformFilter === "all") return true;
    return rowPlatform(row) === platformFilter;
  };
  const visibleRows = overview.rows.filter((row) => matchesType(row) && matchesPlatform(row));
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
      return rowPlatform(row) === id;
    }).length;

  const openUpload = (platform: Platform) => {
    uploadTarget.current = platform;
    fileRef.current?.click();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadMsg("");
    try {
      let total = 0;
      const notes: string[] = [];
      for (const file of Array.from(files)) {
        const result = await onUploadExcel(file, uploadTarget.current);
        total += result.count;
        const label =
          result.platform === "jubelio"
            ? "Jubelio"
            : result.platform === "shopee"
              ? "Shopee"
              : "TikTok";
        if (result.reconciled && typeof result.matched === "number") {
          notes.push(`${result.matched}/${result.count} dicocokkan ${label}`);
        }
        if (result.apiError) notes.push(result.apiError);
      }
      setUploadMsg(
        notes.length > 0
          ? `${total} pesanan dari Excel. ${notes.join(" · ")}`
          : `${total} pesanan masuk dari Excel.`
      );
    } catch {
      setUploadMsg("Gagal membaca file. Coba lagi.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const mustSendNow = overview.overdue + overview.dueSoon;
  const wajibCount = mustSendNow > 0 ? mustSendNow : overview.critical;
  const shopeeShare = overview.totalOrders
    ? Math.round((overview.shopee / overview.totalOrders) * 100)
    : 0;
  const tiktokShare = overview.totalOrders
    ? Math.round((overview.tiktok / overview.totalOrders) * 100)
    : 0;

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
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-500 border border-brand-200 rounded-lg hover:bg-cream-100"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </Link>
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
            >
              <Upload className="w-3.5 h-3.5" />
              Unggah data
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
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3 sm:space-y-5">
          {showUpload && (
            <section className="bg-white rounded-xl shadow-sm border border-brand-200 p-3 sm:p-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-brand-800">Masukkan data 3 platform</h2>
                <p className="text-xs text-brand-400 mt-0.5">
                  Daily worker wajib unggah Excel/CSV dari Shopee, TikTok, dan Jubelio.
                  TikTok & Jubelio otomatis dicocokkan dengan data realtime toko/gudang.
                  Data halaman ini terpisah dari dashboard utama.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="flex flex-col gap-1.5 rounded-lg border border-brand-200 px-3 py-2.5">
                  <span className="text-xs font-semibold text-shopee-500">Shopee</span>
                  <button
                    type="button"
                    onClick={() => openUpload("shopee")}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-50 text-left"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? "Mengunggah..." : "Unggah Excel/CSV"}
                  </button>
                  <span className="text-[11px] text-brand-400">
                    {lastShopeeFile || "Belum ada file"}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 rounded-lg border border-brand-200 px-3 py-2.5">
                  <span className="text-xs font-semibold text-brand-800">TikTok / Tokopedia</span>
                  <button
                    type="button"
                    onClick={() => openUpload("tiktok")}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-50 text-left"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? "Mengunggah & mencocokkan..." : "Unggah Excel/CSV"}
                  </button>
                  <span className="text-[11px] text-brand-400">
                    {lastTiktokFile || "Belum ada file"}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 rounded-lg border border-brand-200 px-3 py-2.5">
                  <span className="text-xs font-semibold text-brand-800">Jubelio</span>
                  <button
                    type="button"
                    onClick={() => openUpload("jubelio")}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-50 text-left"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? "Mengunggah & mencocokkan..." : "Unggah Excel/CSV"}
                  </button>
                  <span className="text-[11px] text-brand-400">
                    {lastJubelioFile || "Belum ada file"}
                  </span>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              {uploadMsg ? <p className="text-xs text-brand-500">{uploadMsg}</p> : null}
              <button
                type="button"
                disabled={busy || orders.length === 0}
                onClick={async () => {
                  if (!window.confirm("Hapus data halaman ini saja? Data dashboard utama tidak berubah.")) return;
                  await onClear();
                  setUploadMsg("Data halaman ini sudah dikosongkan.");
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
                  {formatNumber(overview.totalOrders)} pesanan perlu dikirim hari ini
                  ({formatNumber(overview.totalItems)} item). Preorder yang jatuh tempo hari ini ikut dihitung.
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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            <StatCard
              label="Perlu dikirim hari ini"
              value={formatNumber(overview.totalOrders)}
              hint={`${formatNumber(overview.totalItems)} item${overview.preorder ? ` · ${overview.preorder} preorder` : ""}`}
            />
            <StatCard
              label="Wajib dikirim sekarang"
              value={formatNumber(wajibCount)}
              valueClass="text-red-600"
              hint="Terlambat / sisa ≤ 1 jam. Jangan ditunda."
            />
            <StatCard
              label="Shopee"
              value={formatNumber(overview.shopee)}
              valueClass="text-shopee-500"
              hint="Pesanan Shopee yang perlu dikirim hari ini"
            />
            <StatCard
              label="TikTok / Tokopedia"
              value={formatNumber(overview.tiktok)}
              hint="Pesanan TikTok / Tokopedia yang perlu dikirim hari ini"
            />
            <StatCard
              label="Jubelio"
              value={formatNumber(overview.totalOrders - overview.shopee - overview.tiktok)}
              hint="Hanya di gudang, belum ketemu di Shopee / TikTok"
            />
          </div>

          <section className="bg-white rounded-xl shadow-sm border border-brand-200 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-brand-100">
              <h2 className="text-sm font-semibold text-brand-800">Pesanan per tenggat</h2>
              <p className="text-[11px] text-brand-400">Termasuk preorder yang jatuh tempo hari ini.</p>
            </div>
            {overview.buckets.length === 0 ? (
              <p className="px-4 py-8 text-sm text-brand-400 text-center">
                Belum ada pesanan untuk hari ini. Unggah data dulu.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-cream-100 text-brand-400">
                    <tr>
                      <th className="text-left font-medium px-3 sm:px-4 py-2">Tenggat</th>
                      <th className="text-right font-medium px-2 py-2">Pesanan</th>
                      <th className="text-right font-medium px-2 py-2">Qty</th>
                      <th className="text-right font-medium px-2 py-2 text-shopee-500">Shopee</th>
                      <th className="text-right font-medium px-2 py-2">TikTok</th>
                      <th className="text-right font-medium px-2 py-2 hidden sm:table-cell">Jubelio</th>
                      <th className="text-right font-medium px-2 py-2">Instant</th>
                      <th className="text-right font-medium px-3 sm:px-4 py-2 hidden sm:table-cell">Same-day</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100">
                    {overview.buckets.map((bucket) => (
                      <tr key={bucket.key} className="hover:bg-cream-50">
                        <td className="px-3 sm:px-4 py-2 font-medium text-brand-800">{bucket.label}</td>
                        <td className="px-2 py-2 text-right">{bucket.orders}</td>
                        <td className="px-2 py-2 text-right">{bucket.quantity}</td>
                        <td className="px-2 py-2 text-right text-shopee-500">{bucket.shopee}</td>
                        <td className="px-2 py-2 text-right">{bucket.tiktok}</td>
                        <td className="px-2 py-2 text-right hidden sm:table-cell">{bucket.jubelio}</td>
                        <td className="px-2 py-2 text-right">{bucket.instant}</td>
                        <td className="px-3 sm:px-4 py-2 text-right hidden sm:table-cell">{bucket.sameDay}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                    { id: "jubelio" as const, label: "Jubelio" },
                  ]).map((tab) => (
                    <FilterPill key={tab.id} active={platformFilter === tab.id} onClick={() => setPlatformFilter(tab.id)}>
                      {tab.label} {platformCount(tab.id)}
                    </FilterPill>
                  ))}
                </div>
              </div>
            </div>

            {visibleRows.length === 0 ? (
              <p className="px-4 py-8 text-sm text-brand-400 text-center">Tidak ada pesanan di filter ini.</p>
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
                      <p className="text-[11px]">
                        Marketplace {formatDueLabel(row.marketplaceDue)} · Jubelio {formatDueLabel(row.jubelioDue)}
                      </p>
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
                          <td className="px-3 py-2 font-medium">{row.orderNumber}</td>
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
      <OrderDetailPreview
        open={!!previewRow}
        onClose={() => setPreviewRow(null)}
        title={previewRow?.orderNumber || "Detail pesanan"}
        notes={
          previewRow
            ? [
                { label: "Sisa waktu", value: previewRow.remainingLabel },
                { label: "Kurir", value: previewRow.courier || "-" },
                { label: "Catatan", value: previewRow.reason },
                ...(previewRow.preorder ? [{ label: "Tipe", value: "Preorder" }] : []),
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
            : []
        }
      />
    </div>
  );
}
