import { Order } from "@/types/order";

function toDate(value?: Date | string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalize(value?: string | null): string {
  return String(value || "").replace(/[\s\-_.#]+/g, "").toUpperCase();
}

function push(map: Map<string, Order[]>, key: string, order: Order) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(order);
  else map.set(key, [order]);
}

function isGenericName(name?: string): boolean {
  const text = (name || "").trim();
  return !text || text === "Unknown Product" || /^order\s/i.test(text);
}

function pickDate(preferred?: Date | string, fallback?: Date | string): Date | undefined {
  return toDate(preferred) || toDate(fallback);
}

export function uniqueLookupNumbers(orders: Order[]): string[] {
  const seen = new Set<string>();
  const numbers: string[] = [];
  for (const order of orders) {
    for (const value of [order.orderNumber, order.refNo]) {
      const trimmed = String(value || "").trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      numbers.push(trimmed);
    }
  }
  return numbers;
}

export function overlayImportedWithApi(imported: Order, api: Order): Order {
  const importedGeneric = isGenericName(imported.productName);
  const customerUnknown = !imported.customerName || imported.customerName === "Unknown";

  return {
    ...imported,
    platform: api.platform || imported.platform,
    channelName: api.channelName || imported.channelName,
    storeName: api.storeName || imported.storeName,
    mustShipBefore: pickDate(api.mustShipBefore, imported.mustShipBefore),
    pickupTime: pickDate(api.pickupTime, imported.pickupTime),
    paidTime: pickDate(api.paidTime, imported.paidTime),
    courier: api.courier || imported.courier,
    shippingOption: api.shippingOption || imported.shippingOption,
    trackingNumber: api.trackingNumber || imported.trackingNumber,
    status: api.status || imported.status,
    isPreorder: api.isPreorder ?? imported.isPreorder,
    orderType: api.orderType || imported.orderType,
    refNo: api.refNo || imported.refNo,
    productName: importedGeneric ? api.productName || imported.productName : imported.productName,
    quantity: imported.quantity || api.quantity,
    sku: imported.sku || api.sku,
    variation: imported.variation || api.variation,
    customerName: customerUnknown ? api.customerName || imported.customerName : imported.customerName,
    recipientName: imported.recipientName || api.recipientName,
  };
}

export function mergeImportedWithApi(
  imported: Order[],
  api: Order[]
): { orders: Order[]; matched: number } {
  const byFull = new Map<string, Order[]>();
  const byOrderSku = new Map<string, Order[]>();
  const byOrder = new Map<string, Order[]>();
  const byRef = new Map<string, Order[]>();

  for (const order of api) {
    const numberKey = normalize(order.orderNumber);
    const skuKey = normalize(order.sku);
    push(byFull, `${numberKey}|${skuKey}|${normalize(order.productName)}`, order);
    push(byOrderSku, `${numberKey}|${skuKey}`, order);
    push(byOrder, numberKey, order);
    push(byRef, normalize(order.refNo), order);
    push(byRef, normalize(order.trackingNumber), order);
  }

  const used = new Set<string>();
  const take = (list?: Order[]) => {
    if (!list) return undefined;
    const hit = list.find((order) => !used.has(order.id));
    if (hit) used.add(hit.id);
    return hit;
  };

  let matched = 0;
  const orders = imported.map((row) => {
    const numberKey = normalize(row.orderNumber);
    const skuKey = normalize(row.sku);
    const apiHit =
      take(byFull.get(`${numberKey}|${skuKey}|${normalize(row.productName)}`)) ||
      take(byOrderSku.get(`${numberKey}|${skuKey}`)) ||
      take(byOrder.get(numberKey)) ||
      take(byRef.get(normalize(row.refNo))) ||
      take(byOrder.get(normalize(row.refNo))) ||
      take(byRef.get(normalize(row.trackingNumber)));

    if (!apiHit) return row;
    matched += 1;
    return overlayImportedWithApi(row, apiHit);
  });

  return { orders, matched };
}
