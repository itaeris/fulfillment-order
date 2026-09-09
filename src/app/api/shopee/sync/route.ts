import { NextResponse } from "next/server";
import {
  emptyCompletedCursor,
  emptyProcessedCursor,
  fetchShopeeReadyToShipBatch,
  fetchShopeeStatusBatch,
  getShopeeConfig,
  mapShopeeListedOrders,
  type ShopeeSyncCursor,
} from "@/lib/shopee-api";
import {
  countOrdersByPlatforms,
  deleteUploadedFilesByPlatform,
  findExistingOrderNumbers,
  insertOrders,
  insertUploadedFile,
} from "@/lib/db";
import { Order } from "@/types/order";
import { filterShipTodayQueue } from "@/lib/due-date";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOPEE_PLATFORMS = ["shopee"];
const MAX_INCREMENTAL_PAGES = 4;
const MAX_COMPLETED_PAGES = 6;

function publicShopeeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/belum|SHOPEE_|shop_id/i.test(message)) {
    return "Shopee belum terhubung di server. Hubungkan toko di Settings.";
  }
  if (/timeout|timed out|504/i.test(message)) {
    return "Pengambilan data terlalu lama. Coba lagi.";
  }
  if (/401|unauthorized|token|error_auth/i.test(message)) {
    return "Gagal masuk ke Shopee. Hubungkan ulang toko.";
  }
  return "Gagal mengambil data Shopee. Coba lagi.";
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
    name: "Shopee Open API",
    platform: "shopee",
    orderCount: count,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      insertedSoFar?: number;
      cursor?: ShopeeSyncCursor;
      persist?: boolean;
      scope?: string;
    };
    const persist = body.persist !== false;
    const todayOnly = body.scope === "today";
    const phase = todayOnly ? "rts" : body.cursor?.phase || "rts";
    const config = await getShopeeConfig();

    const fetchBatch = async () => {
      if (phase === "processed") return fetchShopeeStatusBatch(config, "PROCESSED", body.cursor);
      if (phase === "completed") return fetchShopeeStatusBatch(config, "COMPLETED", body.cursor);
      return fetchShopeeReadyToShipBatch(config, body.cursor);
    };

    if (!persist) {
      const batch = await fetchBatch();
      const mapped = batch.listed.length > 0 ? await mapShopeeListedOrders(config, batch.listed) : [];
      const orders = todayOnly ? filterShipTodayQueue(mapped) : mapped;
      const count = (Number(body.insertedSoFar) || 0) + orders.length;
      return NextResponse.json({
        success: true,
        done: batch.done,
        persist: false,
        count,
        added: orders.length,
        orders: orders.map(orderToInput),
        nextPage: batch.done ? null : 1,
        cursor: batch.done ? null : batch.nextCursor,
        syncedAt: new Date().toISOString(),
      });
    }

    const isFirstRts = !body.cursor;
    const dbCount = await countOrdersByPlatforms(SHOPEE_PLATFORMS);
    const hasCache = dbCount > 0;
    const batch = await fetchBatch();
    const existing = await findExistingOrderNumbers(SHOPEE_PLATFORMS, batch.listed);
    const newListed = batch.listed.filter((sn) => !existing.has(sn));
    const allKnown = batch.listed.length > 0 && batch.listed.every((sn) => existing.has(sn));
    const toMap = hasCache && isFirstRts && allKnown ? [] : hasCache ? newListed : batch.listed;
    const orders = toMap.length > 0 ? await mapShopeeListedOrders(config, toMap) : [];
    if (orders.length > 0) {
      await insertOrders(orders.map(orderToInput));
    }

    if (!hasCache && isFirstRts) {
      await deleteUploadedFilesByPlatform("shopee");
    }

    const added = newListed.length;
    const count = hasCache
      ? dbCount + added
      : (Number(body.insertedSoFar) || 0) + orders.length;

    if (phase === "rts") {
      const rtsDone =
        !hasCache
          ? batch.done
          : allKnown ||
            batch.done ||
            (body.cursor?.pagesFetched || 0) + 1 >= MAX_INCREMENTAL_PAGES ||
            (isFirstRts && (batch.listed.length === 0 || allKnown));
      return NextResponse.json({
        success: true,
        done: false,
        count,
        added,
        nextPage: 1,
        cursor: rtsDone ? emptyProcessedCursor() : batch.nextCursor,
        syncedAt: new Date().toISOString(),
      });
    }

    if (phase === "processed") {
      return NextResponse.json({
        success: true,
        done: false,
        count,
        added,
        nextPage: 1,
        cursor: batch.done ? emptyCompletedCursor() : batch.nextCursor,
        syncedAt: new Date().toISOString(),
      });
    }

    const completedDone =
      batch.done ||
      (body.cursor?.pagesFetched || 0) + 1 >= MAX_COMPLETED_PAGES ||
      (newListed.length === 0 && (body.cursor?.pagesFetched || 0) >= 2);

    if (completedDone) {
      await markSynced(count);
    }

    return NextResponse.json({
      success: true,
      done: completedDone,
      count,
      added,
      nextPage: completedDone ? null : 1,
      cursor: completedDone ? null : batch.nextCursor,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    const dbCount = await countOrdersByPlatforms(SHOPEE_PLATFORMS).catch(() => 0);
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
    return NextResponse.json({ error: publicShopeeError(error) }, { status: 500 });
  }
}
