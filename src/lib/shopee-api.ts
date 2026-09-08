import { Order, OrderStatus } from "@/types/order";
import { sanitizeOrderMetrics } from "@/lib/utils";
import {
  ensureFreshTokens,
  getShopeeBaseUrl,
  getShopeePartnerId,
  isShopeeAuthError,
  refreshAccessToken,
  shopeeSign,
  type ShopeeStoredTokens,
} from "@/lib/shopee-auth";

/**
 * Shopee Open API v2 — order sync.
 * https://open.shopee.com/developer-guide/20
 * https://open.shopee.com/documents/v2/v2.order.get_order_list?module=94&type=1
 */

const DETAIL_FIELDS =
  "buyer_username,item_list,pay_time,note,package_list,shipping_carrier,payment_method,total_amount,ship_by_date,pickup_done_time,checkout_shipping_carrier,recipient_address";
const DETAIL_FIELDS_SAFE =
  "buyer_username,item_list,pay_time,note,package_list,shipping_carrier,payment_method,total_amount,ship_by_date,pickup_done_time,checkout_shipping_carrier";
const DETAIL_FIELDS_MINIMAL =
  "item_list,pay_time,note,package_list,shipping_carrier,payment_method,total_amount,ship_by_date,pickup_done_time,checkout_shipping_carrier";

export interface ShopeeConfig {
  partnerId: number;
  accessToken: string;
  shopId: number;
  baseUrl: string;
}

export async function getShopeeConfig(): Promise<ShopeeConfig> {
  const tokens = await ensureFreshTokens();
  if (!tokens.shopId) {
    throw new Error("shop_id Shopee belum ada. Hubungkan toko di Settings.");
  }
  return {
    partnerId: getShopeePartnerId(),
    accessToken: tokens.accessToken,
    shopId: tokens.shopId,
    baseUrl: getShopeeBaseUrl(),
  };
}

interface ShopeeItem {
  item_id?: number;
  item_name?: string;
  item_sku?: string;
  model_sku?: string;
  model_id?: number;
  model_name?: string;
  model_quantity_purchased?: number;
  model_original_price?: number;
  model_discounted_price?: number;
}

interface ShopeePackage {
  package_number?: string;
  logistics_status?: string;
  shipping_carrier?: string;
  tracking_number?: string;
}

interface ShopeeOrder {
  order_sn: string;
  order_status?: string;
  create_time?: number;
  update_time?: number;
  pay_time?: number;
  ship_by_date?: number;
  pickup_done_time?: number;
  buyer_username?: string;
  note?: string;
  total_amount?: number | string;
  shipping_carrier?: string;
  checkout_shipping_carrier?: string;
  item_list?: ShopeeItem[];
  package_list?: ShopeePackage[];
  recipient_address?: {
    name?: string;
    phone?: string;
    full_address?: string;
    city?: string;
    state?: string;
  };
}

interface ShopeeApiResponse<T> {
  error?: string;
  message?: string;
  response?: T;
}

export type ShopeeSyncPhase = "rts" | "processed" | "completed";

export interface ShopeeSyncCursor {
  phase: ShopeeSyncPhase;
  listCursor: string;
  windowIndex: number;
  pagesFetched: number;
}

export function emptyProcessedCursor(): ShopeeSyncCursor {
  return { phase: "processed", listCursor: "", windowIndex: 0, pagesFetched: 0 };
}

export function emptyCompletedCursor(): ShopeeSyncCursor {
  return { phase: "completed", listCursor: "", windowIndex: 0, pagesFetched: 0 };
}

