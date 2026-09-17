import { expandMatchKeys, identityKeys, normalizeMatchKey } from "@/lib/order-match";
import type { DueDateRow } from "@/lib/due-date";
import type { Order } from "@/types/order";

export type OverdueScanStatus = "valid" | "ahead" | "duplicate" | "not_in_queue" | "cancelled";

export type OverdueScan = {
  id: string;
  scannedCode: string;
  orderId?: string;
  orderNumber?: string;
  platform?: string;
  matched: boolean;
  result?: Exclude<OverdueScanStatus, "duplicate">;
  scannedAt: Date;
  scannedBy?: string;
  scanDate: string;
};

export type OverdueScanMatch = {
  orderId: string;
  orderNumber: string;
  platform: string;
  trackingNumber?: string;
  rowKey: string;
};

export function buildOverdueScanIndex(rows: DueDateRow[]): Map<string, DueDateRow> {
  const index = new Map<string, DueDateRow>();
  for (const row of rows) {
    const orders = [row.marketplaceOrder, row.jubelioOrder].filter(Boolean);
    for (const order of orders) {
      for (const key of identityKeys(order!)) {
        if (!index.has(key)) index.set(key, row);
      }
    }
  }
  return index;
}

export function matchOverdueScan(code: string, rows: DueDateRow[]): DueDateRow | undefined {
  return matchOverdueScanFromIndex(code, buildOverdueScanIndex(rows));
}

export function matchOverdueScanFromIndex(
  code: string,
  index: Map<string, DueDateRow>
): DueDateRow | undefined {
  const trimmed = String(code || "").trim();
  if (!trimmed) return undefined;
  for (const key of expandMatchKeys(trimmed)) {
    const row = index.get(key);
    if (row) return row;
  }
  const normalized = normalizeMatchKey(trimmed);
  if (normalized.length >= 5) return index.get(normalized);
  return undefined;
}

export function overdueScanMatchFromRow(row: DueDateRow): OverdueScanMatch {
  const order = row.marketplaceOrder || row.jubelioOrder;
  return {
    orderId: order?.id || row.key,
    orderNumber: row.orderNumber,
    platform: order?.platform || row.marketplace || "",
    trackingNumber: order?.trackingNumber,
    rowKey: row.key,
  };
}

export function hydrateOverdueScan(raw: any): OverdueScan {
  const scannedAt = raw.scannedAt ?? raw.scanned_at;
  const matched = Boolean(raw.matched);
  const resultRaw = String(raw.result || "").toLowerCase();
  const result: OverdueScan["result"] =
    resultRaw === "cancelled" ||
    resultRaw === "not_in_queue" ||
    resultRaw === "valid" ||
    resultRaw === "ahead"
      ? resultRaw
      : matched
        ? "valid"
        : "not_in_queue";
  return {
    id: String(raw.id || ""),
    scannedCode: String(raw.scannedCode ?? raw.scanned_code ?? ""),
    orderId: (raw.orderId ?? raw.order_id) ? String(raw.orderId ?? raw.order_id) : undefined,
    orderNumber: (raw.orderNumber ?? raw.order_number) ? String(raw.orderNumber ?? raw.order_number) : undefined,
    platform: raw.platform ? String(raw.platform) : undefined,
    matched,
    result,
    scannedAt: scannedAt ? new Date(scannedAt as string | Date) : new Date(),
    scannedBy: (raw.scannedBy ?? raw.scanned_by) ? String(raw.scannedBy ?? raw.scanned_by) : undefined,
    scanDate: String(raw.scanDate ?? raw.scan_date ?? "").slice(0, 10),
  };
}

export function isCancelledStatus(status?: string | null) {
  const value = String(status || "").toLowerCase();
  return value === "cancelled" || value === "canceled" || value === "returned";
}

export function rowIsCancelled(row: DueDateRow) {
  return isCancelledStatus(row.marketplaceOrder?.status) || isCancelledStatus(row.jubelioOrder?.status);
}

export function isMarketplaceScanPlatform(platform?: string | null) {
  const value = String(platform || "").toLowerCase();
  return value === "shopee" || value === "tiktok" || value === "tokopedia";
}

export function preferMarketplaceOrder(orders: Array<Order | undefined | null>): Order | undefined {
  const list = orders.filter((order): order is Order => Boolean(order));
  return list.find((order) => isMarketplaceScanPlatform(order.platform)) || list[0];
}

