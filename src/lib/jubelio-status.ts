import { Order } from "@/types/order";
import {
  fetchJubelioOrdersByKeys,
  fetchJubelioOrdersMatching,
  mapJubelioStatusLabel,
} from "@/lib/jubelio-api";
import {
  getOpenOrderNumbersByPlatforms,
  updateOrdersFulfillment,
} from "@/lib/db";

const JUBELIO_PLATFORMS = ["jubelio"];
const OPEN_STATUSES = ["pending", "processing", "shipped"];
const MAX_REFRESH = 150;
const MAX_LOOKUP = 25;

function toPatches(orders: Order[]) {
  const byNumber = new Map<string, Order>();
  for (const order of orders) {
    if (!byNumber.has(order.orderNumber)) byNumber.set(order.orderNumber, order);
  }
  return Array.from(byNumber.values()).map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    platform: "jubelio",
    status: order.status,
    trackingNumber: order.trackingNumber,
    courier: order.courier,
    shippingOption: order.shippingOption,
    shippedTime: order.shippedTime ? new Date(order.shippedTime).toISOString() : undefined,
    mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore).toISOString() : undefined,
    pickupTime: order.pickupTime ? new Date(order.pickupTime).toISOString() : undefined,
    refNo: order.refNo,
  }));
}

export async function applyLiveJubelioStatuses(keys: string[]): Promise<number> {
  const unique = Array.from(new Set(keys.map((key) => String(key).trim()).filter(Boolean)));
  if (unique.length === 0) return 0;
  const live = await fetchJubelioOrdersByKeys(unique.slice(0, MAX_LOOKUP));
  const patches = toPatches(live);
  await updateOrdersFulfillment(JUBELIO_PLATFORMS, patches);
  return patches.length;
}

export async function applyJubelioStatusHint(keys: string[], statusRaw?: string): Promise<number> {
  if (!statusRaw || keys.length === 0) return 0;
  const status = mapJubelioStatusLabel(statusRaw);
  const unique = Array.from(new Set(keys.map((key) => String(key).trim()).filter(Boolean)));
  await updateOrdersFulfillment(
    JUBELIO_PLATFORMS,
    unique.map((orderNumber) => ({ orderNumber, platform: "jubelio", status }))
  );
  return unique.length;
}

export async function refreshOpenJubelioStatuses(): Promise<{ checked: number; updated: number }> {
  const open = await getOpenOrderNumbersByPlatforms(JUBELIO_PLATFORMS, OPEN_STATUSES);
  const checked = open.slice(0, MAX_REFRESH);
  if (checked.length === 0) return { checked: 0, updated: 0 };

  const stillReady = await fetchJubelioOrdersMatching(checked);
  const readyKeys = new Set(
    stillReady.flatMap((order) => [order.orderNumber, order.refNo, String(order.id).replace(/^jubelio-/i, "")])
      .map((value) => String(value || "").replace(/[\s\-_.#]+/g, "").toUpperCase())
      .filter(Boolean)
  );
  const leftover = checked.filter((number) => {
    const key = String(number).replace(/[\s\-_.#]+/g, "").toUpperCase();
    return key && !readyKeys.has(key);
  });

  const lookedUp = leftover.length > 0 ? await fetchJubelioOrdersByKeys(leftover.slice(0, MAX_LOOKUP)) : [];
  const patches = toPatches([...stillReady, ...lookedUp]);
  await updateOrdersFulfillment(JUBELIO_PLATFORMS, patches);
  return { checked: checked.length, updated: patches.length };
}
