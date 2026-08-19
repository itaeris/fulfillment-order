import { NextResponse } from "next/server";
import { getLiveOrderStatuses } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { numbers?: string[] };
  const numbers = Array.isArray(body.numbers) ? body.numbers.slice(0, 400) : [];
  if (numbers.length === 0) {
    return NextResponse.json({ patches: [] });
  }
  try {
    const patches = await getLiveOrderStatuses(numbers);
    return NextResponse.json({ patches });
  } catch (error) {
    console.error("overview live-status:", error);
    return NextResponse.json({ patches: [] });
  }
}
