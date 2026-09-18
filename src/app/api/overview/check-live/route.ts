import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getLiveOrderStatuses } from "@/lib/db";
import { isCancelledStatus } from "@/lib/overdue-scan";
import { applyLiveShopeeStatuses } from "@/lib/shopee-status";
import { applyLiveTikTokStatuses } from "@/lib/tiktok-status";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function lookupNumbers(numbers: string[], platformHint?: string) {
  const shopee = new Set<string>();
  const tiktok = new Set<string>();
  const assign = (number: string, platform?: string) => {
    const value = String(number || "").trim();
    if (!value) return;
    if (platform === "shopee" || platformHint === "shopee") shopee.add(value);
    else if (platform === "tiktok" || platform === "tokopedia" || platformHint === "tiktok" || platformHint === "tokopedia") {
      tiktok.add(value);
    }
  };

  const [fromOrders, fromOverview] = await Promise.all([
    supabase.from("orders").select("order_number, platform").in("order_number", numbers),
    supabase.from("overview_orders").select("order_number, platform").in("order_number", numbers),
  ]);
  if (fromOrders.error) throw fromOrders.error;
  if (fromOverview.error) throw fromOverview.error;

  for (const row of [...(fromOrders.data ?? []), ...(fromOverview.data ?? [])]) {
    assign(String(row.order_number || ""), String(row.platform || ""));
  }
  for (const number of numbers) {
    if (shopee.has(number) || tiktok.has(number)) continue;
    if (platformHint === "shopee") shopee.add(number);
    else if (platformHint === "tiktok" || platformHint === "tokopedia") tiktok.add(number);
    else if (/^\d{10,}$/.test(number)) tiktok.add(number);
    else shopee.add(number);
  }
  return { shopee: Array.from(shopee), tiktok: Array.from(tiktok) };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      numbers?: string[];
      platform?: string;
    };
    const numbers = Array.from(
      new Set((Array.isArray(body.numbers) ? body.numbers : []).map((value) => String(value || "").trim()).filter(Boolean))
    );
    if (numbers.length === 0) {
      return NextResponse.json({ patches: [], cancelled: [] });
    }

    const CHUNK = 40;
    for (let i = 0; i < numbers.length; i += CHUNK) {
      const chunk = numbers.slice(i, i + CHUNK);
      const grouped = await lookupNumbers(chunk, body.platform);
      if (grouped.shopee.length > 0) {
        await applyLiveShopeeStatuses(grouped.shopee).catch((error) => {
          console.error("check-live shopee:", error);
        });
      }
      if (grouped.tiktok.length > 0) {
        await applyLiveTikTokStatuses(grouped.tiktok).catch((error) => {
          console.error("check-live tiktok:", error);
        });
      }
    }

    const patches = await getLiveOrderStatuses(numbers);
    const cancelled = patches.filter((patch) => isCancelledStatus(patch.status));
    return NextResponse.json({ patches, cancelled });
  } catch (error) {
    console.error("check-live:", error);
    return NextResponse.json({ patches: [], cancelled: [] });
  }
}
