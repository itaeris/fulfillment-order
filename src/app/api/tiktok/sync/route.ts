import { NextResponse } from "next/server";
import { getTikTokConfig, fetchReadyToShipOrders } from "@/lib/tiktok-api";
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
    const config = await getTikTokConfig();
    const orders = await fetchReadyToShipOrders(config);

    // Sinkronisasi: ganti seluruh order TikTok dengan snapshot "siap dikirim" terbaru
    await deleteOrdersByPlatform("tiktok");
    await deleteOrdersByPlatform("tokopedia");

    if (orders.length > 0) {
      await insertOrders(orders.map(orderToInput));
    }

    // Simpan satu penanda "terakhir sync" saja (tidak menumpuk di daftar file)
    await deleteUploadedFilesByPlatform("tiktok");
    await insertUploadedFile({
      name: "TikTok Shop API",
      platform: "tiktok",
      orderCount: orders.length,
    });

    const uniqueByPlatform = (platform: Order["platform"]) =>
      new Set(orders.filter((o) => o.platform === platform).map((o) => o.orderNumber)).size;

    return NextResponse.json({
      success: true,
      count: orders.length,
      byPlatform: {
        tiktok: uniqueByPlatform("tiktok"),
        tokopedia: uniqueByPlatform("tokopedia"),
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error syncing TikTok orders:", error);
    const message = error instanceof Error ? error.message : "Gagal sinkronisasi TikTok";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
