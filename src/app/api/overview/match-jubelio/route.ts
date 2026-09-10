import { NextResponse } from "next/server";
import { backfillJubelioMirrors } from "@/lib/overview-sync-today";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const result = await backfillJubelioMirrors(80);
  return NextResponse.json({ success: true, ...result });
}

export async function POST() {
  return GET();
}
