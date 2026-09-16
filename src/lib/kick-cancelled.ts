import {
  deleteOverviewOrdersByIds,
  deleteOverviewOrdersByNumbers,
  markOverdueScansCancelled,
  updateOrdersFulfillment,
} from "@/lib/db";
import { indonesiaDateKey } from "@/lib/timezone";

const KICK_PLATFORMS = ["shopee", "tiktok", "tokopedia", "jubelio"];

export async function kickCancelledOrders(input: { ids?: string[]; numbers?: string[] }) {
  const ids = Array.from(new Set((input.ids || []).map((value) => String(value || "").trim()).filter(Boolean)));
  const numbers = Array.from(
    new Set((input.numbers || []).map((value) => String(value || "").trim()).filter(Boolean))
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
  await markOverdueScansCancelled({
    scanDate: indonesiaDateKey(),
    ids,
    numbers,
  });

  return { ids, numbers };
}
