import { isCancelledStatus } from "@/lib/overdue-scan";
import { expandMatchKeys, normalizeMatchKey } from "@/lib/order-match";
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
  const keys = expandMatchKeys(orderNumber);
  if (keys.length === 0) return normalizeMatchKey(orderNumber);
  return keys.reduce((shortest, key) => (key.length < shortest.length ? key : shortest));
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
    orderNumber,
    platform: extra?.platform,
    source,
    reason: extra?.reason,
    reasonCode: extra?.reasonCode,
    at: new Date(),
  };
}
