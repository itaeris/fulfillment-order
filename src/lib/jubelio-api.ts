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

function locationOnly(extras: Record<string, string>): Record<string, string> {
  const slim: Record<string, string> = {};
  if (extras.locationId) slim.locationId = extras.locationId;
  if (extras.location_id) slim.location_id = extras.location_id;
  return slim;
}

export interface JubelioSyncCursor {
  path: string;
  extras: Record<string, string>;
  actualPageSize: number;
  totalPages: number;
  apiTotal: number;
  locationName?: string;
}

async function probeList(
  path: string,
  extras: Record<string, string>
): Promise<{ json: unknown; extras: Record<string, string> } | null> {
  try {
    const json = await jubelioGet(path, listQuery(1, extras));
    return { json, extras };
  } catch {
    const slim = locationOnly(extras);
    try {
      const json = await jubelioGet(path, listQuery(1, slim));
      return { json, extras: slim };
    } catch {
      try {
        const json = await jubelioGet(path, listQuery(1, {}));
        return { json, extras: {} };
      } catch {
        return null;
      }
    }
  }
}

export async function fetchJubelioReadyToShipBatch(input: {
  startPage: number;
  pageCount: number;
  cursor?: JubelioSyncCursor;
}): Promise<{
  orders: Order[];
  cursor: JubelioSyncCursor;
  nextPage: number | null;
  done: boolean;
}> {
  const startPage = Math.max(1, input.startPage);
  const pageCount = Math.max(1, input.pageCount);
  let cursor = input.cursor;

  if (!cursor) {
    const location = await resolveLocation();
    const extras: Record<string, string> = { ...dateRangeQuery() };
    if (location.id) {
      extras.locationId = location.id;
      extras.location_id = location.id;
    }

    let probed = await probeList("/sales/unfullfilled/", extras);
    let path = "/sales/unfullfilled/";
    if (!probed || extractList(probed.json).length === 0) {
      const sales = await probeList("/sales/orders/", extras);
      if (sales && extractList(sales.json).length > 0) {
        probed = sales;
        path = "/sales/orders/";
      }
    }

    const firstRows = probed ? extractList(probed.json) : [];
    const actualPageSize = firstRows.length || PAGE_SIZE;
    let apiTotal = probed ? extractTotal(probed.json, firstRows.length) : 0;
    if (apiTotal <= actualPageSize && firstRows.length >= PAGE_SIZE) {
      apiTotal = Number.POSITIVE_INFINITY;
    }
    const totalPages = Number.isFinite(apiTotal)
      ? Math.min(Math.max(1, Math.ceil(apiTotal / actualPageSize)), MAX_PAGES)
      : MAX_PAGES;

    cursor = {
      path,
      extras: probed?.extras ?? extras,
      actualPageSize,
      totalPages,
      apiTotal: Number.isFinite(apiTotal) ? apiTotal : 0,
      locationName: location.name,
    };

    // Request pertama cuma halaman 1: login + lokasi + hapus data lama
    // harus muat di batas waktu Vercel (~10 detik di Hobby).
    const rows = dedupeOrders(firstRows).filter((row) => row.salesorder_no || row.salesorder_id);
    const shortPage = firstRows.length === 0 || firstRows.length < cursor.actualPageSize;
    const nextPage = shortPage && cursor.totalPages <= 1 ? null : 2;
    return {
      orders: rows.map(mapRawOrder),
      cursor,
      nextPage,
      done: nextPage == null,
    };
  }

  const endPage = Math.min(startPage + pageCount - 1, cursor.totalPages);
  const collected: JubelioRawOrder[] = [];
  const pagesToFetch: number[] = [];
  for (let page = startPage; page <= endPage; page++) pagesToFetch.push(page);

  for (let i = 0; i < pagesToFetch.length; i += PAGE_CONCURRENCY) {
    const chunk = pagesToFetch.slice(i, i + PAGE_CONCURRENCY);
    const pages = await Promise.all(
      chunk.map((page) => jubelioGet(cursor.path, listQuery(page, cursor.extras)))
    );
    let short = false;
    for (const json of pages) {
      const rows = extractList(json);
      collected.push(...rows);
      if (rows.length === 0 || rows.length < cursor.actualPageSize) short = true;
    }
    if (short) {
      const rows = dedupeOrders(collected).filter((row) => row.salesorder_no || row.salesorder_id);
      return {
        orders: rows.map(mapRawOrder),
        cursor,
        nextPage: null,
        done: true,
      };
    }
  }

  const rows = dedupeOrders(collected).filter((row) => row.salesorder_no || row.salesorder_id);
  const nextPage = endPage < cursor.totalPages ? endPage + 1 : null;
  return {
    orders: rows.map(mapRawOrder),
    cursor,
    nextPage,
    done: nextPage == null,
  };
}
