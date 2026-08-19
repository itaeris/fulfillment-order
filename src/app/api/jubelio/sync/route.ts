import { NextResponse } from "next/server";
import { fetchJubelioReadyToShipBatch, type JubelioSyncCursor } from "@/lib/jubelio-api";
import {
  countOrdersByPlatform,
  deleteOrdersByPlatform,
  deleteUploadedFilesByPlatform,
  findExistingOrderIds,
  insertOrders,
  insertUploadedFile,
} from "@/lib/db";
import { Order } from "@/types/order";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADD_PAGES_PER_BATCH = 4;
const MAX_INCREMENTAL_PAGE = 8;

function publicJubelioError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/belum di-set|JUBELIO_EMAIL|JUBELIO_PASSWORD/i.test(message)) {
    return "Jubelio belum terhubung di server. Hubungi IT.";
  }
  if (/timeout|timed out|504/i.test(message)) {
    return "Pengambilan data terlalu lama. Coba lagi.";
  }
  if (/401|unauthorized|login|password|credential/i.test(message)) {
    return "Gagal masuk ke Jubelio. Hubungi IT.";
  }
  return "Gagal mengambil data Jubelio. Coba lagi.";
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
    name: "Jubelio API",
    platform: "jubelio",
    orderCount: count,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      startPage?: number;
      insertedSoFar?: number;
      cursor?: JubelioSyncCursor;
    };
    const startPage = Number(body.startPage) || 1;
    const isFirst = !body.cursor;
    const dbCount = await countOrdersByPlatform("jubelio");
    const hasCache = dbCount > 0;

    const batch = await fetchJubelioReadyToShipBatch({
      startPage,
      pageCount: isFirst ? 1 : ADD_PAGES_PER_BATCH,
      cursor: body.cursor,
      allowSalesFallback: true,
    });

    const ids = batch.orders.map((order) => order.id);
    const existing = await findExistingOrderIds(ids);
    const newOrders = batch.orders.filter((order) => !existing.has(order.id));
    const allKnown = ids.length > 0 && ids.every((id) => existing.has(id));

    if (hasCache && (batch.orders.length === 0 || (isFirst && allKnown))) {
      await markSynced(dbCount);
      return NextResponse.json({
        success: true,
        done: true,
        cached: true,
        count: dbCount,
        added: 0,
        nextPage: null,
        cursor: batch.cursor,
        total: dbCount,
        syncedAt: new Date().toISOString(),
      });
    }

    if (!hasCache) {
      if (isFirst) {
        await deleteOrdersByPlatform("jubelio");
        await deleteUploadedFilesByPlatform("jubelio");
      }
      if (batch.orders.length > 0) {
        await insertOrders(batch.orders.map(orderToInput));
      }
      const count = (Number(body.insertedSoFar) || 0) + batch.orders.length;
      if (batch.done) await markSynced(count);
      return NextResponse.json({
        success: true,
        done: batch.done,
        cached: false,
        count,
        added: batch.orders.length,
        nextPage: batch.nextPage,
        cursor: { ...batch.cursor, mode: "full" as const },
        total: batch.cursor.apiTotal || count,
        syncedAt: new Date().toISOString(),
      });
    }

    if (newOrders.length > 0) {
      await insertOrders(newOrders.map(orderToInput));
    }

    const overlapped =
      allKnown ||
      batch.done ||
      (batch.nextPage != null && batch.nextPage > MAX_INCREMENTAL_PAGE);

    const count = dbCount + newOrders.length;
    if (overlapped) {
      await markSynced(count);
      return NextResponse.json({
        success: true,
        done: true,
        cached: false,
        count,
        added: newOrders.length,
        nextPage: null,
        cursor: { ...batch.cursor, mode: "add" as const },
        total: count,
        syncedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      done: false,
      cached: false,
      count,
      added: newOrders.length,
      nextPage: batch.nextPage,
      cursor: { ...batch.cursor, mode: "add" as const },
      total: count,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error syncing Jubelio orders:", error);
    return NextResponse.json({ error: publicJubelioError(error) }, { status: 500 });
  }
}
