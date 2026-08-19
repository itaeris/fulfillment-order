import { NextResponse } from "next/server";
import { refreshOpenTikTokStatuses } from "@/lib/tiktok-status";
import { refreshOpenJubelioStatuses } from "@/lib/jubelio-status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const tiktok = await refreshOpenTikTokStatuses().catch((error) => ({
    checked: 0,
    updated: 0,
    error: error instanceof Error ? error.message : "tiktok",
  }));
  const jubelio = await refreshOpenJubelioStatuses().catch((error) => ({
    checked: 0,
    updated: 0,
    error: error instanceof Error ? error.message : "jubelio",
  }));
  return NextResponse.json({ success: true, tiktok, jubelio });
}

export async function POST() {
  return GET();
}
