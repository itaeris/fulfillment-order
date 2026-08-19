import crypto from "crypto";
import { Order, OrderStatus } from "@/types/order";
import { ensureFreshTokens, isTikTokAuthError, refreshAccessToken } from "@/lib/tiktok-auth";

/**
 * TikTok Shop Open API client (version 202309).
 * Docs: https://partner.tiktokshop.com/docv2/page/fulfillment-api-overview
 *
 * Digunakan untuk menarik order "siap dikirim" (To Ship) langsung dari
 * TikTok Shop, menggantikan proses export Excel manual untuk TikTok & Tokopedia.
 */

export interface TikTokConfig {
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopCipher: string;
  baseUrl: string;
  version: string;
}

export async function getTikTokConfig(): Promise<TikTokConfig> {
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  const shopCipher = process.env.TIKTOK_SHOP_CIPHER;

  if (!appKey || !appSecret || !shopCipher) {
    throw new Error(
      "Kredensial TikTok belum lengkap. Set TIKTOK_APP_KEY, TIKTOK_APP_SECRET, dan TIKTOK_SHOP_CIPHER di .env.local"
    );
  }

  const tokens = await ensureFreshTokens();
  if (!tokens.accessToken) {
    throw new Error(
      "Access token TikTok belum ada. Simpan refresh_token di Settings setelah authorize di Partner Center."
    );
  }

  return {
    appKey,
    appSecret,
    accessToken: tokens.accessToken,
    shopCipher,
    baseUrl: process.env.TIKTOK_BASE_URL || "https://open-api.tiktokglobalshop.com",
    version: process.env.TIKTOK_API_VERSION || "202309",
  };
}

/**
 * Generate signature HMAC-SHA256 sesuai aturan TikTok Shop:
 * 1. Ambil semua query param KECUALI `sign` dan `access_token`
 * 2. Urutkan berdasarkan key (alfabet)
 * 3. Gabungkan sebagai {key}{value}
 * 4. Tambahkan body JSON (untuk request non-multipart)
 * 5. Awali dengan path, lalu bungkus dengan app_secret di depan & belakang
 * 6. HMAC-SHA256 dengan app_secret, output hex
 */
export function generateSign(
  path: string,
  queries: Record<string, string>,
  body: string,
  appSecret: string
): string {
  const sortedKeys = Object.keys(queries)
    .filter((key) => key !== "sign" && key !== "access_token")
    .sort();

  let signString = path;
  for (const key of sortedKeys) {
    signString += key + queries[key];
  }

  if (body) {
    signString += body;
  }

  signString = appSecret + signString + appSecret;

  return crypto.createHmac("sha256", appSecret).update(signString).digest("hex");
}

interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

async function tiktokRequest<T>(
  config: TikTokConfig,
  { method, path, query = {}, body }: RequestOptions,
  retried = false
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const baseQuery: Record<string, string> = {
    app_key: config.appKey,
    shop_cipher: config.shopCipher,
    timestamp,
    version: config.version,
    ...query,
  };

  const bodyString = body ? JSON.stringify(body) : "";
  const sign = generateSign(path, baseQuery, bodyString, config.appSecret);

  const searchParams = new URLSearchParams({ ...baseQuery, sign });
  const url = `${config.baseUrl}${path}?${searchParams.toString()}`;

  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": config.accessToken,
    },
    body: method === "POST" ? bodyString : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  const json = (await res.json()) as { code: number; message: string; data: T };

  if (!res.ok || json.code !== 0) {
    if (!retried && isTikTokAuthError(json.code, json.message)) {
      const tokens = await refreshAccessToken();
      config.accessToken = tokens.accessToken;
      return tiktokRequest(config, { method, path, query, body }, true);
    }
    throw new Error(
      `TikTok API error (${json.code ?? res.status}): ${json.message || res.statusText}`
    );
  }

  return json.data;
}

// ── Order search (202309) ──

interface TikTokLineItem {
  id?: string;
  product_id?: string;
  product_name?: string;
  sku_id?: string;
  sku_name?: string;
  seller_sku?: string;
  sale_price?: string;
  original_price?: string;
  currency?: string;
}

interface TikTokRecipientAddress {
  name?: string;
  phone_number?: string;
  full_address?: string;
  region_code?: string;
  district_info?: { address_level_name?: string; address_name?: string }[];
}

