import { expandMatchKeys, identityKeys, normalizeMatchKey } from "@/lib/order-match";
import type { DueDateRow } from "@/lib/due-date";

export type OverdueScanStatus = "valid" | "duplicate" | "not_in_queue";

export type OverdueScan = {
  id: string;
  scannedCode: string;
  orderId?: string;
  orderNumber?: string;
  platform?: string;
  matched: boolean;
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

export function scannedOrderIds(scans: OverdueScan[]): Set<string> {
  return new Set(
    scans.filter((scan) => scan.matched && scan.orderId).map((scan) => scan.orderId as string)
  );
}

export function rowIsValidated(row: DueDateRow, validatedIds: Set<string>): boolean {
  if (row.marketplaceOrder?.id && validatedIds.has(row.marketplaceOrder.id)) return true;
  if (row.jubelioOrder?.id && validatedIds.has(row.jubelioOrder.id)) return true;
  return validatedIds.has(row.key);
}
