import { NextResponse } from "next/server";
import { getOpenMarketplaceAheadOrders } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orders = await getOpenMarketplaceAheadOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("ahead-orders:", error);
    return NextResponse.json({ error: "Gagal mengambil order packing cicil" }, { status: 500 });
  }
}
