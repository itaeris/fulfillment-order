"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  LayoutDashboard,
  LogOut,
  ScanLine,
  XCircle,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import {
  buildDueDateOverview,
  formatAnalyzedAt,
  formatDueLabel,
  jubelioMenuBadge,
  jubelioMenuHint,
  jubelioMenuLabel,
  type DueDateRow,
} from "@/lib/due-date";
import { Order } from "@/types/order";
import { OrderDetailPreview } from "@/components/OrderDetailPreview";
import { PlatformLogo } from "@/components/PlatformLogo";
import {
  buildOrderScanIndex,
  buildOverdueScanIndex,
  cancelledScanOrderIds,
  hydrateOverdueScan,
  isCancelledStatus,
  matchOrderFromIndex,
  matchOverdueScanFromIndex,
  ordersForScan,
  overdueScanMatchFromOrder,
  overdueScanMatchFromRow,
  rowHasId,
  rowIsCancelled,
  rowIsValidated,
  scannedOrderIds,
  scanResultOf,
  type OverdueScan,
  type OverdueScanMatch,
  type OverdueScanStatus,
} from "@/lib/overdue-scan";
import { indonesiaDateKey } from "@/lib/timezone";

type FilterId = "pending" | "valid" | "overdue" | "cancelled" | "all";

interface OverdueScanViewProps {
  orders: Order[];
  scans: OverdueScan[];
  onScansChange: (scans: OverdueScan[]) => void;
  onOrdersChange: (orders: Order[]) => void;
  onSkipShipping: (orders: Order[]) => void;
  onRefresh: () => void;
  onSignOut: () => void;
  workerName?: string;
  placedToday?: {
    total: number;
    shopee: number;
    tiktok: number;
  };
}

let scanBeepCtx: AudioContext | null = null;

function playBeep(status: OverdueScanStatus) {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!scanBeepCtx) scanBeepCtx = new AudioCtx();
    const ctx = scanBeepCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const beep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.07;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    if (status === "valid") beep(880, 0, 0.12);
    else if (status === "duplicate") beep(520, 0, 0.16);
    else if (status === "cancelled") {
      beep(360, 0, 0.1);
      beep(280, 0.12, 0.14);
    } else {
      beep(220, 0, 0.12);
      beep(180, 0.16, 0.16);
    }
  } catch {
    // Scanner tetap jalan tanpa suara.
  }
}

function remainingClass(row: DueDateRow) {
  if (row.overdue) return "text-red-600 font-semibold";
  if (row.dueSoon) return "text-shopee-500 font-semibold";
  if (row.instant) return "text-red-600 font-semibold";
  return "text-brand-800 font-medium";
}

function rowTone(row: DueDateRow, validated: boolean) {
  if (validated) return "bg-green-50";
  if (row.overdue) return "bg-red-50";
  if (row.dueSoon || row.instant) return "bg-amber-50";
  return "";
}

