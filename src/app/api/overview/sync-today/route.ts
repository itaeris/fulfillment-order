import { NextResponse } from "next/server";
import { syncOverviewTodayAll, syncOverviewTodaySource } from "@/lib/overview-sync-today";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseSource(value: string | null): "shopee" | "tiktok" | "jubelio" | null {
  if (value === "shopee" || value === "tiktok" || value === "jubelio") return value;
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = parseSource(url.searchParams.get("source"));
  if (source) {
    const result = await syncOverviewTodaySource(source);
    return NextResponse.json({ success: !result.error, ...result });
  }
  const results = await syncOverviewTodayAll();
  return NextResponse.json({ success: true, ...results });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { source?: string };
  const source = parseSource(body.source ?? null);
  if (source) {
    const result = await syncOverviewTodaySource(source);
    return NextResponse.json({ success: !result.error, ...result });
  }
  const results = await syncOverviewTodayAll();
  return NextResponse.json({ success: true, ...results });
}
