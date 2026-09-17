"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn, formatDateTime, formatNumber, getStatusColor, getStatusLabel } from "@/lib/utils";
import { jubelioMenuLabel, type DueDateRow } from "@/lib/due-date";
import { PlatformLogo } from "@/components/PlatformLogo";
import type { Order, OrderStatus, Platform } from "@/types/order";

export type StatPreviewItem = {
  key: string;
  orderNumber: string;
  platform?: string;
  status?: string;
  courier?: string;
  meta?: string;
  row?: DueDateRow;
  placed?: PlacedTodayPreviewOrder;
};

export type PlacedTodayPreviewOrder = {
  orderNumber: string;
  platform: string;
  status: string;
  orderDate?: string;
  paidTime?: string;
  courier?: string;
  shippingOption?: string;
};

export function dueDateRowsToPreviewItems(rows: DueDateRow[]): StatPreviewItem[] {
  return rows.map((row) => ({
    key: row.key,
    orderNumber: row.orderNumber,
    platform: row.marketplace || row.marketplaceOrder?.platform || row.jubelioOrder?.platform,
    status: row.marketplaceOrder?.status || row.jubelioOrder?.status,
    courier: row.courier,
    meta: [row.remainingLabel, row.shipping !== "—" ? row.shipping : null, jubelioMenuLabel(row)]
      .filter(Boolean)
      .join(" · "),
    row,
  }));
}

export function placedTodayToPreviewItems(orders: PlacedTodayPreviewOrder[]): StatPreviewItem[] {
  return orders.map((order) => {
    const when = order.paidTime || order.orderDate;
    return {
      key: `${order.platform}|${order.orderNumber}`,
      orderNumber: order.orderNumber,
      platform: order.platform,
      status: order.status,
      courier: order.courier,
      meta: [order.shippingOption, when ? formatDateTime(when) : null].filter(Boolean).join(" · "),
      placed: order,
    };
  });
}

export function placedTodayAsOrder(order: PlacedTodayPreviewOrder): Order {
  const platform = (["shopee", "tiktok", "tokopedia"].includes(order.platform)
    ? order.platform
    : "tiktok") as Platform;
  return {
    id: `${order.platform}|${order.orderNumber}`,
    orderNumber: order.orderNumber,
    platform,
    customerName: "",
    productName: "",
    quantity: 1,
    price: 0,
    totalAmount: 0,
    status: (order.status as OrderStatus) || "processing",
    orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
    paidTime: order.paidTime ? new Date(order.paidTime) : undefined,
    courier: order.courier,
    shippingOption: order.shippingOption,
  };
}

function logoOf(platform?: string): "shopee" | "tiktok" | "jubelio" | undefined {
  const value = String(platform || "").toLowerCase();
  if (value === "shopee") return "shopee";
  if (value === "tiktok" || value === "tokopedia") return "tiktok";
  if (value === "jubelio") return "jubelio";
  return undefined;
}

export function StatListPreview({
  open,
  title,
  subtitle,
  items,
  loading,
  error,
  detailOpen,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  items: StatPreviewItem[];
  loading?: boolean;
  error?: string;
  detailOpen?: boolean;
  onClose: () => void;
  onSelect?: (item: StatPreviewItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCopied(false);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (detailOpen) return;
      onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, detailOpen, onClose]);

  const visible = useMemo(() => {
    const q = query.replace(/[\s\-_.#]+/g, "").toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = [item.orderNumber, item.platform, item.courier, item.meta, item.status]
        .filter(Boolean)
        .join(" ")
        .replace(/[\s\-_.#]+/g, "")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <motion.button
            type="button"
            aria-label="Tutup daftar"
            className="absolute inset-0 bg-brand-900/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!detailOpen) onClose();
            }}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "tween", duration: 0.18, ease: "easeOut" }}
            className="relative w-full max-w-3xl max-h-[88vh] bg-cream-50 shadow-2xl border border-brand-200 rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
          >
            <header className="shrink-0 bg-white border-b border-brand-200 px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-semibold text-brand-800">{title}</h2>
                  <p className="text-[11px] text-brand-400 mt-0.5">
                    {subtitle || `${formatNumber(items.length)} pesanan`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-brand-500 hover:bg-cream-200 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cari nomor, kurir, status"
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-brand-200 bg-cream-50 text-brand-800 placeholder:text-brand-300"
                    autoFocus
                  />
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(visible.map((item) => item.orderNumber).join("\n"));
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    } catch {
                      setCopied(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-brand-800 bg-white border border-brand-200 rounded-lg hover:bg-cream-50 shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Tersalin" : "Salin"}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="px-4 py-8 text-sm text-center text-brand-500">Memuat daftar pesanan…</p>
              ) : error ? (
                <p className="px-4 py-8 text-sm text-center text-red-700">{error}</p>
              ) : visible.length === 0 ? (
                <p className="px-4 py-8 text-sm text-center text-brand-500">Tidak ada pesanan di daftar ini.</p>
              ) : (
                <div className="divide-y divide-brand-100">
                  {visible.map((item) => {
                    const logo = logoOf(item.platform);
                    const clickable = Boolean(onSelect);
                    const body = (
                      <>
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-medium text-brand-800 break-all">{item.orderNumber}</p>
                          <p className="text-[11px] text-brand-400 mt-0.5 truncate">
                            {[item.courier, item.meta].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {logo ? <PlatformLogo platform={logo} className="h-5 max-w-[5.5rem]" /> : null}
                          {item.status ? (
                            <span
                              className={cn(
                                "inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                                getStatusColor(item.status)
                              )}
                            >
                              {getStatusLabel(item.status)}
                            </span>
                          ) : null}
                        </div>
                      </>
                    );
                    if (clickable) {
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => onSelect?.(item)}
                          className="w-full px-4 py-2.5 flex items-start justify-between gap-3 text-left hover:bg-white"
                        >
                          {body}
                        </button>
                      );
                    }
                    return (
                      <div key={item.key} className="px-4 py-2.5 flex items-start justify-between gap-3">
                        {body}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
