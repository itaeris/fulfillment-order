import { NextResponse } from "next/server";
import { insertOrders, searchOrdersByNumber, updateOrdersFulfillment } from "@/lib/db";
import { hydrateOrders } from "@/lib/client-data";
import { fetchShopeeOrdersByNumbers, getShopeeConfig } from "@/lib/shopee-api";
import { fetchTikTokOrdersByNumbers, getTikTokConfig } from "@/lib/tiktok-api";
import { lookupMatchKeys } from "@/lib/order-match";
import { Order } from "@/types/order";

export const dynamic = "force-dynamic";

function looksLikeOrderNumber(value: string) {
  const compact = value.replace(/[\s\-_.#]+/g, "");
  return compact.length >= 8 && /[A-Za-z0-9]{8,}/.test(compact);
}

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json({ orders: [], source: "none" });
    }

    const local = await searchOrdersByNumber(q);
    const fast = url.searchParams.get("fast") === "1";
    if (!looksLikeOrderNumber(q) || (fast && local.length > 0)) {
      return NextResponse.json({
        orders: hydrateOrders(local),
        source: local.length > 0 ? "db" : "none",
      });
    }

    const sns = lookupMatchKeys(q).filter((key) => /^\d{6,}[A-Z0-9]*$/i.test(key)).slice(0, 3);
    const number = sns[0] || q.replace(/[\s\-_.#]+/g, "").replace(/^SP/i, "");
    let remote: Order[] = [];
    let source: "db" | "shopee" | "tiktok" | "none" = local.length > 0 ? "db" : "none";

    try {
      const config = await getShopeeConfig();
      remote = await fetchShopeeOrdersByNumbers(config, sns.length > 0 ? sns : [number]);
      if (remote.length > 0) source = "shopee";
    } catch {
      remote = [];
    }

    if (remote.length === 0) {
      try {
        const config = await getTikTokConfig();
        remote = await fetchTikTokOrdersByNumbers(config, [number]);
        if (remote.length > 0) source = "tiktok";
      } catch {
        remote = [];
      }
    }

    if (remote.length > 0) {
      const platforms =
        source === "tiktok" ? ["tiktok", "tokopedia"] : [remote[0].platform || "shopee"];
      await updateOrdersFulfillment(
        platforms,
        remote.map((order) => ({
          orderNumber: order.orderNumber,
          platform: order.platform,
          status: order.status,
          trackingNumber: order.trackingNumber,
          courier: order.courier,
          shippingOption: order.shippingOption,
          shippedTime: order.shippedTime ? new Date(order.shippedTime).toISOString() : undefined,
          mustShipBefore: order.mustShipBefore
            ? new Date(order.mustShipBefore).toISOString()
            : undefined,
          pickupTime: order.pickupTime ? new Date(order.pickupTime).toISOString() : undefined,
        }))
      ).catch(() => {});

      if (local.length === 0) {
        await insertOrders(remote.map(toInput)).catch(() => {});
        return NextResponse.json({ orders: hydrateOrders(remote), source });
      }

      const live = remote[0];
      const merged = local.map((order) => ({
        ...order,
        status: live.status,
        trackingNumber: live.trackingNumber || order.trackingNumber,
        courier: live.courier || order.courier,
        shippingOption: live.shippingOption || order.shippingOption,
        shippedTime: live.shippedTime || order.shippedTime,
        mustShipBefore: live.mustShipBefore || order.mustShipBefore,
        pickupTime: live.pickupTime || order.pickupTime,
      }));
      return NextResponse.json({ orders: hydrateOrders(merged), source });
    }

    return NextResponse.json({
      orders: hydrateOrders(local),
      source: local.length > 0 ? "db" : "none",
    });
  } catch (error) {
    console.error("orders-lookup:", error);
    return NextResponse.json({ error: "Gagal mencari pesanan" }, { status: 500 });
  }
}
