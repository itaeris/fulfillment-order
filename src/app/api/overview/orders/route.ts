import { NextRequest, NextResponse } from "next/server";
import {
  clearOverviewData,
  getAllOverviewOrders,
  insertOverviewOrders,
  replaceOverviewOrdersByPlatforms,
} from "@/lib/db";
import { Platform } from "@/types/order";

function serializeForDb(orders: any[]) {
  return orders.map((order: any) => ({
    ...order,
    orderDate: order.orderDate ? new Date(order.orderDate).toISOString() : null,
    paidTime: order.paidTime ? new Date(order.paidTime).toISOString() : null,
    shippedTime: order.shippedTime ? new Date(order.shippedTime).toISOString() : null,
    mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore).toISOString() : null,
    pickupTime: order.pickupTime ? new Date(order.pickupTime).toISOString() : null,
  }));
}

function formatOrders(orders: any[]) {
  return orders.map((order: any) => ({
    ...order,
    orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
    paidTime: order.paidTime ? new Date(order.paidTime) : undefined,
    shippedTime: order.shippedTime ? new Date(order.shippedTime) : undefined,
    mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore) : undefined,
    pickupTime: order.pickupTime ? new Date(order.pickupTime) : undefined,
  }));
}

export async function GET() {
  try {
    const orders = await getAllOverviewOrders();
    return NextResponse.json({ orders: formatOrders(orders) });
  } catch (error) {
    console.error("Error fetching overview orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch overview orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { orders } = await request.json();
    if (!Array.isArray(orders)) {
      return NextResponse.json({ error: "orders harus array" }, { status: 400 });
    }
    await insertOverviewOrders(serializeForDb(orders));
    return NextResponse.json({ success: true, count: orders.length });
  } catch (error) {
    console.error("Error saving overview orders:", error);
    return NextResponse.json(
      { error: "Failed to save overview orders" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { platforms, orders } = await request.json();
    if (!Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json({ error: "platforms wajib" }, { status: 400 });
    }
    const next = await replaceOverviewOrdersByPlatforms(
      platforms as Platform[],
      serializeForDb(Array.isArray(orders) ? orders : [])
    );
    return NextResponse.json({ success: true, orders: formatOrders(next) });
  } catch (error) {
    console.error("Error replacing overview orders:", error);
    return NextResponse.json(
      { error: "Failed to replace overview orders" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearOverviewData();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing overview data:", error);
    return NextResponse.json(
      { error: "Failed to clear overview data" },
      { status: 500 }
    );
  }
}
