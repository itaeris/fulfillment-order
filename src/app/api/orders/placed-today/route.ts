import { NextResponse } from "next/server";
import { countMarketplacePlacedToday, listMarketplacePlacedToday } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("list") === "1") {
      const data = await listMarketplacePlacedToday();
      return NextResponse.json(data);
    }
    const placed = await countMarketplacePlacedToday();
    return NextResponse.json(placed);
  } catch (error) {
    console.error("placed-today:", error);
    return NextResponse.json({ error: "Gagal menghitung order hari ini" }, { status: 500 });
  }
}