interface TikTokPayment {
  total_amount?: string;
  currency?: string;
}

interface TikTokOrder {
  id: string;
  status?: string;
  create_time?: number;
  paid_time?: number;
  rts_time?: number;
  tts_sla_time?: number;
  delivery_option_name?: string;
  delivery_type?: string;
  shipping_type?: string;
  shipping_provider?: string;
  shipping_provider_name?: string;
  tracking_number?: string;
  buyer_message?: string;
  buyer_email?: string;
  recipient_address?: TikTokRecipientAddress;
  line_items?: TikTokLineItem[];
  payment?: TikTokPayment;
  commerce_platform?: string;
  fulfillment_type?: string;
  buyer_nickname?: string;
  shopping_channel?: string;
  sale_platform?: string;
  order_source?: string;
  package_list?: { tracking_number?: string; shipping_provider_name?: string }[];
  is_cod?: boolean;
  is_sample_order?: boolean;
  order_type?: string;
}

interface OrderSearchResponse {
  orders?: TikTokOrder[];
  next_page_token?: string;
  total_count?: number;
}

/**
 * Status TikTok untuk order yang "siap dikirim" (tab To Ship di Seller Center).
 * AWAITING_SHIPMENT   = perlu diatur pengirimannya
 * AWAITING_COLLECTION = menunggu penjemputan kurir
 */
const READY_TO_SHIP_STATUSES = ["AWAITING_SHIPMENT", "AWAITING_COLLECTION"];

function mapTikTokStatus(status?: string): OrderStatus {
  switch (String(status || "").toUpperCase()) {
    case "UNPAID":
    case "ON_HOLD":
      return "pending";
    case "AWAITING_SHIPMENT":
    case "AWAITING_COLLECTION":
      return "processing";
    case "IN_TRANSIT":
    case "PARTIALLY_SHIPPING":
    case "SHIPPED":
      return "shipped";
    case "DELIVERED":
    case "COMPLETED":
      return "delivered";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    default:
      return "processing";
  }
}

function toDate(unixSeconds?: number): Date | undefined {
  if (!unixSeconds) return undefined;
  return new Date(unixSeconds * 1000);
}

function parseAmount(value?: string): number {
  if (!value) return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

function extractRegion(
  address: TikTokRecipientAddress | undefined,
  level: "province" | "city"
): string | undefined {
  const districts = address?.district_info;
  if (!districts || districts.length === 0) return undefined;

  const wantedLevel = level === "province" ? "Province" : "City";
  const match = districts.find((d) =>
    d.address_level_name?.toLowerCase().includes(wantedLevel.toLowerCase())
  );
  if (match?.address_name) return match.address_name;

  if (level === "province") return districts[0]?.address_name;
  return districts[1]?.address_name;
}

/**
 * Platform pembelian di Seller Center (Purchased On / Platform):
 * commerce_platform = TOKOPEDIA | TIKTOK_SHOP (khusus market Indonesia).
 * Cek TOKOPEDIA dulu — jangan pakai includes("tiktok") lebih dulu,
 * karena field lain bisa mengandung kata tiktok.
 */
function detectTikTokMarketplace(order: TikTokOrder): "tiktok" | "tokopedia" {
  const platform = String(order.commerce_platform ?? "").toUpperCase();
  if (platform.includes("TOKOPEDIA")) return "tokopedia";
  if (platform === "TIKTOK_SHOP" || platform.includes("TIKTOK")) return "tiktok";

  const text = [order.shopping_channel, order.sale_platform, order.order_source]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("tokopedia") || text.includes("tokped")) return "tokopedia";
  return "tiktok";
}

