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
const DEFAULT_LIMIT = 80;

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

export async function refreshOpenTikTokStatuses(options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  checked: number;
  updated: number;
  offset: number;
  nextOffset: number;
  done: boolean;
  total: number;
}> {
  const open = await getOpenOrderNumbersByPlatforms(TIKTOK_PLATFORMS, OPEN_STATUSES);
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), 120);
  const checked = open.slice(offset, offset + limit);
  const updated = checked.length > 0 ? await applyLiveTikTokStatuses(checked) : 0;
  const nextOffset = offset + checked.length;
  return {
    checked: checked.length,
    updated,
    offset,
    nextOffset,
    done: nextOffset >= open.length,
    total: open.length,
  };
}
