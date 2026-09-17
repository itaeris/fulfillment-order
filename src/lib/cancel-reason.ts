import { cancelAlertMatchKey } from "@/lib/live-cancel";
import { fetchShopeeCancelNotes, getShopeeConfig } from "@/lib/shopee-api";
import { fetchTikTokCancelNotes, getTikTokConfig } from "@/lib/tiktok-api";

export type CancelAlertSource = "scan" | "live" | "queue";

const SHOPEE_REASON: Record<string, string> = {
  OUT_OF_STOCK: "Stok habis",
  UNDELIVERABLE_AREA: "Alamat tidak terjangkau kurir",
  SHOP_CLOSE: "Toko tutup / tidak aktif",
  BUYER_CANCELLED: "Pembeli membatalkan",
  BUYER_REQUEST: "Pembeli minta batal",
  SELLER_CANCELLED: "Penjual membatalkan",
  SYSTEM_CANCELLED: "Dibatalkan sistem Shopee",
  PAID_WRONG_PRICE: "Salah harga",
  UNPAID: "Tidak dibayar",
  LOGISTICS_UNAVAILABLE: "Kurir tidak tersedia",
  FAILED_DELIVERY: "Pengiriman gagal",
};

const TIKTOK_REASON: Record<string, string> = {
  BUYER: "Pembeli membatalkan",
  SELLER: "Penjual membatalkan",
  SYSTEM: "Dibatalkan sistem TikTok/Tokopedia",
  OUT_OF_STOCK: "Stok habis",
  BUYER_CANCEL: "Pembeli membatalkan",
  SELLER_CANCEL: "Penjual membatalkan",
};

function humanizeCode(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const key = raw.replace(/[\s-]+/g, "_").toUpperCase();
  return (
    SHOPEE_REASON[key] ||
    TIKTOK_REASON[key] ||
    raw
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function fallbackCancelReason(source: CancelAlertSource, platform?: string) {
  const channel =
    platform === "shopee" ? "Shopee" : platform === "tokopedia" ? "Tokopedia" : platform === "tiktok" ? "TikTok" : "channel";
  if (source === "scan") return `Status batal di ${channel} saat scan`;
  if (source === "queue") return `Pesanan batal di ${channel} sebelum discan`;
  return `Customer batal pesanan di ${channel}`;
}

export function describeCancelReason(args: {
  source: CancelAlertSource;
  platform?: string;
  reason?: string | null;
  reasonCode?: string | null;
  initiator?: string | null;
}) {
  const who = humanizeCode(args.initiator);
  const why = humanizeCode(args.reason) || humanizeCode(args.reasonCode);
  if (who && why && who.toLowerCase() !== why.toLowerCase()) return `${who} — ${why}`;
  if (why) return why;
  if (who) return who;
  return fallbackCancelReason(args.source, args.platform);
}

export async function lookupCancelReasons(
  items: { orderNumber: string; platform?: string }[]
): Promise<Map<string, { reason: string; reasonCode?: string }>> {
  const found = new Map<string, { reason: string; reasonCode?: string }>();
  const shopee: string[] = [];
  const tiktok: string[] = [];
  for (const item of items) {
    const number = String(item.orderNumber || "").trim();
    if (!number) continue;
    const platform = String(item.platform || "").toLowerCase();
    if (platform === "tiktok" || platform === "tokopedia" || /^\d{10,}$/.test(number)) tiktok.push(number);
    else shopee.push(number);
  }

  if (shopee.length > 0) {
    try {
      const config = await getShopeeConfig();
      const notes = await fetchShopeeCancelNotes(config, shopee);
      for (const [number, note] of Array.from(notes.entries())) {
        found.set(cancelAlertMatchKey(number), {
          reason: describeCancelReason({
            source: "live",
            platform: "shopee",
            reason: note.reason,
            reasonCode: note.reasonCode,
            initiator: note.initiator,
          }),
          reasonCode: note.reasonCode,
        });
      }
    } catch {
      // Alasan fallback tetap dipakai.
    }
  }
  if (tiktok.length > 0) {
    try {
      const config = await getTikTokConfig();
      const notes = await fetchTikTokCancelNotes(config, tiktok);
      for (const [number, note] of Array.from(notes.entries())) {
        found.set(cancelAlertMatchKey(number), {
          reason: describeCancelReason({
            source: "live",
            platform: "tiktok",
            reason: note.reason,
            reasonCode: note.reasonCode,
            initiator: note.initiator,
          }),
          reasonCode: note.reasonCode,
        });
      }
    } catch {
      // Alasan fallback tetap dipakai.
    }
  }
  return found;
}
