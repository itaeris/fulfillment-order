import { expandMatchKeys, identityKeys, isTrackingLikeCode, normalizeMatchKey } from "@/lib/order-match";
import { isAheadPackOrder, isShipTodayQueueOrder, type DueDateRow } from "@/lib/due-date";
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
  const market = list.filter((order) => isMarketplaceScanPlatform(order.platform));
  const real = market.filter((order) => !isTrackingLikeCode(order.orderNumber));
  return real[0] || market[0] || list[0];
}

export function buildOrderScanIndex(orders: Order[]): Map<string, Order> {
  const ranked = [...orders].sort((a, b) => {
    const track = Number(isTrackingLikeCode(a.orderNumber)) - Number(isTrackingLikeCode(b.orderNumber));
    if (track !== 0) return track;
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

export function resolveMarketplaceScanOrder(
  code: string,
  orders: Order[],
  scan?: Pick<OverdueScan, "orderId" | "orderNumber" | "scannedCode">
): Order | undefined {
  const index = buildOrderScanIndex(orders);
  const hits: Order[] = [];
  const push = (order?: Order) => {
    if (order && !hits.some((item) => item.id === order.id)) hits.push(order);
  };
  push(matchOrderFromIndex(code, index));
  if (scan?.orderNumber) push(matchOrderFromIndex(scan.orderNumber, index));
  if (scan?.scannedCode && scan.scannedCode !== code) push(matchOrderFromIndex(scan.scannedCode, index));
  if (scan?.orderId) push(orders.find((order) => order.id === scan.orderId));

  const directHits = hits.filter((order) => isMarketplaceScanPlatform(order.platform) && !isTrackingLikeCode(order.orderNumber));
  const direct = preferMarketplaceOrder(directHits);
  if (direct) return direct;

  const fallback = preferMarketplaceOrder(hits);
  if (fallback && isMarketplaceScanPlatform(fallback.platform) && !isTrackingLikeCode(fallback.orderNumber)) {
    return fallback;
  }

  const keys = new Set<string>();
  for (const order of hits) {
    for (const key of identityKeys(order)) keys.add(key);
  }
  for (const key of expandMatchKeys(code)) keys.add(key);
  if (scan) {
    for (const key of expandMatchKeys(scan.orderNumber)) keys.add(key);
    for (const key of expandMatchKeys(scan.scannedCode)) keys.add(key);
  }
  if (keys.size === 0) return undefined;
  return preferMarketplaceOrder(
    orders.filter(
      (order) =>
        isMarketplaceScanPlatform(order.platform) &&
        !isTrackingLikeCode(order.orderNumber) &&
        identityKeys(order).some((key) => keys.has(key))
    )
  );
}

function scanIdentityKeys(scan: OverdueScan, orders: Order[] = []): string[] {
  const order = resolveMarketplaceScanOrder(scan.orderNumber || scan.scannedCode, orders, scan);
  if (order) return identityKeys(order);
  return [
    ...expandMatchKeys(scan.orderNumber),
    ...expandMatchKeys(scan.scannedCode),
    scan.orderId,
  ].filter((key): key is string => Boolean(key));
}

function scanKeepsMarketplaceNumber(scan: OverdueScan, order?: Order) {
  if (!order) return isMarketplaceScanPlatform(scan.platform);
  return normalizeMatchKey(scan.orderNumber) === normalizeMatchKey(order.orderNumber);
}

function resolvedScanOrder(scan: OverdueScan, orders: Order[] = []): Order | undefined {
  if (orders.length === 0) return undefined;
  return resolveMarketplaceScanOrder(scan.orderNumber || scan.scannedCode, orders, scan);
}

function isPackingCicilScan(scan: OverdueScan, orders: Order[] = []): boolean {
  const result = scanResultOf(scan);
  if (result !== "ahead" && result !== "valid") return false;
  const order = resolvedScanOrder(scan, orders);
  if (order) return isAheadPackOrder(order);
  return result === "ahead";
}

function isTodayValidScan(scan: OverdueScan, orders: Order[] = []): boolean {
  if (!scan.matched) return false;
  const result = scanResultOf(scan);
  if (result !== "valid" && result !== "ahead") return false;
  const order = resolvedScanOrder(scan, orders);
  if (order) {
    if (isAheadPackOrder(order)) return false;
    if (result === "ahead") return isShipTodayQueueOrder(order);
  }
  return result === "valid";
}

/** Satu baris packing cicil per order marketplace. Scan resi/Jubelio digabung ke nomor Shopee/TikTok. */
export function uniqueAheadScans(scans: OverdueScan[], orders: Order[] = []): OverdueScan[] {
  const ahead = scans.filter((scan) => isPackingCicilScan(scan, orders));
  const scored = ahead.map((scan) => {
    const order = resolveMarketplaceScanOrder(scan.orderNumber || scan.scannedCode, orders, scan);
    return { scan, order };
  });
  scored.sort((a, b) => {
    const rank = (item: (typeof scored)[number]) => {
      if (scanKeepsMarketplaceNumber(item.scan, item.order)) return 3;
      if (item.order && isMarketplaceScanPlatform(item.scan.platform)) return 2;
      if (item.order || isMarketplaceScanPlatform(item.scan.platform)) return 1;
      return 0;
    };
    return rank(b) - rank(a);
  });

  const out: OverdueScan[] = [];
  const seen = new Set<string>();
  for (const { scan, order } of scored) {
    if (order && !isMarketplaceScanPlatform(order.platform)) continue;
    if (order && isTrackingLikeCode(order.orderNumber)) continue;
    if (!order && !isMarketplaceScanPlatform(scan.platform)) continue;
    if (!order && isTrackingLikeCode(scan.orderNumber || scan.scannedCode)) continue;
    const keys = order ? identityKeys(order) : scanIdentityKeys(scan);
    if (keys.length === 0 || keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    out.push(
      order
        ? { ...scan, orderId: order.id, orderNumber: order.orderNumber, platform: order.platform, result: "ahead" }
        : { ...scan, result: "ahead" }
    );
  }
  return out;
}

export function isAlreadyScanned(
  scans: OverdueScan[],
  match: { orderId?: string; orderNumber?: string; trackingNumber?: string; scannedCode?: string },
  orders: Order[] = []
): boolean {
  const keys = new Set(
    [
      match.orderId,
      ...expandMatchKeys(match.orderNumber),
      ...expandMatchKeys(match.trackingNumber),
      ...expandMatchKeys(match.scannedCode),
    ].filter(Boolean)
  );
  const resolved = resolveMarketplaceScanOrder(
    match.orderNumber || match.trackingNumber || match.scannedCode || "",
    orders,
    { orderId: match.orderId, orderNumber: match.orderNumber, scannedCode: match.scannedCode || "" }
  );
  if (resolved) {
    for (const key of identityKeys(resolved)) keys.add(key);
  }
  if (orders.length > 0) {
    const related = orders.filter(
      (order) =>
        (match.orderId && order.id === match.orderId) ||
        identityKeys(order).some((key) => keys.has(key))
    );
    for (const order of related) {
      for (const key of identityKeys(order)) keys.add(key);
    }
  }
  if (keys.size === 0) return false;
  return scans.some((scan) => {
    const result = scanResultOf(scan);
    if (result === "not_in_queue") return false;
    return scanIdentityKeys(scan, orders).some((key) => keys.has(key));
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

export function todayValidatedIds(scans: OverdueScan[], orders: Order[] = []): Set<string> {
  const ids = new Set<string>();
  for (const scan of scans) {
    if (!isTodayValidScan(scan, orders)) continue;
    if (scan.orderId) ids.add(scan.orderId);
    const order = resolvedScanOrder(scan, orders);
    if (order?.id) ids.add(order.id);
  }
  return ids;
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
