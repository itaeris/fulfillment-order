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
  rowIsValidated,
  scannedOrderIds,
  type OverdueScan,
  type OverdueScanStatus,
} from "@/lib/overdue-scan";

function hydrateScanLike(scan: OverdueScan): OverdueScan {
  return {
    ...scan,
    scannedAt: scan.scannedAt ? new Date(scan.scannedAt) : new Date(),
  };
}

type FilterId = "pending" | "valid" | "overdue" | "all";

interface OverdueScanViewProps {
  orders: Order[];
  scans: OverdueScan[];
  onScansChange: (scans: OverdueScan[]) => void;
  onRefresh: () => void;
  onSignOut: () => void;
  workerName?: string;
}

function playBeep(status: OverdueScanStatus) {
  try {
    const ctx = new AudioContext();
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
    else {
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

function statusCopy(status: OverdueScanStatus) {
  if (status === "valid") {
    return { title: "Valid — ada di antrian kirim hari ini", className: "bg-green-50 border-green-200 text-green-800" };
  }
  if (status === "duplicate") {
    return { title: "Sudah discan sebelumnya", className: "bg-amber-50 border-amber-200 text-amber-900" };
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
  onRefresh,
  onSignOut,
  workerName,
}: OverdueScanViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<FilterId>("pending");
  const [previewRow, setPreviewRow] = useState<DueDateRow | null>(null);
  const [flash, setFlash] = useState<{
    status: OverdueScanStatus;
    code: string;
    orderNumber?: string;
  } | null>(null);
  const [error, setError] = useState("");

  const overview = useMemo(() => buildDueDateOverview(orders), [orders]);
  const validatedIds = useMemo(() => scannedOrderIds(scans), [scans]);
  const unmatched = useMemo(
    () => scans.filter((scan) => !scan.matched).slice(0, 20),
    [scans]
  );

  const rowsWithStatus = useMemo(
    () =>
      overview.rows.map((row) => ({
        row,
        validated: rowIsValidated(row, validatedIds),
      })),
    [overview.rows, validatedIds]
  );

  const validCount = rowsWithStatus.filter((item) => item.validated).length;
  const pendingCount = overview.totalOrders - validCount;
  const overduePending = rowsWithStatus.filter((item) => item.row.overdue && !item.validated).length;

  const visible = useMemo(() => {
    return rowsWithStatus.filter(({ row, validated }) => {
      if (filter === "pending") return !validated;
      if (filter === "valid") return validated;
      if (filter === "overdue") return row.overdue;
      return true;
    });
  }, [rowsWithStatus, filter]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submitScan = async (raw: string) => {
    const next = raw.trim();
    if (!next || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/overdue/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: next, scannedBy: workerName }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: OverdueScanStatus;
        scan?: OverdueScan;
        match?: { orderNumber?: string } | null;
        error?: string;
      };
      if (!res.ok || !data.status || !data.scan) {
        setError(data.error || "Gagal menyimpan scan");
        playBeep("not_in_queue");
        return;
      }
      const scan = hydrateScanLike(data.scan);
      onScansChange([scan, ...scans.filter((item) => item.id !== scan.id)]);
      setFlash({
        status: data.status,
        code: next,
        orderNumber: data.match?.orderNumber,
      });
      playBeep(data.status);
    } catch {
      setError("Gagal menyimpan scan");
      playBeep("not_in_queue");
    } finally {
      setCode("");
      setSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitScan(code);
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
                onBlur={(event) => {
                  const next = event.relatedTarget as HTMLElement | null;
                  if (next?.closest("a,button,input,textarea,[role='dialog']")) return;
                  window.setTimeout(() => inputRef.current?.focus(), 120);
                }}
                disabled={submitting}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Arahkan scanner ke sini, lalu Enter"
                className="w-full h-12 sm:h-14 pl-11 pr-3 text-lg sm:text-xl font-mono tracking-wide rounded-xl border border-brand-200 bg-cream-50 text-brand-800 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="px-4 sm:px-5 h-12 sm:h-14 text-sm font-medium text-white bg-brand-600 rounded-xl hover:bg-brand-700 disabled:opacity-50"
            >
              Cek
            </button>
          </div>
          {flash ? (
            <div className={cn("rounded-xl border px-3 py-2.5 text-sm", statusCopy(flash.status).className)}>
              <p className="font-semibold">{statusCopy(flash.status).title}</p>
              <p className="text-xs mt-0.5 font-mono break-all">
                {flash.orderNumber || flash.code}
              </p>
            </div>
          ) : null}
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </form>
      </div>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-5 space-y-3 sm:space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <StatCard label="Antrian hari ini" value={formatNumber(overview.totalOrders)} hint="Shopee + TikTok" />
            <StatCard
              label="Sudah valid"
              value={formatNumber(validCount)}
              valueClass="text-green-700"
            />
            <StatCard
              label="Belum dicek"
              value={formatNumber(Math.max(0, pendingCount))}
              valueClass={pendingCount > 0 ? "text-amber-700" : undefined}
            />
            <StatCard
              label="Terlambat belum dicek"
              value={formatNumber(overduePending)}
              valueClass={overduePending > 0 ? "text-red-600" : undefined}
            />
          </div>

          {overview.totalOrders === 0 ? (
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
                <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
                  Semua {formatNumber(overview.totalOrders)}
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
                          onClick={() => setPreviewRow(row)}
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
        open={!!previewRow}
        onClose={() => setPreviewRow(null)}
        title={previewRow?.orderNumber || "Detail pesanan"}
        notes={
          previewRow
            ? [
                { label: "Sisa waktu", value: previewRow.remainingLabel },
                { label: "Kurir", value: previewRow.courier || "-" },
                { label: "Resi", value: (previewRow.marketplaceOrder || previewRow.jubelioOrder)?.trackingNumber || "-" },
                { label: "Menu Jubelio", value: jubelioMenuLabel(previewRow) },
                { label: "Keterangan Jubelio", value: jubelioMenuHint(previewRow) },
                { label: "Catatan", value: previewRow.reason },
              ]
            : undefined
        }
        sections={
          previewRow
            ? [
                ...(previewRow.marketplaceOrder
                  ? [{ label: previewRow.marketplace || "Marketplace", order: previewRow.marketplaceOrder }]
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
