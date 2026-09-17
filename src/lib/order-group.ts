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

function isGenericName(name?: string) {
  const text = (name || "").trim();
  return !text || text === "Unknown Product" || /^order\s/i.test(text);
}

function completeness(order: Order): number {
  return (
    (order.productName && !isGenericName(order.productName) ? 8 : 0) +
    (order.trackingNumber ? 4 : 0) +
    (order.pickupTime ? 2 : 0) +
    (order.shippedTime ? 2 : 0) +
    (order.paidTime ? 1 : 0) +
    (order.shippingAddress ? 1 : 0) +
    (order.price ? 1 : 0)
  );
}

function statusRank(status?: string) {
  switch (String(status || "").toLowerCase()) {
    case "returned":
    case "cancelled":
      return 5;
    case "delivered":
      return 4;
    case "shipped":
      return 3;
    case "processing":
      return 2;
    case "pending":
      return 1;
    default:
      return 0;
  }
}

function pickText(...values: Array<string | undefined>) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && !isGenericName(text)) return text;
  }
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return undefined;
}

function uniqueItems(items: OrderItem[]): OrderItem[] {
  const map = new Map<string, OrderItem>();
  for (const item of items) {
    const key = [
      normalizeMatchKey(item.sku),
      normalizeMatchKey(item.productName),
      normalizeMatchKey(item.variation),
    ].join("|");
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
      continue;
    }
    map.set(key, {
      ...prev,
      quantity: Math.max(prev.quantity || 0, item.quantity || 0) || prev.quantity,
      price: prev.price || item.price,
      originalPrice: prev.originalPrice || item.originalPrice,
    });
  }
  return Array.from(map.values());
}

function overlayOrder(base: Order, extra: Order): Order {
  return {
    ...base,
    productName: pickText(base.productName, extra.productName) || base.productName,
    variation: pickText(base.variation, extra.variation),
    sku: pickText(base.sku, extra.sku),
    trackingNumber: pickText(base.trackingNumber, extra.trackingNumber),
    courier: pickText(base.courier, extra.courier),
    shippingOption: pickText(base.shippingOption, extra.shippingOption),
    channelName: pickText(base.channelName, extra.channelName),
    storeName: pickText(base.storeName, extra.storeName),
    customerName: pickText(base.customerName, extra.customerName) || base.customerName,
    recipientName: pickText(base.recipientName, extra.recipientName),
    phone: pickText(base.phone, extra.phone),
    shippingAddress: pickText(base.shippingAddress, extra.shippingAddress),
    city: pickText(base.city, extra.city),
    province: pickText(base.province, extra.province),
    notes: pickText(base.notes, extra.notes),
    paidTime: base.paidTime || extra.paidTime,
    pickupTime: base.pickupTime || extra.pickupTime,
    shippedTime: base.shippedTime || extra.shippedTime,
    mustShipBefore: base.mustShipBefore || extra.mustShipBefore,
    price: base.price || extra.price,
    originalPrice: base.originalPrice || extra.originalPrice,
    totalAmount: base.totalAmount || extra.totalAmount,
    status: statusRank(extra.status) > statusRank(base.status) ? extra.status : base.status,
  };
}

function mergeOrderLines(lines: Order[]): Order {
  if (lines.length === 1) {
    const only = lines[0];
    if (only.items && only.items.length > 0) return only;
    return only.productName ? { ...only, items: [lineItemFromOrder(only)] } : only;
  }

  const ranked = [...lines].sort((a, b) => {
    const complete = completeness(b) - completeness(a);
    if (complete) return complete;
    return statusRank(b.status) - statusRank(a.status);
  });

  let merged = { ...ranked[0] };
  for (const line of ranked.slice(1)) merged = overlayOrder(merged, line);

  const items = uniqueItems(lines.flatMap((line) => orderItems(line)));
  const quantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0) || merged.quantity;
  const totalAmount =
    items.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 0), 0) ||
    merged.totalAmount;

  return {
    ...merged,
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
