import { NextResponse } from "next/server";
import {
  getTikTokConfig,
  fetchTikTokReadyToShipBatch,
  mapTikTokListedOrders,
  type TikTokSyncCursor,
} from "@/lib/tiktok-api";
import {
  countOrdersByPlatforms,
  deleteUploadedFilesByPlatform,
  findExistingOrderNumbers,
  insertOrders,
  insertUploadedFile,
} from "@/lib/db";
import { Order } from "@/types/order";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIKTOK_PLATFORMS = ["tiktok", "tokopedia"];
const MAX_INCREMENTAL_PAGES = 4;

function publicTikTokError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/belum lengkap|TIKTOK_/i.test(message)) {
    return "TikTok belum terhubung di server. Hubungi IT.";
  }
  if (/timeout|timed out|504/i.test(message)) {
    return "Pengambilan data terlalu lama. Coba lagi.";
  }
  if (/401|unauthorized|token/i.test(message)) {
    return "Gagal masuk ke TikTok. Hubungkan ulang toko.";
  }
  return "Gagal mengambil data TikTok. Coba lagi.";
}

function orderToInput(order: Order) {
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

async function markSynced(count: number) {
  await insertUploadedFile({
    name: "TikTok Shop API",
    platform: "tiktok",
    orderCount: count,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      insertedSoFar?: number;
      cursor?: TikTokSyncCursor;
    };
    const isFirst = !body.cursor;
    const dbCount = await countOrdersByPlatforms(TIKTOK_PLATFORMS);
    const hasCache = dbCount > 0;
    const config = await getTikTokConfig();

    const batch = await fetchTikTokReadyToShipBatch(config, body.cursor);
    const numbers = batch.listed.map((order) => order.id);
    const existing = await findExistingOrderNumbers(TIKTOK_PLATFORMS, numbers);
    const newListed = batch.listed.filter((order) => !existing.has(order.id));
    const allKnown = numbers.length > 0 && numbers.every((id) => existing.has(id));

    if (hasCache && (batch.listed.length === 0 || (isFirst && allKnown))) {
      await markSynced(dbCount);
      return NextResponse.json({
        success: true,
        done: true,
        cached: true,
        count: dbCount,
        added: 0,
        nextPage: null,
        cursor: null,
        syncedAt: new Date().toISOString(),
      });
    }

    const toMap = hasCache ? newListed : batch.listed;
    const orders = toMap.length > 0 ? await mapTikTokListedOrders(config, toMap) : [];
    if (orders.length > 0) {
      await insertOrders(orders.map(orderToInput));
    }

    if (!hasCache && isFirst) {
      await deleteUploadedFilesByPlatform("tiktok");
    }

    const added = newListed.length;
    const count = hasCache
      ? dbCount + added
      : (Number(body.insertedSoFar) || 0) + orders.length;
    const stopIncremental =
      hasCache &&
      (allKnown ||
        batch.done ||
        batch.cursor.pagesFetched >= MAX_INCREMENTAL_PAGES);
    const done = !hasCache ? batch.done : stopIncremental;

    if (done) await markSynced(count);

    return NextResponse.json({
      success: true,
      done,
      cached: false,
      count,
      added,
      nextPage: done ? null : 1,
      cursor: done ? null : batch.nextCursor,
      byPlatform: {
        tiktok: new Set(orders.filter((o) => o.platform === "tiktok").map((o) => o.orderNumber))
          .size,
        tokopedia: new Set(
          orders.filter((o) => o.platform === "tokopedia").map((o) => o.orderNumber)
        ).size,
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    const dbCount = await countOrdersByPlatforms(TIKTOK_PLATFORMS).catch(() => 0);
    if (dbCount > 0) {
      await markSynced(dbCount);
      return NextResponse.json({
        success: true,
        done: true,
        cached: true,
        count: dbCount,
        added: 0,
        nextPage: null,
        cursor: null,
        syncedAt: new Date().toISOString(),
      });
    }
    return NextResponse.json({ error: publicTikTokError(error) }, { status: 500 });
  }
}