function toDate(unix?: number): Date | undefined {
  if (!unix || !Number.isFinite(unix)) return undefined;
  const ms = unix < 1_000_000_000_000 ? unix * 1000 : unix;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseAmount(value?: number | string): number {
  const n = typeof value === "number" ? value : Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function mapShopeeStatus(raw?: string): OrderStatus {
  const status = String(raw || "").toUpperCase();
  if (status === "UNPAID") return "pending";
  if (status === "SHIPPED" || status === "TO_CONFIRM_RECEIVE") return "shipped";
  if (status === "COMPLETED") return "delivered";
  if (status === "CANCELLED" || status === "IN_CANCEL") return "cancelled";
  return "processing";
}

async function shopeeRequest<T>(
  config: ShopeeConfig,
  apiPath: string,
  query: Record<string, string> = {},
  retried = false
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000);
  const extra = `${config.accessToken}${config.shopId}`;
  const sign = shopeeSign(apiPath, timestamp, extra);
  const params = new URLSearchParams({
    partner_id: String(config.partnerId),
    timestamp: String(timestamp),
    access_token: config.accessToken,
    shop_id: String(config.shopId),
    sign,
    ...query,
  });
  const res = await fetch(`${config.baseUrl}${apiPath}?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const json = (await res.json()) as ShopeeApiResponse<T> & T;
  if (isShopeeAuthError(json.error, json.message) && !retried) {
    const tokens: ShopeeStoredTokens = await refreshAccessToken();
    return shopeeRequest(
      { ...config, accessToken: tokens.accessToken, shopId: tokens.shopId || config.shopId },
      apiPath,
      query,
      true
    );
  }
  if (json.error) {
    throw new Error(`Shopee API (${json.error}): ${json.message || "request failed"}`);
  }
  return (json.response ?? json) as T;
}

async function getOrderListPage(
  config: ShopeeConfig,
  status: string,
  timeFrom: number,
  timeTo: number,
  cursor: string
): Promise<{ sns: string[]; nextCursor: string; more: boolean }> {
  const query: Record<string, string> = {
    time_range_field: "update_time",
    time_from: String(timeFrom),
    time_to: String(timeTo),
    page_size: "50",
    order_status: status,
  };
  if (cursor) query.cursor = cursor;
  const data = await shopeeRequest<{
    more?: boolean;
    next_cursor?: string;
    order_list?: { order_sn: string }[];
  }>(config, "/api/v2/order/get_order_list", query);
  return {
    sns: (data.order_list || []).map((row) => row.order_sn).filter(Boolean),
    nextCursor: data.next_cursor || "",
    more: Boolean(data.more),
  };
}

async function getShipmentListPage(
  config: ShopeeConfig,
  cursor: string
): Promise<{ sns: string[]; nextCursor: string; more: boolean }> {
  const query: Record<string, string> = { page_size: "50" };
  if (cursor) query.cursor = cursor;
  const data = await shopeeRequest<{
    more?: boolean;
    next_cursor?: string;
    order_list?: { order_sn: string }[];
  }>(config, "/api/v2/order/get_shipment_list", query);
  return {
    sns: (data.order_list || []).map((row) => row.order_sn).filter(Boolean),
    nextCursor: data.next_cursor || "",
    more: Boolean(data.more),
  };
}

async function getOrderDetails(config: ShopeeConfig, sns: string[]): Promise<ShopeeOrder[]> {
  const unique = Array.from(new Set(sns.map((sn) => sn.trim()).filter(Boolean)));
  if (unique.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 50) chunks.push(unique.slice(i, i + 50));

  const collected: ShopeeOrder[] = [];
  for (const chunk of chunks) {
    const fieldSets = [DETAIL_FIELDS, DETAIL_FIELDS_SAFE, DETAIL_FIELDS_MINIMAL];
    let loaded = false;
    for (const fields of fieldSets) {
      try {
        const data = await shopeeRequest<{ order_list?: ShopeeOrder[] }>(
          config,
          "/api/v2/order/get_order_detail",
          { order_sn_list: chunk.join(","), response_optional_fields: fields }
        );
        collected.push(...(data.order_list || []));
        loaded = true;
        break;
      } catch {
        // App may not have sensitive-data access; retry with fewer fields.
      }
    }
    if (!loaded) {
      throw new Error("Gagal mengambil detail pesanan Shopee");
    }
  }
  return collected;
}

function mapShopeeOrder(order: ShopeeOrder): Order[] {
  const status = mapShopeeStatus(order.order_status);
  const recipient = order.recipient_address;
  const items = order.item_list?.length ? order.item_list : [{}];
  const totalAmount = parseAmount(order.total_amount);
  const tracking =
    order.package_list?.find((pkg) => pkg.tracking_number)?.tracking_number ||
    order.package_list?.[0]?.package_number;
  const courier =
    order.shipping_carrier ||
    order.checkout_shipping_carrier ||
    order.package_list?.[0]?.shipping_carrier;
  const common = {
    platform: "shopee" as const,
    channelName: "Shopee",
    customerName: recipient?.name || order.buyer_username || "Unknown",
    recipientName: recipient?.name,
    status,
    orderDate: toDate(order.create_time) ?? new Date(),
    paidTime: toDate(order.pay_time),
    mustShipBefore: toDate(order.ship_by_date),
    pickupTime: toDate(order.pickup_done_time),
    shippingAddress: recipient?.full_address,
    city: recipient?.city,
    province: recipient?.state,
    trackingNumber: tracking,
    courier,
    shippingOption: courier,
    phone: recipient?.phone,
    notes: order.note,
  };

  return items.map((item, index) => {
    const quantity = item.model_quantity_purchased || 1;
    const price = parseAmount(item.model_discounted_price || item.model_original_price);
    return sanitizeOrderMetrics({
      ...common,
      id: `shopee-${order.order_sn}-${item.item_id ?? index}-${item.model_id ?? 0}`,
      orderNumber: order.order_sn,
      productName: item.item_name || `Order ${order.order_sn}`,
      variation: item.model_name,
      sku: item.model_sku || item.item_sku,
      quantity,
      originalPrice: parseAmount(item.model_original_price) || price,
      price,
      totalAmount: index === 0 ? totalAmount : price * quantity,
    });
  });
}

function timeWindows(days: number, windowDays = 15): { from: number; to: number }[] {
  const now = Math.floor(Date.now() / 1000);
  const span = windowDays * 24 * 60 * 60;
  const windows: { from: number; to: number }[] = [];
  let to = now;
  const oldest = now - days * 24 * 60 * 60;
  while (to > oldest) {
    const from = Math.max(oldest, to - span + 1);
    windows.push({ from, to });
    to = from - 1;
  }
  return windows;
}

export async function fetchShopeeReadyToShipBatch(
  config: ShopeeConfig,
  cursor?: ShopeeSyncCursor
): Promise<{ listed: string[]; nextCursor: ShopeeSyncCursor | null; done: boolean }> {
  const page = await getShipmentListPage(config, cursor?.listCursor || "");
  const next: ShopeeSyncCursor = {
    phase: "rts",
    listCursor: page.nextCursor,
    windowIndex: 0,
    pagesFetched: (cursor?.pagesFetched || 0) + 1,
  };
  const done = !page.more;
  return { listed: page.sns, nextCursor: done ? null : next, done };
}

export async function fetchShopeeStatusBatch(
  config: ShopeeConfig,
  status: "PROCESSED" | "COMPLETED",
  cursor?: ShopeeSyncCursor
): Promise<{ listed: string[]; nextCursor: ShopeeSyncCursor | null; done: boolean }> {
  const days = status === "COMPLETED" ? 30 : 15;
  const windows = timeWindows(days);
  const windowIndex = cursor?.windowIndex || 0;
  const window = windows[windowIndex];
  if (!window) {
    return { listed: [], nextCursor: null, done: true };
  }
  const page = await getOrderListPage(
    config,
    status,
    window.from,
    window.to,
    cursor?.listCursor || ""
  );
  let nextWindow = windowIndex;
  let nextList = page.nextCursor;
  let done = false;
  if (!page.more) {
    if (windowIndex + 1 < windows.length) {
      nextWindow = windowIndex + 1;
      nextList = "";
    } else {
      done = true;
    }
  }
  const next: ShopeeSyncCursor = {
    phase: status === "COMPLETED" ? "completed" : "processed",
    listCursor: nextList,
    windowIndex: nextWindow,
    pagesFetched: (cursor?.pagesFetched || 0) + 1,
  };
  return { listed: page.sns, nextCursor: done ? null : next, done };
}

export async function mapShopeeListedOrders(
  config: ShopeeConfig,
  sns: string[]
): Promise<Order[]> {
  const details = await getOrderDetails(config, sns);
  return details.flatMap(mapShopeeOrder);
}

export async function fetchShopeeOrdersByNumbers(
  config: ShopeeConfig,
  numbers: string[]
): Promise<Order[]> {
  return mapShopeeListedOrders(config, numbers);
}
