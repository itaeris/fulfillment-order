import { NextResponse } from "next/server";
import { countMarketplacePlacedToday } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const placed = await countMarketplacePlacedToday();
    return NextResponse.json(placed);
  } catch (error) {
    console.error("placed-today:", error);
    return NextResponse.json({ error: "Gagal menghitung order hari ini" }, { status: 500 });
  }
}
