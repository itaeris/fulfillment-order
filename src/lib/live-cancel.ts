import { isCancelledStatus } from "@/lib/overdue-scan";
import { expandMatchKeys, isTrackingLikeCode, normalizeMatchKey } from "@/lib/order-match";
import type { Order } from "@/types/order";

export type CancelAlert = {
  id: string;
  orderNumber: string;
  platform?: string;
  source: "scan" | "live" | "queue";
  reason?: string;
  reasonCode?: string;
  at: Date;
  dismissed?: boolean;
};

export function cancelAlertMatchKey(orderNumber: string) {
  const canonical = canonicalizeCancelNumber(orderNumber);
  const keys = expandMatchKeys(canonical);
  if (keys.length === 0) return normalizeMatchKey(canonical);
  return keys.reduce((shortest, key) => (key.length < shortest.length ? key : shortest));
}

/** Nomor yang dipakai log cancel: SN Shopee / ID TikTok, bukan SP- Jubelio. */
export function canonicalizeCancelNumber(orderNumber: string) {
  const raw = String(orderNumber || "").trim();
  if (!raw) return "";
  const stripped = raw.replace(/^(SP|TT|TP|TTS|SHOPEE|TOKOPEDIA|TOKPED)-/i, "").trim();
  return stripped || raw;
}

function cancelNumberScore(orderNumber: string, platform?: string) {
  if (!orderNumber) return -1;
  if (isTrackingLikeCode(orderNumber)) return 0;
  if (platform === "jubelio" || /^(SP|TT|TP)-/i.test(orderNumber)) return 1;
  return 2;
}

export function preferMarketplaceCancelOrders(orders: Order[]): Order[] {
  const byKey = new Map<string, Order>();
  const ranked = [...orders].sort(
    (a, b) =>
      cancelNumberScore(b.orderNumber, b.platform) - cancelNumberScore(a.orderNumber, a.platform)
  );
  for (const order of ranked) {
    const orderNumber = canonicalizeCancelNumber(order.orderNumber);
    if (!orderNumber || isTrackingLikeCode(orderNumber)) continue;
    const platform =
      order.platform === "jubelio"
        ? /^\d{10,}$/.test(orderNumber)
          ? "tiktok"
          : "shopee"
        : order.platform;
    const key = cancelAlertMatchKey(orderNumber);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, { ...order, orderNumber, platform });
  }
  return Array.from(byKey.values());
}

export function orderMatchesScanKeys(orderNumber: string, scanKeys: Set<string>) {
  return expandMatchKeys(orderNumber).some((key) => scanKeys.has(key));
}

export function takeNewlyCancelled(prev: Order[], next: Order[]): Order[] {
  const prevStatus = new Map(prev.map((order) => [order.id, order.status]));
  return next.filter(
    (order) => isCancelledStatus(order.status) && !isCancelledStatus(prevStatus.get(order.id))
  );
}

export function dropCancelledOrders(orders: Order[]): Order[] {
  return orders.filter((order) => !isCancelledStatus(order.status));
}

export function makeCancelAlert(
  orderNumber: string,
  source: CancelAlert["source"],
  extra?: { platform?: string; reason?: string; reasonCode?: string }
): CancelAlert {
  return {
    id: `${source}-${cancelAlertMatchKey(orderNumber)}-${Date.now()}`,
    orderNumber: canonicalizeCancelNumber(orderNumber) || orderNumber,
    platform: extra?.platform,
    source,
    reason: extra?.reason,
    reasonCode: extra?.reasonCode,
    at: new Date(),
  };
}

export function fallbackCancelReason(source: CancelAlert["source"], platform?: string) {
  const channel =
    platform === "shopee" ? "Shopee" : platform === "tokopedia" ? "Tokopedia" : platform === "tiktok" ? "TikTok" : "channel";
  if (source === "scan") return `Status batal di ${channel} saat scan`;
  if (source === "queue") return `Pesanan batal di ${channel} sebelum discan`;
  return `Customer batal pesanan di ${channel}`;
}
