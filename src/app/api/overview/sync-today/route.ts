import { NextResponse } from "next/server";
import {
  backfillJubelioMirrors,
  syncOverviewTodayAll,
  syncOverviewTodaySource,
} from "@/lib/overview-sync-today";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseSource(value: string | null): "shopee" | "tiktok" | "jubelio" | null {
  if (value === "shopee" || value === "tiktok" || value === "jubelio") return value;
  return null;
}

function cronSlot(): "shopee" | "tiktok" | "jubelio" | "mirror" {
  const slot = Math.floor(Date.now() / (5 * 60 * 1000)) % 4;
  if (slot === 3) return "mirror";
  return (["shopee", "tiktok", "jubelio"] as const)[slot];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = parseSource(url.searchParams.get("source"));
  if (source) {
    const result = await syncOverviewTodaySource(source);
    return NextResponse.json({ success: !result.error, ...result });
  }

  // Cron Vercel sering cap 30s — satu pekerjaan per tick, bukan 3 platform sekaligus.
  const slot = cronSlot();
  if (slot === "mirror") {
    const mirror = await backfillJubelioMirrors(12);
    return NextResponse.json({ success: true, slot, mirror });
  }
  const result = await syncOverviewTodaySource(slot);
  return NextResponse.json({ success: !result.error, slot, ...result });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { source?: string };
  const source = parseSource(body.source ?? null);
  if (source) {
    const result = await syncOverviewTodaySource(source);
    return NextResponse.json({ success: !result.error, ...result });
  }
  const results = await syncOverviewTodayAll(22_000);
  return NextResponse.json({ success: true, ...results });
}
