import { NextResponse } from "next/server";
import { fetchJubelioReadyToShipBatch, type JubelioSyncCursor } from "@/lib/jubelio-api";
import {
  deleteOrdersByPlatform,
  insertOrders,
  insertUploadedFile,
  deleteUploadedFilesByPlatform,
} from "@/lib/db";
import { Order } from "@/types/order";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGES_PER_BATCH = 4;

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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      startPage?: number;
      insertedSoFar?: number;
      cursor?: JubelioSyncCursor;
    };
    const startPage = Number(body.startPage) || 1;
    const insertedSoFar = Number(body.insertedSoFar) || 0;

    const batch = await fetchJubelioReadyToShipBatch({
      startPage,
      pageCount: PAGES_PER_BATCH,
      cursor: body.cursor,
    });

    if (startPage === 1) {
      await deleteOrdersByPlatform("jubelio");
      await deleteUploadedFilesByPlatform("jubelio");
    }

    if (batch.orders.length > 0) {
      await insertOrders(batch.orders.map(orderToInput));
    }

    const count = insertedSoFar + batch.orders.length;
    if (batch.done) {
      await insertUploadedFile({
        name: "Jubelio API",
        platform: "jubelio",
        orderCount: count,
      });
    }

    return NextResponse.json({
      success: true,
      done: batch.done,
      count,
      batchCount: batch.orders.length,
      nextPage: batch.nextPage,
      cursor: batch.cursor,
      total: batch.cursor.apiTotal || count,
      locationName: batch.cursor.locationName,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error syncing Jubelio orders:", error);
    return NextResponse.json({ error: publicJubelioError(error) }, { status: 500 });
  }
}
