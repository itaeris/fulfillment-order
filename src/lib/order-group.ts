import { Order, OrderItem } from "@/types/order";
import { normalizeMatchKey } from "@/lib/order-match";

export function lineItemFromOrder(order: Order): OrderItem {
  return {
    productName: order.productName,
    variation: order.variation,
    sku: order.sku,
    quantity: order.quantity,
    price: order.price,
    originalPrice: order.originalPrice,
  };
}

export function orderItems(order: Order): OrderItem[] {
  if (order.items && order.items.length > 0) return order.items;
  if (!order.productName) return [];
  return [lineItemFromOrder(order)];
}

function groupKey(order: Order): string {
  const number = normalizeMatchKey(order.orderNumber);
  return `${order.platform}|${number || order.id}`;
}

function completeness(order: Order): number {
  return (
    (order.trackingNumber ? 4 : 0) +
    (order.pickupTime ? 2 : 0) +
    (order.paidTime ? 1 : 0) +
    (order.shippingAddress ? 1 : 0)
  );
}

function mergeOrderLines(lines: Order[]): Order {
  if (lines.length === 1) {
    const only = lines[0];
    if (only.items && only.items.length > 0) return only;
    return only.productName ? { ...only, items: [lineItemFromOrder(only)] } : only;
  }

  let primary = lines[0];
  for (const line of lines.slice(1)) {
    if (completeness(line) > completeness(primary)) primary = line;
  }

  const items = lines.flatMap((line) => orderItems(line));
  const quantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0) || primary.quantity;
  const totalAmount =
    items.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 0), 0) ||
    primary.totalAmount;

  return {
    ...primary,
    quantity,
    totalAmount,
    items,
  };
}

/** Satu baris per nomor pesanan + platform. SKU berbeda tetap di `items`. */
export function groupOrdersByNumber(orders: Order[]): Order[] {
  const groups = new Map<string, Order[]>();
  for (const order of orders) {
    const key = groupKey(order);
    const list = groups.get(key);
    if (list) list.push(order);
    else groups.set(key, [order]);
  }
  return Array.from(groups.values()).map(mergeOrderLines);
}
