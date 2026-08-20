"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Order } from "@/types/order";
import {
  cn,
  formatCurrency,
  formatDateTime,
  getPlatformName,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";

function Field({ label, value }: { label: string; value?: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-brand-400">{label}</p>
      <div className="text-sm text-brand-800 mt-0.5 break-words">{value}</div>
    </div>
  );
}

function OrderFields({ order, hideMoney }: { order: Order; hideMoney?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
      <Field label="No. pesanan" value={<span className="font-mono font-medium">{order.orderNumber}</span>} />
      <Field label="Ref no" value={order.refNo ? <span className="font-mono">{order.refNo}</span> : null} />
      <Field
        label="Platform"
        value={
          <span>
            {getPlatformName(order.platform)}
            {order.storeName ? ` · ${order.storeName}` : ""}
            {order.channelName ? ` · ${order.channelName}` : ""}
          </span>
        }
      />
      <Field
        label="Status"
        value={
          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", getStatusColor(order.status))}>
            {getStatusLabel(order.status)}
          </span>
        }
      />
      <Field label="Produk" value={order.productName} />
      <Field label="Variasi" value={order.variation} />
      <Field label="SKU" value={order.sku ? <span className="font-mono text-xs">{order.sku}</span> : null} />
      <Field label="Qty" value={order.quantity} />
      {!hideMoney && (
        <>
          <Field label="Harga" value={formatCurrency(order.price)} />
          <Field label="Total" value={<span className="font-semibold">{formatCurrency(order.totalAmount)}</span>} />
        </>
      )}
      <Field label="Pembeli" value={order.customerName} />
      <Field label="Penerima" value={order.recipientName} />
      <Field label="Telepon" value={order.phone} />
      <Field
        label="Alamat"
        value={
          order.shippingAddress || order.city || order.province
            ? [order.shippingAddress, order.city, order.province].filter(Boolean).join(", ")
            : null
        }
      />
      <Field label="Kurir" value={order.courier} />
      <Field label="Opsi kirim" value={order.shippingOption} />
      <Field
        label="Resi"
        value={order.trackingNumber ? <span className="font-mono text-xs">{order.trackingNumber}</span> : null}
      />
      <Field label="Tanggal pesanan" value={order.orderDate ? formatDateTime(order.orderDate) : null} />
      <Field label="Bayar" value={order.paidTime ? formatDateTime(order.paidTime) : null} />
      <Field label="Pickup" value={order.pickupTime ? formatDateTime(order.pickupTime) : null} />
      <Field label="Dikirim" value={order.shippedTime ? formatDateTime(order.shippedTime) : null} />
      <Field label="Batas kirim" value={order.mustShipBefore ? formatDateTime(order.mustShipBefore) : null} />
      <Field label="Berat" value={order.weight ? `${order.weight} g` : null} />
      <Field
        label="Tipe"
        value={
          order.orderType || order.isPreorder
            ? [order.orderType, order.isPreorder ? "Preorder" : ""].filter(Boolean).join(" · ")
            : null
        }
      />
      <div className="sm:col-span-2">
        <Field label="Catatan" value={order.notes} />
      </div>
    </div>
  );
}

export function OrderDetailPreview({
  open,
  onClose,
  title,
  hideMoney,
  sections,
  notes,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hideMoney?: boolean;
  sections: { label: string; order: Order }[];
  notes?: { label: string; value: string }[];
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <motion.button
            type="button"
            aria-label="Tutup preview"
            className="absolute inset-0 bg-brand-900/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Detail pesanan"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
            className="relative w-full max-w-md sm:max-w-lg h-full bg-cream-50 shadow-2xl border-l border-brand-200 flex flex-col"
          >
            <header className="shrink-0 bg-white border-b border-brand-200 px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-brand-400">Preview pesanan</p>
                <h2 className="text-sm sm:text-base font-semibold text-brand-800 font-mono break-all leading-snug">
                  {title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-brand-500 hover:bg-cream-200 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {notes && notes.length > 0 ? (
                <div className="rounded-xl border border-brand-200 bg-white px-3 py-2.5 space-y-1.5">
                  {notes.map((note) => (
                    <p key={note.label} className="text-xs text-brand-700">
                      <span className="text-brand-400">{note.label}: </span>
                      {note.value}
                    </p>
                  ))}
                </div>
              ) : null}

              {sections.map((section) => (
                <section
                  key={`${section.label}-${section.order.id}`}
                  className="rounded-xl border border-brand-200 bg-white p-3 sm:p-4 space-y-3"
                >
                  {sections.length > 1 ? (
                    <h3 className="text-xs font-semibold text-brand-500 uppercase tracking-wide">
                      {section.label}
                    </h3>
                  ) : null}
                  <OrderFields order={section.order} hideMoney={hideMoney} />
                </section>
              ))}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
