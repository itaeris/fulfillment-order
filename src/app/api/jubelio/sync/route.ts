import { NextResponse } from "next/server";
import { fetchJubelioReadyToShipOrders } from "@/lib/jubelio-api";
import {
  deleteOrdersByPlatform,
  insertOrders,
  insertUploadedFile,
  deleteUploadedFilesByPlatform,
} from "@/lib/db";
import { Order } from "@/types/order";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

export async function POST() {
  try {
    const { orders, meta } = await fetchJubelioReadyToShipOrders();

    await deleteOrdersByPlatform("jubelio");

    if (orders.length > 0) {
      await insertOrders(orders.map(orderToInput));
    }

    await deleteUploadedFilesByPlatform("jubelio");
    await insertUploadedFile({
      name: "Jubelio API",
      platform: "jubelio",
      orderCount: orders.length,
    });

    return NextResponse.json({
      success: true,
      count: orders.length,
      source: meta.source,
      apiTotal: meta.apiTotal,
      locationName: meta.locationName,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error syncing Jubelio orders:", error);
    const message = error instanceof Error ? error.message : "Gagal sinkronisasi Jubelio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