export function buildOrderScanIndex(orders: Order[]): Map<string, Order> {
  const ranked = [...orders].sort((a, b) => {
    return Number(a.platform === "jubelio") - Number(b.platform === "jubelio");
  });
  const index = new Map<string, Order>();
  for (const order of ranked) {
    for (const key of identityKeys(order)) {
      if (!index.has(key)) index.set(key, order);
    }
  }
  return index;
}

export function matchOrderFromIndex(code: string, index: Map<string, Order>): Order | undefined {
  const trimmed = String(code || "").trim();
  if (!trimmed) return undefined;
  for (const key of expandMatchKeys(trimmed)) {
    const order = index.get(key);
    if (order) return order;
  }
  const normalized = normalizeMatchKey(trimmed);
  if (normalized.length >= 5) return index.get(normalized);
  return undefined;
}

export function overdueScanMatchFromOrder(order: Order): OverdueScanMatch {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    platform: order.platform || "",
    trackingNumber: order.trackingNumber,
    rowKey: order.id,
  };
}

export function uniqueAheadScans(scans: OverdueScan[]): OverdueScan[] {
  const ahead = aheadScansOf(scans).filter((scan) => isMarketplaceScanPlatform(scan.platform));
  const out: OverdueScan[] = [];
  const seen = new Set<string>();
  for (const scan of ahead) {
    const keys = expandMatchKeys(scan.orderNumber || scan.scannedCode);
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    out.push(scan);
  }
  return out;
}

export function isAlreadyScanned(
  scans: OverdueScan[],
  match: { orderId?: string; orderNumber?: string; trackingNumber?: string }
): boolean {
  const keys = new Set(
    [match.orderId, ...expandMatchKeys(match.orderNumber), ...expandMatchKeys(match.trackingNumber)].filter(Boolean)
  );
  if (keys.size === 0) return false;
  return scans.some((scan) => {
    const result = scanResultOf(scan);
    if (result === "not_in_queue") return false;
    if (scan.orderId && keys.has(scan.orderId)) return true;
    return (
      expandMatchKeys(scan.orderNumber).some((key) => keys.has(key)) ||
      expandMatchKeys(scan.scannedCode).some((key) => keys.has(key))
    );
  });
}

export function scanResultOf(scan: OverdueScan): Exclude<OverdueScanStatus, "duplicate"> {
  if (
    scan.result === "cancelled" ||
    scan.result === "valid" ||
    scan.result === "ahead" ||
    scan.result === "not_in_queue"
  ) {
    return scan.result;
  }
  return scan.matched ? "valid" : "not_in_queue";
}

export function todayValidatedIds(scans: OverdueScan[]): Set<string> {
  return new Set(
    scans
      .filter((scan) => scan.matched && scan.orderId && scanResultOf(scan) === "valid")
      .map((scan) => scan.orderId as string)
  );
}

export function aheadScansOf(scans: OverdueScan[]): OverdueScan[] {
  return scans.filter((scan) => scanResultOf(scan) === "ahead");
}

export function scannedOrderIds(scans: OverdueScan[]): Set<string> {
  return new Set(
    scans
      .filter((scan) => scan.matched && scan.orderId && scanResultOf(scan) !== "cancelled")
      .map((scan) => scan.orderId as string)
  );
}

export function cancelledScanOrderIds(scans: OverdueScan[]): Set<string> {
  return new Set(
    scans
      .filter((scan) => scan.orderId && scanResultOf(scan) === "cancelled")
      .map((scan) => scan.orderId as string)
  );
}

export function rowHasId(row: DueDateRow, ids: Set<string>) {
  if (row.marketplaceOrder?.id && ids.has(row.marketplaceOrder.id)) return true;
  if (row.jubelioOrder?.id && ids.has(row.jubelioOrder.id)) return true;
  return ids.has(row.key);
}

export function ordersForScan(scan: OverdueScan, orders: Order[]): Order[] {
  const keys = new Set([
    ...expandMatchKeys(scan.orderNumber),
    ...expandMatchKeys(scan.scannedCode),
    ...expandMatchKeys(scan.orderId),
  ]);
  const hits = orders.filter((order) => {
    if (scan.orderId && order.id === scan.orderId) return true;
    return identityKeys(order).some((key) => keys.has(key));
  });
  const market = hits.filter((order) => isMarketplaceScanPlatform(order.platform));
  return market.length > 0 ? market : hits;
}

export function rowIsValidated(row: DueDateRow, validatedIds: Set<string>): boolean {
  return rowHasId(row, validatedIds);
}
