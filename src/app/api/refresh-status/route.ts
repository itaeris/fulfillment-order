import { NextResponse } from "next/server";
import { refreshOpenTikTokStatuses } from "@/lib/tiktok-status";
import { refreshOpenShopeeStatuses } from "@/lib/shopee-status";
import { refreshOpenJubelioStatuses } from "@/lib/jubelio-status";
import { toIndonesianError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 40_000;

export async function GET() {
  const started = Date.now();
  let tiktokOffset = 0;
  const tiktok = {
    checked: 0,
    updated: 0,
    done: false,
    total: 0,
    error: undefined as string | undefined,
  };

  try {
    while (Date.now() - started < BUDGET_MS) {
      const part = await refreshOpenTikTokStatuses({ limit: 50, offset: tiktokOffset });
      tiktok.checked += part.checked;
      tiktok.updated += part.updated;
      tiktok.total = part.total;
      tiktok.done = part.done;
      if (part.done || part.checked === 0) break;
      tiktokOffset = part.nextOffset;
    }
  } catch (error) {
    tiktok.error = toIndonesianError(
      error instanceof Error ? error.message : null,
      "Gagal memperbarui status TikTok"
    );
  }

  const remainingAfterTiktok = BUDGET_MS - (Date.now() - started);
  let shopeeOffset = 0;
  const shopee = {
    checked: 0,
    updated: 0,
    done: false,
    total: 0,
    error: undefined as string | undefined,
    skipped: remainingAfterTiktok <= 10_000,
  };
  if (!shopee.skipped) {
    try {
      while (Date.now() - started < BUDGET_MS - 8_000) {
        const part = await refreshOpenShopeeStatuses({ limit: 40, offset: shopeeOffset });
        shopee.checked += part.checked;
        shopee.updated += part.updated;
        shopee.total = part.total;
        shopee.done = part.done;
        if (part.done || part.checked === 0) break;
        shopeeOffset = part.nextOffset;
      }
    } catch (error) {
      shopee.error = toIndonesianError(
        error instanceof Error ? error.message : null,
        "Gagal memperbarui status Shopee"
      );
    }
  }

  const remaining = BUDGET_MS - (Date.now() - started);
  const jubelio =
    remaining > 8_000
      ? await refreshOpenJubelioStatuses().catch((error) => ({
          checked: 0,
          updated: 0,
          error: toIndonesianError(
            error instanceof Error ? error.message : null,
            "Gagal memperbarui status Jubelio"
          ),
        }))
      : { checked: 0, updated: 0, skipped: true };

  return NextResponse.json({ success: true, tiktok, shopee, jubelio });
}

export async function POST() {
  return GET();
}
