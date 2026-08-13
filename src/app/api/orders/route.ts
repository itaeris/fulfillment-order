import { NextRequest, NextResponse } from "next/server";
import {
  getAllOrders,
  insertOrders,
  deleteAllOrders,
} from "@/lib/db";

export async function GET() {
  try {
    const orders = getAllOrders();
    
    // Convert date strings back to proper format for frontend
    const formattedOrders = orders.map((order: any) => ({
      ...order,
      orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
      paidTime: order.paidTime ? new Date(order.paidTime) : undefined,
      shippedTime: order.shippedTime ? new Date(order.shippedTime) : undefined,
      mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore) : undefined,
    }));
    
    return NextResponse.json({ orders: formattedOrders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { orders } = await request.json();
    
    // Convert Date objects to ISO strings for SQLite
    const ordersForDb = orders.map((order: any) => ({
      ...order,
      orderDate: order.orderDate ? new Date(order.orderDate).toISOString() : null,
      paidTime: order.paidTime ? new Date(order.paidTime).toISOString() : null,
      shippedTime: order.shippedTime ? new Date(order.shippedTime).toISOString() : null,
      mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore).toISOString() : null,
    }));
    
    insertOrders(ordersForDb);
    
    return NextResponse.json({ success: true, count: orders.length });
  } catch (error) {
    console.error("Error saving orders:", error);
    return NextResponse.json(
      { error: "Failed to save orders" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    deleteAllOrders();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting orders:", error);
    return NextResponse.json(
      { error: "Failed to delete orders" },
      { status: 500 }
    );
  }
}