function mapTikTokOrderToOrders(order: TikTokOrder): Order[] {
  const status = mapTikTokStatus(order.status);
  const orderDate = toDate(order.create_time) ?? new Date();
  const recipient = order.recipient_address;

  const lineItems = order.line_items ?? [];

  // Grup line item berdasarkan sku_id + seller_sku untuk menghitung quantity
  const grouped = new Map<string, { item: TikTokLineItem; quantity: number }>();
  for (const item of lineItems) {
    const key = `${item.sku_id ?? ""}|${item.seller_sku ?? ""}|${item.product_name ?? ""}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      grouped.set(key, { item, quantity: 1 });
    }
  }

  const totalAmount = parseAmount(order.payment?.total_amount);

  const marketplace = detectTikTokMarketplace(order);

  const commonFields = {
    platform: marketplace,
    channelName:
      marketplace === "tokopedia" ? "Tokopedia" : "TikTok Shop by Tokopedia",
    customerName: recipient?.name || "Unknown",
    recipientName: recipient?.name,
    status,
    orderDate,
    paidTime: toDate(order.paid_time),
    mustShipBefore: toDate(order.tts_sla_time),
    pickupTime: toDate(order.rts_time),
    shippingAddress: recipient?.full_address,
    city: extractRegion(recipient, "city"),
    province: extractRegion(recipient, "province"),
    trackingNumber:
      order.tracking_number || order.package_list?.[0]?.tracking_number,
    shippingOption:
      order.delivery_option_name || order.delivery_type || order.shipping_type,
    courier:
      order.shipping_provider_name ||
      order.shipping_provider ||
      order.package_list?.[0]?.shipping_provider_name,
    phone: recipient?.phone_number,
    notes: order.buyer_message,
    orderType: order.order_type || order.fulfillment_type,
    isPreorder: /pre[\s-]?order|preorder/i.test(
      `${order.order_type || ""} ${order.fulfillment_type || ""}`
    ),
  };

  if (grouped.size === 0) {
    return [
      {
        ...commonFields,
        id: `tiktok-${order.id}`,
        orderNumber: order.id,
        productName: "Unknown Product",
        quantity: 1,
        price: 0,
        totalAmount,
      },
    ];
  }

  let index = 0;
  const orders: Order[] = [];
  for (const { item, quantity } of Array.from(grouped.values())) {
    const price = parseAmount(item.sale_price);
    const originalPrice = parseAmount(item.original_price) || price;
    orders.push({
      ...commonFields,
      id: `tiktok-${order.id}-${item.sku_id ?? index}`,
      orderNumber: order.id,
      productName: item.product_name || "Unknown Product",
      variation: item.sku_name,
      sku: item.seller_sku,
      quantity,
      originalPrice,
      price,
      // Total order dilekatkan di produk pertama saja agar tidak double-count
      totalAmount: index === 0 ? totalAmount : price * quantity,
    });
    index += 1;
  }

  return orders;
}

async function searchOrdersPage(
  config: TikTokConfig,
  orderStatus: string,
  pageToken = "",
  extra?: { create_time_ge?: number }
): Promise<{ orders: TikTokOrder[]; nextPageToken: string }> {
  const query: Record<string, string> = {
    page_size: "50",
    sort_field: "create_time",
    sort_order: "DESC",
  };
  if (pageToken) query.page_token = pageToken;

  const body: Record<string, string | number> = { order_status: orderStatus };
  if (!pageToken && extra?.create_time_ge) {
    body.create_time_ge = extra.create_time_ge;
  }

  const data = await tiktokRequest<OrderSearchResponse>(config, {
    method: "POST",
    path: `/order/${config.version}/orders/search`,
    query,
    body,
  });

  return {
    orders: data.orders ?? [],
    nextPageToken: data.next_page_token || "",
  };
}

async function searchOrdersByStatus(
  config: TikTokConfig,
  orderStatus: string
): Promise<TikTokOrder[]> {
  const collected: TikTokOrder[] = [];
  let pageToken = "";

  do {
    const page = await searchOrdersPage(config, orderStatus, pageToken);
    if (page.orders.length) collected.push(...page.orders);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return collected;
}

const ORDER_DETAIL_CHUNK = 50;

/**
 * Get Order Detail (202309) — search tidak selalu mengembalikan commerce_platform.
 * GET /order/{version}/orders?ids=id1,id2  (maks 50 ID)
 */
async function getOrdersByIds(
  config: TikTokConfig,
  ids: string[]
): Promise<TikTokOrder[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ORDER_DETAIL_CHUNK) {
    chunks.push(ids.slice(i, i + ORDER_DETAIL_CHUNK));
  }

  const collected: TikTokOrder[] = [];
  const concurrency = 2;
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const pages = await Promise.all(
      batch.map(async (chunk) => {
        try {
          return await tiktokRequest<OrderSearchResponse>(config, {
            method: "GET",
            path: `/order/${config.version}/orders`,
            query: { ids: chunk.join(",") },
          });
        } catch {
          return { orders: [] } as OrderSearchResponse;
        }
      })
    );
    for (const data of pages) {
      if (data.orders?.length) collected.push(...data.orders);
    }
  }

  return collected;
}

async function enrichWithOrderDetails(
  config: TikTokConfig,
  orders: TikTokOrder[]
): Promise<TikTokOrder[]> {
  if (orders.length === 0) return orders;

  const details = await getOrdersByIds(
    config,
    orders.map((order) => order.id)
  );
  const byId = new Map(details.map((order) => [order.id, order]));

  return orders.map((order) => {
    const detail = byId.get(order.id);
    return detail ? { ...order, ...detail } : order;
  });
}

async function searchReadyToShipOrders(config: TikTokConfig): Promise<TikTokOrder[]> {
  const seen = new Set<string>();
  const allTikTokOrders: TikTokOrder[] = [];

  for (const status of READY_TO_SHIP_STATUSES) {
    const orders = await searchOrdersByStatus(config, status);
    for (const order of orders) {
      if (seen.has(order.id)) continue;
      seen.add(order.id);
      allTikTokOrders.push(order);
    }
  }

  return allTikTokOrders;
}

export type TikTokSyncPhase = "rts" | "completed";

export interface TikTokSyncCursor {
  phase?: TikTokSyncPhase;
  shipmentToken: string | null;
  collectionToken: string | null;
  completedToken?: string | null;
  deliveredToken?: string | null;
  pagesFetched: number;
}

const COMPLETED_STATUSES = ["COMPLETED", "DELIVERED"] as const;
const COMPLETED_LOOKBACK_DAYS = 30;

function completedSinceUnix() {
  return Math.floor(Date.now() / 1000) - COMPLETED_LOOKBACK_DAYS * 24 * 60 * 60;
}

export function emptyCompletedCursor(): TikTokSyncCursor {
  return {
    phase: "completed",
    shipmentToken: null,
    collectionToken: null,
    completedToken: null,
    deliveredToken: null,
    pagesFetched: 0,
  };
}

function dedupeTikTokOrders(orders: TikTokOrder[]): TikTokOrder[] {
  const seen = new Set<string>();
  const unique: TikTokOrder[] = [];
  for (const order of orders) {
    if (!order.id || seen.has(order.id)) continue;
    seen.add(order.id);
    unique.push(order);
  }
  return unique;
}

/**
 * Satu batch antrian siap dikirim. Request pertama: halaman 1 tiap status.
 * Sync berikutnya hanya halaman baru sampai ketemu yang sudah ada di database.
 */
export async function fetchTikTokReadyToShipBatch(
  config: TikTokConfig,
  cursor?: TikTokSyncCursor
): Promise<{
  listed: TikTokOrder[];
  cursor: TikTokSyncCursor;
  nextCursor: TikTokSyncCursor | null;
  done: boolean;
}> {
  const shipmentStatus = READY_TO_SHIP_STATUSES[0];
  const collectionStatus = READY_TO_SHIP_STATUSES[1];

  if (!cursor) {
    const [shipment, collection] = await Promise.all([
      searchOrdersPage(config, shipmentStatus),
      searchOrdersPage(config, collectionStatus),
    ]);
    const listed = dedupeTikTokOrders([...shipment.orders, ...collection.orders]);
    const next: TikTokSyncCursor = {
      phase: "rts",
      shipmentToken: shipment.nextPageToken || null,
      collectionToken: collection.nextPageToken || null,
      pagesFetched: 1,
    };
    const done = !next.shipmentToken && !next.collectionToken;
    return { listed, cursor: next, nextCursor: done ? null : next, done };
  }

  const listed: TikTokOrder[] = [];
  let shipmentToken = cursor.shipmentToken;
  let collectionToken = cursor.collectionToken;

  if (shipmentToken) {
    const page = await searchOrdersPage(config, shipmentStatus, shipmentToken);
    listed.push(...page.orders);
    shipmentToken = page.nextPageToken || null;
  }
  if (collectionToken) {
    const page = await searchOrdersPage(config, collectionStatus, collectionToken);
    listed.push(...page.orders);
    collectionToken = page.nextPageToken || null;
  }

  const next: TikTokSyncCursor = {
    phase: "rts",
    shipmentToken,
    collectionToken,
    pagesFetched: cursor.pagesFetched + 1,
  };
  const done = !shipmentToken && !collectionToken;
  return {
    listed: dedupeTikTokOrders(listed),
    cursor: next,
    nextCursor: done ? null : next,
    done,
  };
}

async function searchCompletedPage(
  config: TikTokConfig,
  status: (typeof COMPLETED_STATUSES)[number],
  pageToken: string
) {
  try {
    return await searchOrdersPage(
      config,
      status,
      pageToken,
      pageToken ? undefined : { create_time_ge: completedSinceUnix() }
    );
  } catch {
    return { orders: [] as TikTokOrder[], nextPageToken: "" };
  }
}

/**
 * Satu batch pesanan selesai (COMPLETED + DELIVERED), 30 hari terakhir.
 * Dipakai Ambil TikTok di dashboard — tidak untuk Kirim hari ini.
 */
export async function fetchTikTokCompletedBatch(
  config: TikTokConfig,
  cursor?: TikTokSyncCursor
): Promise<{
  listed: TikTokOrder[];
  cursor: TikTokSyncCursor;
  nextCursor: TikTokSyncCursor | null;
  done: boolean;
}> {
  if (!cursor || cursor.pagesFetched === 0) {
    const [completed, delivered] = await Promise.all([
      searchCompletedPage(config, "COMPLETED", ""),
      searchCompletedPage(config, "DELIVERED", ""),
    ]);
    const listed = dedupeTikTokOrders([...completed.orders, ...delivered.orders]);
    const next: TikTokSyncCursor = {
      phase: "completed",
      shipmentToken: null,
      collectionToken: null,
      completedToken: completed.nextPageToken || null,
      deliveredToken: delivered.nextPageToken || null,
      pagesFetched: 1,
    };
    const done = !next.completedToken && !next.deliveredToken;
    return { listed, cursor: next, nextCursor: done ? null : next, done };
  }

  const listed: TikTokOrder[] = [];
  let completedToken = cursor.completedToken || null;
  let deliveredToken = cursor.deliveredToken || null;

  if (completedToken) {
    const page = await searchCompletedPage(config, "COMPLETED", completedToken);
    listed.push(...page.orders);
    completedToken = page.nextPageToken || null;
  }
  if (deliveredToken) {
    const page = await searchCompletedPage(config, "DELIVERED", deliveredToken);
    listed.push(...page.orders);
    deliveredToken = page.nextPageToken || null;
  }

  const next: TikTokSyncCursor = {
    phase: "completed",
    shipmentToken: null,
    collectionToken: null,
    completedToken,
    deliveredToken,
    pagesFetched: cursor.pagesFetched + 1,
  };
  const done = !completedToken && !deliveredToken;
  return {
    listed: dedupeTikTokOrders(listed),
    cursor: next,
    nextCursor: done ? null : next,
    done,
  };
}

export async function mapTikTokListedOrders(
  config: TikTokConfig,
  listed: TikTokOrder[]
): Promise<Order[]> {
  const enriched = await enrichWithOrderDetails(config, listed);
  return enriched.flatMap(mapTikTokOrderToOrders);
}

/**
 * Cari order TikTok/Tokopedia by ID dari Excel import.
 * Tidak menulis ke database — dipakai overview-duedate untuk menyamakan data realtime.
 */
export async function fetchTikTokOrdersByNumbers(
  config: TikTokConfig,
  numbers: string[]
): Promise<Order[]> {
  const ids = Array.from(new Set(numbers.map((n) => String(n).trim()).filter(Boolean)));
  if (ids.length === 0) return [];

  const details = await getOrdersByIds(config, ids).catch(() => [] as TikTokOrder[]);
  return details.flatMap(mapTikTokOrderToOrders);
}

/**
 * Tarik semua order "siap dikirim" dari TikTok Shop dan ubah ke format Order aplikasi.
 */
export async function fetchReadyToShipOrders(config: TikTokConfig): Promise<Order[]> {
  const listed = await searchReadyToShipOrders(config);
  const enriched = await enrichWithOrderDetails(config, listed);
  return enriched.flatMap(mapTikTokOrderToOrders);
}
