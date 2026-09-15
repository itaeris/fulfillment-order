import { NextResponse } from "next/server";
import { syncDashboardSource, type DashboardSyncSource } from "@/lib/dashboard-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseSource(value: string | null): DashboardSyncSource | null {
  if (value === "shopee" || value === "tiktok" || value === "jubelio") return value;
  return null;
}

function cronSlot(): DashboardSyncSource {
  const slot = Math.floor(Date.now() / (5 * 60 * 1000)) % 3;
  return (["shopee", "tiktok", "jubelio"] as const)[slot];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = parseSource(url.searchParams.get("source")) || cronSlot();
  const result = await syncDashboardSource(source);
  return NextResponse.json({ success: !result.error, slot: source, ...result });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { source?: string };
  const source = parseSource(body.source ?? null) || cronSlot();
  const result = await syncDashboardSource(source);
  return NextResponse.json({ success: !result.error, slot: source, ...result });
}
