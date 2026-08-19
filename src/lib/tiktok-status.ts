import { Order } from "@/types/order";
import {
  fetchTikTokOrdersByNumbers,
  getTikTokConfig,
} from "@/lib/tiktok-api";
import {
  getOpenOrderNumbersByPlatforms,
  updateOrdersFulfillment,
} from "@/lib/db";

export const TIKTOK_PLATFORMS = ["tiktok", "tokopedia"];
const OPEN_STATUSES = ["pending", "processing", "shipped"];
const MAX_REFRESH = 400;

export async function applyLiveTikTokStatuses(orderNumbers: string[]): Promise<number> {
  const unique = Array.from(
    new Set(orderNumbers.map((n) => String(n).trim()).filter(Boolean))
  );
  if (unique.length === 0) return 0;

  const config = await getTikTokConfig();
  const live = await fetchTikTokOrdersByNumbers(config, unique);
  const byNumber = new Map<string, Order>();
  for (const order of live) {
    if (!byNumber.has(order.orderNumber)) byNumber.set(order.orderNumber, order);
  }

  const patches = Array.from(byNumber.values()).map((order) => ({
    orderNumber: order.orderNumber,
    platform: order.platform,
    status: order.status,
    trackingNumber: order.trackingNumber,
    courier: order.courier,
    shippingOption: order.shippingOption,
    shippedTime: order.shippedTime ? new Date(order.shippedTime).toISOString() : undefined,
    mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore).toISOString() : undefined,
    pickupTime: order.pickupTime ? new Date(order.pickupTime).toISOString() : undefined,
  }));

  await updateOrdersFulfillment(TIKTOK_PLATFORMS, patches);
  return patches.length;
}

export async function refreshOpenTikTokStatuses(): Promise<{ checked: number; updated: number }> {
  const open = await getOpenOrderNumbersByPlatforms(TIKTOK_PLATFORMS, OPEN_STATUSES);
  const checked = open.slice(0, MAX_REFRESH);
  const updated = await applyLiveTikTokStatuses(checked);
  return { checked: checked.length, updated };
}
