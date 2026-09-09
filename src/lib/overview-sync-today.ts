import {
  countOverviewOrdersByPlatforms,
  insertOverviewFile,
  replaceOverviewOrdersByPlatforms,
} from "@/lib/db";
import { filterShipTodayQueue } from "@/lib/due-date";
import { fetchJubelioReadyToShipBatch } from "@/lib/jubelio-api";
import {
  fetchShopeeReadyToShipBatch,
  getShopeeConfig,
  mapShopeeListedOrders,
} from "@/lib/shopee-api";
import {
  fetchTikTokReadyToShipBatch,
  getTikTokConfig,
  mapTikTokListedOrders,
} from "@/lib/tiktok-api";
import { toIndonesianError } from "@/lib/errors";
import { Order, Platform } from "@/types/order";

type OverviewSyncSource = "shopee" | "tiktok" | "jubelio";

const MAX_PAGES = 20;
const FILE_META: Record<OverviewSyncSource, { name: string; platforms: Platform[] }> = {
  shopee: { name: "Shopee Open API", platforms: ["shopee"] },
  tiktok: { name: "TikTok Shop API", platforms: ["tiktok", "tokopedia"] },
  jubelio: { name: "Jubelio API", platforms: ["jubelio"] },
};

function toInput(order: Order) {
  return {
    ...order,
    orderDate: order.orderDate ? new Date(order.orderDate).toISOString() : undefined,
    paidTime: order.paidTime ? new Date(order.paidTime).toISOString() : undefined,
    shippedTime: order.shippedTime ? new Date(order.shippedTime).toISOString() : undefined,
    mustShipBefore: order.mustShipBefore
      ? new Date(order.mustShipBefore).toISOString()
      : undefined,
    pickupTime: order.pickupTime ? new Date(order.pickupTime).toISOString() : undefined,
  };
}

async function collectShopeeToday(): Promise<Order[]> {
  const config = await getShopeeConfig();
  const collected: Order[] = [];
  let cursor: Awaited<ReturnType<typeof fetchShopeeReadyToShipBatch>>["nextCursor"] = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await fetchShopeeReadyToShipBatch(config, cursor || undefined);
    const mapped =
      batch.listed.length > 0 ? await mapShopeeListedOrders(config, batch.listed) : [];
    collected.push(...filterShipTodayQueue(mapped));
    if (batch.done || !batch.nextCursor) break;
    cursor = batch.nextCursor;
  }
  return collected;
}

async function collectTikTokToday(): Promise<Order[]> {
  const config = await getTikTokConfig();
  const collected: Order[] = [];
  let cursor: Awaited<ReturnType<typeof fetchTikTokReadyToShipBatch>>["nextCursor"] = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await fetchTikTokReadyToShipBatch(config, cursor || undefined);
    const mapped =
      batch.listed.length > 0 ? await mapTikTokListedOrders(config, batch.listed) : [];
    collected.push(...filterShipTodayQueue(mapped));
    if (batch.done || !batch.nextCursor) break;
    cursor = batch.nextCursor;
  }
  return collected;
}

async function collectJubelioToday(): Promise<Order[]> {
  const collected: Order[] = [];
  let startPage = 1;
  let cursor: Awaited<ReturnType<typeof fetchJubelioReadyToShipBatch>>["cursor"] | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await fetchJubelioReadyToShipBatch({
      startPage,
      pageCount: page === 0 ? 1 : 4,
      cursor,
      allowSalesFallback: true,
    });
    collected.push(...filterShipTodayQueue(batch.orders));
    if (batch.done) break;
    if (!batch.nextPage && !batch.cursor) break;
    startPage = batch.nextPage || startPage;
    cursor = batch.cursor;
  }
  return collected;
}

async function collectToday(source: OverviewSyncSource): Promise<Order[]> {
  if (source === "shopee") return collectShopeeToday();
  if (source === "tiktok") return collectTikTokToday();
  return collectJubelioToday();
}

export type OverviewTodaySyncResult = {
  source: OverviewSyncSource;
  count: number;
  preserved?: boolean;
  skipped?: boolean;
  error?: string;
};

export async function persistOverviewToday(
  source: OverviewSyncSource,
  orders: Order[]
): Promise<OverviewTodaySyncResult> {
  const meta = FILE_META[source];
  const existing = await countOverviewOrdersByPlatforms(meta.platforms);
  if (orders.length === 0 && existing > 0) {
    return { source, count: existing, preserved: true };
  }
  await replaceOverviewOrdersByPlatforms(meta.platforms, orders.map(toInput));
  await insertOverviewFile({
    name: meta.name,
    platform: meta.platforms[0],
    orderCount: orders.length,
  });
  return { source, count: orders.length };
}

export async function syncOverviewTodaySource(
  source: OverviewSyncSource
): Promise<OverviewTodaySyncResult> {
  try {
    const orders = await collectToday(source);
    return persistOverviewToday(source, orders);
  } catch (error) {
    const fallback =
      source === "shopee"
        ? "Gagal mengambil data Shopee"
        : source === "tiktok"
          ? "Gagal mengambil data TikTok"
          : "Gagal mengambil data Jubelio";
    return {
      source,
      count: 0,
      error: toIndonesianError(error instanceof Error ? error.message : null, fallback),
    };
  }
}

export async function syncOverviewTodayAll(budgetMs = 50_000): Promise<{
  shopee: OverviewTodaySyncResult;
  tiktok: OverviewTodaySyncResult;
  jubelio: OverviewTodaySyncResult;
}> {
  const started = Date.now();
  const sources: OverviewSyncSource[] = ["shopee", "tiktok", "jubelio"];
  const out: Record<OverviewSyncSource, OverviewTodaySyncResult> = {
    shopee: { source: "shopee", count: 0, skipped: true },
    tiktok: { source: "tiktok", count: 0, skipped: true },
    jubelio: { source: "jubelio", count: 0, skipped: true },
  };
  for (const source of sources) {
    if (Date.now() - started > budgetMs - 8_000) {
      out[source] = { source, count: 0, skipped: true };
      continue;
    }
    out[source] = await syncOverviewTodaySource(source);
  }
  return {
    shopee: out.shopee,
    tiktok: out.tiktok,
    jubelio: out.jubelio,
  };
}
