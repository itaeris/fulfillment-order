import {
  deleteOverviewOrdersByIds,
  deleteOverviewOrdersByNumbers,
  insertCancelAlertIfMissing,
  markOverdueScansCancelled,
  updateOrdersFulfillment,
} from "@/lib/db";
import { fallbackCancelReason } from "@/lib/cancel-reason";
import { cancelAlertMatchKey, canonicalizeCancelNumber } from "@/lib/live-cancel";
import { isTrackingLikeCode } from "@/lib/order-match";
import { warehouseTodayKey } from "@/lib/timezone";

const KICK_PLATFORMS = ["shopee", "tiktok", "tokopedia", "jubelio"];

export async function kickCancelledOrders(input: { ids?: string[]; numbers?: string[] }) {
  const ids = Array.from(new Set((input.ids || []).map((value) => String(value || "").trim()).filter(Boolean)));
  const numbers = Array.from(
    new Set((input.numbers || []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  const cancelNumbers = Array.from(
    new Set(
      numbers
        .map((value) => canonicalizeCancelNumber(value))
        .filter((orderNumber) => orderNumber && !isTrackingLikeCode(orderNumber))
    )
  );
  if (ids.length === 0 && numbers.length === 0) {
    return { ids, numbers };
  }

  if (numbers.length > 0) {
    await updateOrdersFulfillment(
      KICK_PLATFORMS,
      numbers.map((orderNumber) => ({ orderNumber, status: "cancelled" }))
    );
  }

  if (ids.length > 0) await deleteOverviewOrdersByIds(ids);
  if (numbers.length > 0) await deleteOverviewOrdersByNumbers(numbers);
  const scanDate = warehouseTodayKey();
  await markOverdueScansCancelled({
    scanDate,
    ids,
    numbers,
  });
  for (const orderNumber of cancelNumbers) {
    try {
      await insertCancelAlertIfMissing({
        orderNumber,
        source: "live",
        reason: fallbackCancelReason("live", /^\d{10,}$/.test(orderNumber) ? "tiktok" : "shopee"),
        matchKey: cancelAlertMatchKey(orderNumber),
        scanDate,
        platform: /^\d{10,}$/.test(orderNumber) ? "tiktok" : "shopee",
      });
    } catch (error) {
      console.error("cancel-alerts persist:", error);
    }
  }

  return { ids, numbers };
}
