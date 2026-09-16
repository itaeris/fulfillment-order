import { isCancelledStatus } from "@/lib/overdue-scan";
import type { Order } from "@/types/order";

export type CancelAlert = {
  id: string;
  orderNumber: string;
  source: "scan" | "live";
  at: Date;
};

export function takeNewlyCancelled(prev: Order[], next: Order[]): Order[] {
  const prevStatus = new Map(prev.map((order) => [order.id, order.status]));
  return next.filter(
    (order) => isCancelledStatus(order.status) && !isCancelledStatus(prevStatus.get(order.id))
  );
}

export function dropCancelledOrders(orders: Order[]): Order[] {
  return orders.filter((order) => !isCancelledStatus(order.status));
}

export function makeCancelAlert(orderNumber: string, source: CancelAlert["source"]): CancelAlert {
  return {
    id: `${source}-${orderNumber}-${Date.now()}`,
    orderNumber,
    source,
    at: new Date(),
  };
}
