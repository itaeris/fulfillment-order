"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, LogOut, Search, X } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import {
  buildDueDateOverview,
  formatAnalyzedAt,
  formatDueLabel,
  type DueDateRow,
} from "@/lib/due-date";
import { Order } from "@/types/order";
import { OrderDetailPreview } from "@/components/OrderDetailPreview";

async function copyOrderNumbers(rows: DueDateRow[]) {
  const text = rows.map((row) => row.orderNumber).join("\n");
  await navigator.clipboard.writeText(text);
}

function CopyButton({
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
  if (rows.length === 0) return null;
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
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-brand-800 bg-white border border-brand-200 rounded-lg hover:bg-cream-50"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Tersalin" : "Salin semua nomor"}
    </button>
  );
}

function matchesQuery(row: DueDateRow, query: string) {
  const q = query.replace(/[\s\-_.#]+/g, "").toLowerCase();
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
}

interface CerminJubelioFullViewProps {
  orders: Order[];
  onSignOut: () => void;
  workerName?: string;
}

export default function CerminJubelioFullView({
  orders,
  onSignOut,
  workerName,
}: CerminJubelioFullViewProps) {
  const overview = useMemo(() => buildDueDateOverview(orders), [orders]);
  const [query, setQuery] = useState("");
  const [copiedList, setCopiedList] = useState<string | null>(null);
  const [previewRow, setPreviewRow] = useState<DueDateRow | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const missingRows = useMemo(
    () => overview.missingJubelioRows.filter((row) => matchesQuery(row, query)),
    [overview.missingJubelioRows, query]
  );
  const jubelioOnlyRows = useMemo(
    () => overview.jubelioOnlyRows.filter((row) => matchesQuery(row, query)),
    [overview.jubelioOnlyRows, query]
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-cream-100 text-brand-800">
      <header className="bg-white border-b border-brand-200 px-3 sm:px-6 py-2.5 sm:py-3 shrink-0">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-semibold text-brand-800">Cermin Jubelio</h1>
            <p className="text-[11px] sm:text-xs text-brand-400 mt-0.5">
              {formatNumber(overview.jubelio)} dari {formatNumber(overview.totalOrders)} pesanan Shopee / TikTok / Tokopedia sudah tercermin
              {workerName ? ` · ${workerName}` : ""} · {formatAnalyzedAt(now)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              href="/overview-duedate"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-cream-100"
            >
              Kirim hari ini
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
        <div className="relative mt-2.5 max-w-xl">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-300" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nomor pesanan, source, atau resi..."
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-brand-200 rounded-lg bg-cream-50 text-brand-800 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-brand-400 hover:text-brand-700"
              aria-label="Hapus pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </header>

      <main className="flex-1 min-h-0 p-3 sm:p-4">
        <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0">
          <section className="bg-white rounded-xl shadow-sm border border-brand-200 flex flex-col min-h-0 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-amber-100 bg-amber-50/80 flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-amber-900">
                  Ada di Shopee / TikTok / Tokopedia, belum di Jubelio
                </h2>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  {formatNumber(missingRows.length)}
                  {query.trim() ? ` dari ${formatNumber(overview.missingJubelioRows.length)}` : ""} nomor — sudah dicari by ID di Jubelio
                </p>
              </div>
              <CopyButton
                rows={missingRows}
                listId="missing"
                copiedList={copiedList}
                onCopied={setCopiedList}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {missingRows.length === 0 ? (
                <p className="px-4 py-8 text-sm text-brand-400 text-center">Tidak ada.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b border-brand-100 text-[11px] text-brand-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">No. pesanan</th>
                      <th className="text-left font-medium px-3 py-2">Platform</th>
                      <th className="text-left font-medium px-3 py-2">Tenggat</th>
                      <th className="text-left font-medium px-3 py-2">Kurir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100">
                    {missingRows.map((row) => (
                      <tr
                        key={row.key}
                        onClick={() => setPreviewRow(row)}
                        className="cursor-pointer hover:bg-cream-50"
                      >
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-brand-800 break-all">
                          {row.orderNumber}
                        </td>
                        <td className="px-3 py-2 text-xs text-brand-700 whitespace-nowrap">
                          {row.marketplace || "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-brand-600 whitespace-nowrap">
                          {formatDueLabel(row.marketplaceDue)}
                        </td>
                        <td className="px-3 py-2 text-xs text-brand-500">{row.courier}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-brand-200 flex flex-col min-h-0 overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 border-b border-brand-100 bg-cream-50 flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-brand-800">
                  Ada di Jubelio, tidak di Shopee / TikTok / Tokopedia
                </h2>
                <p className="text-[11px] text-brand-500 mt-0.5">
                  {formatNumber(jubelioOnlyRows.length)}
                  {query.trim() ? ` dari ${formatNumber(overview.jubelioOnlyRows.length)}` : ""} nomor — tidak masuk antrian / total kirim
                </p>
              </div>
              <CopyButton
                rows={jubelioOnlyRows}
                listId="jubelioOnly"
                copiedList={copiedList}
                onCopied={setCopiedList}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {jubelioOnlyRows.length === 0 ? (
                <p className="px-4 py-8 text-sm text-brand-400 text-center">Tidak ada.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b border-brand-100 text-[11px] text-brand-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">No. pesanan</th>
                      <th className="text-left font-medium px-3 py-2">Tenggat Jubelio</th>
                      <th className="text-left font-medium px-3 py-2">Kurir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100">
                    {jubelioOnlyRows.map((row) => (
                      <tr
                        key={row.key}
                        onClick={() => setPreviewRow(row)}
                        className="cursor-pointer hover:bg-cream-50"
                      >
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-brand-800 break-all">
                          {row.orderNumber}
                        </td>
                        <td className="px-3 py-2 text-xs text-brand-600 whitespace-nowrap">
                          {formatDueLabel(row.jubelioDue)}
                        </td>
                        <td className="px-3 py-2 text-xs text-brand-500">{row.courier}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
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
                { label: "Tenggat marketplace", value: formatDueLabel(previewRow.marketplaceDue) },
                { label: "Tenggat Jubelio", value: formatDueLabel(previewRow.jubelioDue) },
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