function platformLogo(name?: string) {
  if (name === "Shopee") return "shopee" as const;
  if (name === "TikTok" || name === "Tokopedia") return "tiktok" as const;
  return undefined;
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

function StatCard({
  label,
  value,
  hint,
  valueClass,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  valueClass?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "bg-white rounded-xl shadow-sm border border-brand-200 px-3 py-2.5 sm:px-4 sm:py-3 text-left",
    onClick && "hover:border-brand-400"
  );
  const body = (
    <>
      <p className="text-[11px] sm:text-xs text-brand-400">{label}</p>
      <p className={cn("text-xl sm:text-2xl font-semibold tracking-tight mt-0.5", valueClass || "text-brand-800")}>
        {value}
      </p>
      {hint ? <p className="text-[11px] text-brand-400 mt-0.5">{hint}</p> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

function statusCopy(status: OverdueScanStatus) {
  if (status === "valid") {
    return { title: "Valid — ada di antrian kirim hari ini", className: "bg-green-50 border-green-200 text-green-800" };
  }
  if (status === "duplicate") {
    return { title: "Sudah discan sebelumnya", className: "bg-amber-50 border-amber-200 text-amber-900" };
  }
  if (status === "cancelled") {
    return { title: "Dibatalkan — skip pengiriman", className: "bg-slate-100 border-slate-300 text-slate-800" };
  }
  return { title: "Tidak ada di antrian kirim hari ini", className: "bg-red-50 border-red-200 text-red-800" };
}

function formatScanTime(value: Date) {
  return value.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function OverdueScanView({
  orders,
  scans,
  onScansChange,
  onOrdersChange,
  onSkipShipping,
  onRefresh,
  onSignOut,
  workerName,
  placedToday,
}: OverdueScanViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewOpenRef = useRef(false);
  const scansRef = useRef(scans);
  scansRef.current = scans;
  const [code, setCode] = useState("");
  const [filter, setFilter] = useState<FilterId>("pending");
  const [preview, setPreview] = useState<{
    title: string;
    orders: Order[];
    row?: DueDateRow;
  } | null>(null);
  const [flash, setFlash] = useState<{
    status: OverdueScanStatus;
    code: string;
    orderNumber?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const previewOpen = Boolean(preview);
  previewOpenRef.current = previewOpen;

  const focusScanInput = () => {
    if (previewOpenRef.current) return;
    inputRef.current?.focus({ preventScroll: true });
  };

  const overview = useMemo(() => buildDueDateOverview(orders), [orders]);
  const scanIndex = useMemo(() => buildOverdueScanIndex(overview.rows), [overview.rows]);
  const orderIndex = useMemo(() => buildOrderScanIndex(orders), [orders]);
  const validatedIds = useMemo(() => scannedOrderIds(scans), [scans]);
  const cancelledIds = useMemo(() => cancelledScanOrderIds(scans), [scans]);
  const cancelledScans = useMemo(
    () => scans.filter((scan) => scanResultOf(scan) === "cancelled"),
    [scans]
  );
  const unmatched = useMemo(
    () => scans.filter((scan) => scanResultOf(scan) === "not_in_queue").slice(0, 20),
    [scans]
  );

  const rowsWithStatus = useMemo(
    () =>
      overview.rows
        .filter((row) => !rowHasId(row, cancelledIds) && !rowIsCancelled(row))
        .map((row) => ({
          row,
          validated: rowIsValidated(row, validatedIds),
        })),
    [overview.rows, validatedIds, cancelledIds]
  );

  const validCount = rowsWithStatus.filter((item) => item.validated).length;
  const pendingCount = rowsWithStatus.length - validCount;
  const overduePending = rowsWithStatus.filter((item) => item.row.overdue && !item.validated).length;
  const shippingCount = rowsWithStatus.length;

  const visible = useMemo(() => {
    return rowsWithStatus.filter(({ row, validated }) => {
      if (filter === "pending") return !validated;
      if (filter === "valid") return validated;
      if (filter === "overdue") return row.overdue;
      if (filter === "cancelled") return false;
      return true;
    });
  }, [rowsWithStatus, filter]);

  useEffect(() => {
    focusScanInput();
  }, [previewOpen, flash]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (previewOpen) return;
      const el = inputRef.current;
      if (!el || document.activeElement === el) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length === 1 || event.key === "Enter") {
        el.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [previewOpen]);

  const submitScan = (raw: string) => {
    const next = raw.trim();
    if (!next) return;

    setCode("");
    setError("");
    window.requestAnimationFrame(() => focusScanInput());

    const row = matchOverdueScanFromIndex(next, scanIndex);
    const order = matchOrderFromIndex(next, orderIndex);
    const cancelled = Boolean(
      (row && rowIsCancelled(row)) || (order && isCancelledStatus(order.status))
    );
    const match: OverdueScanMatch | null = row
      ? overdueScanMatchFromRow(row)
      : order
        ? overdueScanMatchFromOrder(order)
        : null;

    let status: OverdueScanStatus = "not_in_queue";
    if (cancelled && match) status = "cancelled";
    else if (row && match) {
      status = rowIsValidated(row, scannedOrderIds(scansRef.current)) ? "duplicate" : "valid";
    } else if (match && cancelledScanOrderIds(scansRef.current).has(match.orderId)) {
      status = "duplicate";
    }

    if (status === "valid" && match && cancelledScanOrderIds(scansRef.current).has(match.orderId)) {
      status = "cancelled";
    }

    if (status === "cancelled" && match) {
      const existing = scansRef.current.find(
        (scan) => scan.orderId === match.orderId && scanResultOf(scan) === "cancelled"
      );
      if (existing) status = "duplicate";
    }

    setFlash({
      status,
      code: next,
      orderNumber: match?.orderNumber,
    });
    playBeep(status);

    if (status === "duplicate") return;

    const scan: OverdueScan = {
      id: crypto.randomUUID(),
      scannedCode: next,
      orderId: match?.orderId,
      orderNumber: match?.orderNumber,
      platform: match?.platform,
      matched: status === "valid" || status === "cancelled",
      result:
        status === "cancelled" ? "cancelled" : status === "valid" ? "valid" : "not_in_queue",
      scannedAt: new Date(),
      scannedBy: workerName,
      scanDate: indonesiaDateKey(),
    };

    if (status === "cancelled" && match) {
      const existingValid = scansRef.current.find(
        (item) => item.matched && item.orderId === match.orderId
      );
      if (existingValid) scan.id = existingValid.id;
    }

    const nextScans = [
      scan,
      ...scansRef.current.filter(
        (item) => item.id !== scan.id && (!scan.orderId || item.orderId !== scan.orderId)
      ),
    ];
    scansRef.current = nextScans;
    onScansChange(nextScans);

    if (status === "cancelled") {
      const kickIds = new Set(
        [row?.marketplaceOrder?.id, row?.jubelioOrder?.id, order?.id, match?.orderId].filter(Boolean) as string[]
      );
      const kicked = orders
        .filter((item) => kickIds.has(item.id))
        .map((item) => ({ ...item, status: "cancelled" as const }));
      if (kicked.length > 0) {
        const kickedIds = new Set(kicked.map((item) => item.id));
        onOrdersChange(orders.map((item) => (kickedIds.has(item.id) ? { ...item, status: "cancelled" } : item)));
        onSkipShipping(kicked);
      }
    }

    void (async () => {
      try {
        const res = await fetch("/api/overdue/scans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: scan.id,
            code: next,
            scannedBy: workerName,
            orderId: match?.orderId,
            orderNumber: match?.orderNumber,
            platform: match?.platform,
            result: status,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: OverdueScanStatus;
          scan?: OverdueScan;
          error?: string;
        };
        if (!res.ok || !data.status || !data.scan) {
          setError(data.error || "Gagal menyimpan scan");
          return;
        }
        const saved = hydrateOverdueScan(data.scan);
        const merged = [saved, ...scansRef.current.filter((item) => item.id !== scan.id && item.id !== saved.id)];
        scansRef.current = merged;
        onScansChange(merged);
        if (data.status !== status) {
          setFlash({
            status: data.status,
            code: next,
            orderNumber: match?.orderNumber || saved.orderNumber,
          });
          playBeep(data.status);
        }
      } catch {
        setError("Gagal menyimpan scan");
      }
    })();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitScan(code);
  };

  const openRowPreview = (row: DueDateRow) => {
    setPreview({
      title: row.orderNumber,
      row,
      orders: [row.marketplaceOrder, row.jubelioOrder].filter(Boolean) as Order[],
    });
  };

  const openScanPreview = (scan: OverdueScan) => {
    const related = ordersForScan(scan, orders);
    const ids = new Set(related.map((item) => item.id));
    const row = overview.rows.find((item) => rowHasId(item, ids));
    setPreview({
      title: scan.orderNumber || scan.scannedCode,
      orders: related,
      row,
    });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-cream-100 text-brand-800">
      <header className="bg-white border-b border-brand-200 px-3 sm:px-6 py-2.5 sm:py-3 shrink-0">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-semibold text-brand-800">Validasi scan</h1>
            <p className="text-[11px] sm:text-xs text-brand-400 mt-0.5">
              Cek barcode antrian kirim hari ini · {formatAnalyzedAt(new Date())}
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
            <Link
              href="/overview-duedate"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-cream-100"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kirim hari ini</span>
              <span className="sm:hidden">Antrian</span>
            </Link>
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

      <div className="bg-white border-b border-brand-200 px-3 sm:px-6 py-3 sm:py-4 shrink-0">
        <form onSubmit={onSubmit} className="max-w-6xl mx-auto space-y-2">
          <label className="text-xs font-medium text-brand-500" htmlFor="overdue-scan">
            Scan barcode, nomor pesanan, atau resi
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-400" />
              <input
                id="overdue-scan"
                ref={inputRef}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                onBlur={() => {
                  window.setTimeout(focusScanInput, 50);
                }}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                placeholder="Arahkan scanner ke sini, lalu Enter"
                className="w-full h-12 sm:h-14 pl-11 pr-3 text-lg sm:text-xl font-mono tracking-wide rounded-xl border border-brand-200 bg-cream-50 text-brand-800 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="submit"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              disabled={!code.trim()}
              className="px-4 sm:px-5 h-12 sm:h-14 text-sm font-medium text-white bg-brand-600 rounded-xl hover:bg-brand-700 disabled:opacity-50"
            >
              Cek
            </button>
          </div>
          {flash ? (
            <button
              type="button"
              onClick={() => {
                const hit = cancelledScans.find(
                  (scan) => scan.orderNumber === flash.orderNumber || scan.scannedCode === flash.code
                ) || scansRef.current.find((scan) => scan.scannedCode === flash.code || scan.orderNumber === flash.orderNumber);
                if (hit) openScanPreview(hit);
                else if (flash.orderNumber) {
                  const row = overview.rows.find((item) => item.orderNumber === flash.orderNumber);
                  if (row) openRowPreview(row);
                }
              }}
              className={cn("w-full rounded-xl border px-3 py-2.5 text-sm text-left", statusCopy(flash.status).className)}
            >
              <p className="font-semibold">{statusCopy(flash.status).title}</p>
              <p className="text-xs mt-0.5 font-mono break-all">
                {flash.orderNumber || flash.code}
              </p>
              {flash.status === "cancelled" ? (
                <p className="text-[11px] mt-1">Klik untuk lihat detail · tidak masuk pengiriman</p>
              ) : null}
            </button>
          ) : null}
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </form>
      </div>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3 sm:space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
            <StatCard
              label="Order hari ini"
              value={formatNumber(placedToday?.total ?? 0)}
              hint="Shopee + TikTok/Tokopedia · cutoff 15.00–15.00 WIB"
            />
            <StatCard
              label="Antrian kirim"
              value={formatNumber(overview.todayProcessCount)}
              hint={
                overview.todayPickedUp > 0
                  ? `${formatNumber(overview.todayPickedUp)} sudah berangkat · total tetap`
                  : "Tenggat hari ini, tidak turun setelah pickup"
              }
            />
            <StatCard
              label="Sisa di gudang"
              value={formatNumber(shippingCount)}
              hint="Belum pickup / instant belum dikirim"
              onClick={() => setFilter("all")}
            />
            <StatCard
              label="Sudah valid"
              value={formatNumber(validCount)}
              valueClass="text-green-700"
              onClick={() => setFilter("valid")}
            />
            <StatCard
              label="Belum dicek"
              value={formatNumber(Math.max(0, pendingCount))}
              valueClass={pendingCount > 0 ? "text-amber-700" : undefined}
              onClick={() => setFilter("pending")}
            />
            <StatCard
              label="Terlambat belum dicek"
              value={formatNumber(overduePending)}
              valueClass={overduePending > 0 ? "text-red-600" : undefined}
              onClick={() => setFilter("overdue")}
            />
            <StatCard
              label="Cancel"
              value={formatNumber(cancelledScans.length)}
              hint="Skip pengiriman"
              valueClass={cancelledScans.length > 0 ? "text-slate-800" : undefined}
              onClick={() => setFilter("cancelled")}
            />
          </div>

          {overview.todayProcessCount === 0 && cancelledScans.length === 0 ? (
            <section className="bg-white rounded-xl shadow-sm border border-brand-200 px-4 py-8 text-center">
              <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-brand-800">Antrian kirim hari ini masih kosong</p>
              <p className="text-xs text-brand-400 mt-1">
                Ambil data dulu di Kirim hari ini, lalu kembali ke halaman ini untuk scan.
              </p>
              <Link
                href="/overview-duedate"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
              >
                <CalendarClock className="w-3.5 h-3.5" />
                Buka Kirim hari ini
              </Link>
            </section>
          ) : null}

          <section className="bg-white rounded-xl shadow-sm border border-brand-200 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-brand-100 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-brand-800">Tabel validasi</h2>
                <p className="text-[11px] text-brand-400">
                  Scan resi atau nomor pesanan. Status tersimpan untuk hari ini (WIB).
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <FilterPill active={filter === "pending"} onClick={() => setFilter("pending")}>
                  Belum {formatNumber(Math.max(0, pendingCount))}
                </FilterPill>
                <FilterPill active={filter === "valid"} onClick={() => setFilter("valid")}>
                  Valid {formatNumber(validCount)}
                </FilterPill>
                <FilterPill active={filter === "overdue"} onClick={() => setFilter("overdue")}>
                  Terlambat {formatNumber(overview.overdue)}
                </FilterPill>
                <FilterPill active={filter === "cancelled"} onClick={() => setFilter("cancelled")}>
                  Cancel {formatNumber(cancelledScans.length)}
                </FilterPill>
                <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
                  Semua {formatNumber(shippingCount)}
                </FilterPill>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-brand-600 border border-brand-200 hover:bg-cream-100"
                >
                  Muat ulang
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-cream-100 text-brand-400">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Status</th>
                    <th className="text-left font-medium px-2 py-2">Pesanan</th>
                    <th className="text-right font-medium px-2 py-2">Qty</th>
                    <th className="text-left font-medium px-2 py-2">Channel</th>
                    <th className="text-left font-medium px-2 py-2">Kurir / resi</th>
                    <th className="text-left font-medium px-2 py-2">Tenggat</th>
                    <th className="text-left font-medium px-2 py-2">Jubelio</th>
                    <th className="text-left font-medium px-3 py-2">Sisa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-100">
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-brand-400">
                        Tidak ada pesanan di filter ini.
                      </td>
                    </tr>
                  ) : (
                    visible.map(({ row, validated }) => {
                      const order = row.marketplaceOrder || row.jubelioOrder;
                      const logo = platformLogo(row.marketplace);
                      return (
                        <tr
                          key={row.key}
                          className={cn("cursor-pointer hover:bg-cream-50", rowTone(row, validated))}
                          onClick={() => openRowPreview(row)}
                        >
                          <td className="px-3 py-2 whitespace-nowrap">
                            {validated ? (
                              <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                                <Check className="w-3.5 h-3.5" />
                                Valid
                              </span>
                            ) : row.overdue ? (
                              <span className="text-red-600 font-semibold">Belum · terlambat</span>
                            ) : (
                              <span className="text-amber-700">Belum</span>
                            )}
                          </td>
                          <td className="px-2 py-2 font-mono font-medium text-brand-800 break-all">
                            {row.orderNumber}
                          </td>
                          <td className="px-2 py-2 text-right">{row.quantity}</td>
                          <td className="px-2 py-2">
                            {logo ? (
                              <PlatformLogo platform={logo} className="h-4 max-w-[5rem]" />
                            ) : (
                              row.marketplace || "—"
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <p>{row.courier || "—"}</p>
                            <p className="font-mono text-[10px] text-brand-400 break-all">
                              {order?.trackingNumber || "—"}
                            </p>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatDueLabel(row.effectiveDue)}</td>
                          <td className="px-2 py-2">
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", jubelioMenuBadge(row).className)}>
                              {jubelioMenuBadge(row).label}
                            </span>
                            {row.jubelioOrder?.orderNumber ? (
                              <p className="font-mono text-[10px] text-brand-400 mt-0.5 break-all">
                                {row.jubelioOrder.orderNumber}
                              </p>
                            ) : null}
                          </td>
                          <td className={cn("px-3 py-2 whitespace-nowrap", remainingClass(row))}>
                            {row.remainingLabel}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {filter === "cancelled" || cancelledScans.length > 0 ? (
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" />
                  Cancel — skip pengiriman
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Order ID hasil scan yang dibatalkan. Tidak masuk tahap pengiriman. Klik baris untuk lihat detail.
                </p>
              </div>
              {cancelledScans.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-brand-400">Belum ada scan cancel hari ini.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {cancelledScans.map((scan) => (
                    <button
                      key={scan.id}
                      type="button"
                      onClick={() => openScanPreview(scan)}
                      className="w-full px-3 sm:px-4 py-2.5 flex items-start justify-between gap-3 text-left hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-mono font-medium break-all text-brand-800">
                          {scan.orderNumber || scan.scannedCode}
                        </p>
                        {scan.orderNumber && scan.scannedCode !== scan.orderNumber ? (
                          <p className="text-[11px] font-mono text-brand-400 break-all mt-0.5">{scan.scannedCode}</p>
                        ) : null}
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {scan.platform || "—"} · klik untuk detail
                        </p>
                      </div>
                      <p className="text-[11px] text-brand-400 whitespace-nowrap">
                        {formatScanTime(scan.scannedAt)}
                        {scan.scannedBy ? ` · ${scan.scannedBy}` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {unmatched.length > 0 ? (
            <section className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 border-b border-red-100">
                <h2 className="text-sm font-semibold text-red-800">Scan tidak di antrian</h2>
                <p className="text-[11px] text-red-500">Kode yang discan tapi tidak ketemu di kirim hari ini.</p>
              </div>
              <div className="divide-y divide-red-50">
                {unmatched.map((scan) => (
                  <div key={scan.id} className="px-3 sm:px-4 py-2 flex items-start justify-between gap-3">
                    <p className="text-xs font-mono break-all text-brand-800">{scan.scannedCode}</p>
                    <p className="text-[11px] text-brand-400 whitespace-nowrap">
                      {formatScanTime(scan.scannedAt)}
                      {scan.scannedBy ? ` · ${scan.scannedBy}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <OrderDetailPreview
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.title || "Detail pesanan"}
        notes={
          preview?.row
            ? [
                { label: "Sisa waktu", value: preview.row.remainingLabel },
                { label: "Kurir", value: preview.row.courier || "-" },
                { label: "Resi", value: (preview.row.marketplaceOrder || preview.row.jubelioOrder)?.trackingNumber || "-" },
                { label: "Menu Jubelio", value: jubelioMenuLabel(preview.row) },
                { label: "Keterangan Jubelio", value: jubelioMenuHint(preview.row) },
                { label: "Catatan", value: preview.row.reason },
              ]
            : preview
              ? [{ label: "Status", value: "Dibatalkan — skip pengiriman" }]
              : undefined
        }
        sections={
          preview?.row
            ? [
                ...(preview.row.marketplaceOrder
                  ? [{ label: preview.row.marketplace || "Marketplace", order: preview.row.marketplaceOrder }]
                  : []),
                ...(preview.row.jubelioOrder
                  ? [{ label: "Jubelio", order: preview.row.jubelioOrder }]
                  : []),
              ]
            : (preview?.orders || []).map((order) => ({
                label: order.platform === "jubelio" ? "Jubelio" : order.platform,
                order,
              }))
        }
      />
    </div>
  );
}
