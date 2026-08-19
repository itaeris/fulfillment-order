import { Order, OrderStatus } from "@/types/order";
import {
  ensureJubelioToken,
  getJubelioBaseUrl,
  isJubelioAuthError,
  loginJubelio,
} from "./jubelio-auth";

/**
 * Tarik antrian WMS Shipping → Siap Kirim.
 * Bukan GET /sales/orders/ hari ini saja: list WMS bisa 5000+ dan
 * channel_status-nya Ready To Ship maupun Shipped.
 *
 * GET /sales/unfullfilled/  (GetAllPacklist)
 * GET /sales/orders/        (cadangan, rentang tanggal lebar + lokasi gudang)
 * Docs: https://docs-wms.jubelio.com/
 */

interface JubelioItem {
  item_name?: string;
  product_name?: string;
  sku?: string;
  seller_sku?: string;
  variation?: string;
  qty?: number;
  quantity?: number;
  price?: number;
  unit_price?: number;
}

interface JubelioRawOrder {
  salesorder_id?: number | string;
  salesorder_no?: string;
  channel_status?: string;
  sub_status?: string;
  status?: string;
  status_details?: string;
  wms_status?: string;
  transaction_date?: string;
  due_date?: string | number;
  customer_name?: string;
  contact_name?: string;
  grand_total?: number | string;
  total_qty?: number;
  qty?: number;
  shipper?: string;
  tracking_no?: string;
  tracking_number?: string;
  shipment_type?: string;
  store_name?: string;
  channel_name?: string;
  source_name?: string;
  location_id?: number | string;
  location_name?: string;
  ref_no?: string;
  invoice_no?: string;
  picklist_no?: string;
  pickup_time_store?: string;
  items?: JubelioItem[];
  salesorder_details?: JubelioItem[];
  phone?: string;
  shipping_address?: string;
  city?: string;
  province?: string;
}

interface JubelioLocation {
  location_id?: number | string;
  id?: number | string;
  location_name?: string;
  name?: string;
}

const CLOSED_STATUS_HINTS = [
  "cancelled",
  "canceled",
  "void",
  "returned",
  "refunded",
  "delivered",
  "completed",
  "done",
  "settled",
  "selesai",
];

const PAGE_SIZE = 50;
const MAX_PAGES = 250;
const PAGE_CONCURRENCY = 4;

export interface JubelioSyncMeta {
  source: string;
  apiTotal?: number;
  locationName?: string;
  locationId?: string;
}

function mapStatus(raw?: string): OrderStatus {
  const normalized = raw?.toString().trim().toLowerCase() || "";
  if (["waiting payment", "menunggu pembayaran", "pending", "unpaid"].includes(normalized)) {
    return "pending";
  }
  if (CLOSED_STATUS_HINTS.includes(normalized)) {
    if (normalized.includes("return") || normalized === "refunded") return "returned";
    if (["cancelled", "canceled", "void"].includes(normalized)) return "cancelled";
    return "delivered";
  }
  if (["in transit", "on delivery", "delivering", "in delivery"].includes(normalized)) {
    return "shipped";
  }
  // Siap Kirim di WMS: Ready To Ship, Packed, bahkan channel Shipped yang belum diserahkan kurir
  return "processing";
}

