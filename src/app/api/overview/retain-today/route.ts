import { NextResponse } from "next/server";
import { retainOverviewTodayPickedUp } from "@/lib/overview-sync-today";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await retainOverviewTodayPickedUp();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("retain today queue:", error);
    return NextResponse.json({ ok: false, added: 0 }, { status: 500 });
  }
}