function statusText(order: JubelioRawOrder): string {
  return [order.channel_status, order.sub_status, order.status, order.status_details, order.wms_status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isClosedOrder(order: JubelioRawOrder): boolean {
  const text = statusText(order);
  return CLOSED_STATUS_HINTS.some((hint) => text === hint || text.includes(hint));
}

function toDate(value?: string | number): Date | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") {
    if (value <= 0) return undefined;
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : undefined;
    if (!ms) return undefined;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function parseAmount(value?: number | string): number {
  if (value == null || value === "") return 0;
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function asCount(value: unknown): number | undefined {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(num) ? num : undefined;
}

function extractList<T = JubelioRawOrder>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  const obj = json as { data?: unknown; rows?: unknown; items?: unknown };
  if (Array.isArray(obj?.data)) return obj.data as T[];
  if (Array.isArray((obj?.data as { data?: unknown })?.data)) {
    return (obj.data as { data: T[] }).data;
  }
  if (Array.isArray(obj?.rows)) return obj.rows as T[];
  if (Array.isArray(obj?.items)) return obj.items as T[];
  return [];
}

function extractTotal(json: unknown, fallback: number): number {
  const obj = json as {
    totalCount?: unknown;
    total?: unknown;
    count?: unknown;
    paging?: { totalCount?: unknown; total?: unknown };
    data?: { totalCount?: unknown; total?: unknown };
  };
  return (
    asCount(obj?.totalCount) ??
    asCount(obj?.total) ??
    asCount(obj?.count) ??
    asCount(obj?.paging?.totalCount) ??
    asCount(obj?.paging?.total) ??
    asCount(obj?.data?.totalCount) ??
    asCount(obj?.data?.total) ??
    fallback
  );
}

async function requestJson(
  path: string,
  query: Record<string, string>,
  accessToken: string,
  bearer: boolean
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const url = new URL(`${getJubelioBaseUrl()}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      authorization: bearer ? `Bearer ${accessToken}` : accessToken,
      "content-type": "application/json",
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function jubelioGet(path: string, query: Record<string, string> = {}): Promise<unknown> {
  let token = await ensureJubelioToken();
  let result = await requestJson(path, query, token.accessToken, false);
  const message = (result.json as { message?: string }).message;

  if (!result.ok && isJubelioAuthError(result.status, message)) {
    token = await loginJubelio();
    result = await requestJson(path, query, token.accessToken, false);
  }

  if (!result.ok && isJubelioAuthError(result.status, (result.json as { message?: string }).message)) {
    result = await requestJson(path, query, token.accessToken, true);
  }

  if (!result.ok) {
    const errMessage = (result.json as { message?: string }).message;
    throw new Error(`Jubelio API error (${result.status}): ${errMessage || "request failed"}`);
  }

  return result.json;
}

function dateRangeQuery(): Record<string, string> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 400);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  return {
    from: fromStr,
    to: toStr,
    fromDate: fromStr,
    toDate: toStr,
    startDate: fromStr,
    endDate: toStr,
  };
}

function listQuery(page: number, extras: Record<string, string> = {}): Record<string, string> {
  return {
    page: String(page),
    pageSize: String(PAGE_SIZE),
    sortBy: "transaction_date",
    sortDirection: "DESC",
    ...extras,
  };
}

async function paginate(path: string, extras: Record<string, string> = {}): Promise<{
  rows: JubelioRawOrder[];
  apiTotal?: number;
}> {
  const first = await jubelioGet(path, listQuery(1, extras));
  const firstRows = extractList(first);
  if (firstRows.length === 0) return { rows: [], apiTotal: extractTotal(first, 0) };

  const actualSize = firstRows.length;
  let total = extractTotal(first, Number.POSITIVE_INFINITY);
  // Kalau API tidak kirim total asli (total === isi halaman penuh), lanjut sampai halaman pendek.
  if (total <= actualSize && actualSize >= PAGE_SIZE) {
    total = Number.POSITIVE_INFINITY;
  }
  const totalPages = Number.isFinite(total)
    ? Math.min(Math.max(1, Math.ceil(total / actualSize)), MAX_PAGES)
    : MAX_PAGES;

  const collected = [...firstRows];
  const pages: number[] = [];
  for (let page = 2; page <= totalPages; page++) pages.push(page);

  for (let i = 0; i < pages.length; i += PAGE_CONCURRENCY) {
    const batch = pages.slice(i, i + PAGE_CONCURRENCY);
    const results = await Promise.all(batch.map((page) => jubelioGet(path, listQuery(page, extras))));
    let shortPage = false;
    for (const json of results) {
      const rows = extractList(json);
      if (rows.length === 0) {
        shortPage = true;
        continue;
      }
      collected.push(...rows);
      if (rows.length < actualSize) shortPage = true;
    }
    if (shortPage) break;
    if (Number.isFinite(total) && collected.length >= total) break;
  }

  return {
    rows: collected,
    apiTotal: Number.isFinite(total) ? total : collected.length,
  };
}

async function tryPaginate(
  path: string,
  extras: Record<string, string>
): Promise<{ rows: JubelioRawOrder[]; apiTotal?: number } | null> {
  try {
    return await paginate(path, extras);
  } catch {
    const locationOnly: Record<string, string> = {};
    if (extras.locationId) locationOnly.locationId = extras.locationId;
    if (extras.location_id) locationOnly.location_id = extras.location_id;
    if (Object.keys(locationOnly).length === 0) {
      try {
        return await paginate(path, {});
      } catch {
        return null;
      }
    }
    try {
      return await paginate(path, locationOnly);
    } catch {
      try {
        return await paginate(path, {});
      } catch {
        return null;
      }
    }
  }
}

async function resolveLocation(): Promise<{ id?: string; name?: string }> {
  const envId = process.env.JUBELIO_LOCATION_ID?.trim();
  const envName = process.env.JUBELIO_LOCATION_NAME?.trim().toLowerCase();

  try {
    const json = await jubelioGet("/locations/", { page: "1", pageSize: "100" });
    const rows = extractList<JubelioLocation>(json);
    const normalized = rows.map((row) => ({
      id: String(row.location_id ?? row.id ?? ""),
      name: String(row.location_name ?? row.name ?? ""),
    })).filter((row) => row.id);

    if (envId) {
      const match = normalized.find((row) => row.id === envId);
      return { id: envId, name: match?.name };
    }

    const wanted = envName || "finished goods";
    const match =
      normalized.find((row) => row.name.toLowerCase().includes(wanted)) ||
      normalized.find((row) => row.name.toLowerCase().includes("finished"));
    if (match) return match;
  } catch {
    if (envId) return { id: envId };
  }

  if (envId) return { id: envId };
  return {};
}

function mapRawOrder(raw: JubelioRawOrder): Order {
  const orderNumber = String(raw.salesorder_no || raw.salesorder_id || "").trim();
  const items = raw.items ?? raw.salesorder_details ?? [];
  const first = items[0];
  const quantity =
    items.reduce((sum, item) => sum + (item.qty || item.quantity || 0), 0) ||
    raw.total_qty ||
    raw.qty ||
    1;
  const statusSource = raw.channel_status || raw.status || raw.sub_status || "";

  return {
    id: `jubelio-${raw.salesorder_id ?? orderNumber}`,
    orderNumber,
    platform: "jubelio",
    customerName: raw.customer_name || raw.contact_name || "Unknown",
    productName: first?.item_name || first?.product_name || `Order ${orderNumber}`,
    variation: first?.variation,
    sku: first?.seller_sku || first?.sku,
    quantity,
    price: parseAmount(first?.price ?? first?.unit_price),
    totalAmount: parseAmount(raw.grand_total),
    status: mapStatus(statusSource),
    orderDate: toDate(raw.transaction_date) ?? new Date(),
    mustShipBefore: toDate(raw.due_date),
    pickupTime: toDate(raw.pickup_time_store),
    trackingNumber: raw.tracking_no || raw.tracking_number,
    shippingOption: raw.shipment_type,
    courier: raw.shipper,
    channelName: raw.channel_name || raw.source_name,
    storeName: raw.store_name,
    refNo: raw.ref_no || raw.invoice_no,
    notes: [raw.picklist_no, raw.invoice_no, raw.location_name].filter(Boolean).join(" · ") || undefined,
    phone: raw.phone,
    shippingAddress: raw.shipping_address,
    city: raw.city,
    province: raw.province,
  };
}

function dedupeOrders(rows: JubelioRawOrder[]): JubelioRawOrder[] {
  const seen = new Set<string>();
  const unique: JubelioRawOrder[] = [];
  for (const row of rows) {
    const key = String(row.salesorder_id ?? row.salesorder_no ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

export async function fetchJubelioReadyToShipOrders(): Promise<{
  orders: Order[];
  meta: JubelioSyncMeta;
}> {
  const location = await resolveLocation();
  const extras: Record<string, string> = { ...dateRangeQuery() };
  if (location.id) {
    extras.locationId = location.id;
    extras.location_id = location.id;
  }

  const unfulfilled = await tryPaginate("/sales/unfullfilled/", extras);
  const unfulfilledRows = unfulfilled?.rows ?? [];

  let salesRows: JubelioRawOrder[] = [];
  let salesTotal = 0;
  if (unfulfilledRows.length < 1000) {
    const salesOrders = await tryPaginate("/sales/orders/", extras);
    salesRows = (salesOrders?.rows ?? []).filter((row) => !isClosedOrder(row));
    salesTotal = salesOrders?.apiTotal ?? 0;
  }

  const preferred =
    unfulfilledRows.length >= salesRows.length && unfulfilledRows.length > 0
      ? unfulfilledRows
      : salesRows.length > 0
        ? [...unfulfilledRows, ...salesRows]
        : unfulfilledRows;

  const source =
    unfulfilledRows.length >= salesRows.length && unfulfilledRows.length > 0
      ? "/sales/unfullfilled/"
      : "/sales/orders/";

  const rows = dedupeOrders(preferred).filter((row) => row.salesorder_no || row.salesorder_id);

  return {
    orders: rows.map(mapRawOrder),
    meta: {
      source,
      apiTotal: Math.max(unfulfilled?.apiTotal ?? 0, salesTotal, rows.length),
      locationName: location.name,
      locationId: location.id,
    },
  };
}
