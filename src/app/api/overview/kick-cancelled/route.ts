import { NextResponse } from "next/server";
import { kickCancelledOrders } from "@/lib/kick-cancelled";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      ids?: string[];
      numbers?: string[];
    };
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const numbers = Array.isArray(body.numbers) ? body.numbers : [];
    const kicked = await kickCancelledOrders({ ids, numbers });
    return NextResponse.json({ ok: true, ...kicked });
  } catch (error) {
    console.error("kick-cancelled:", error);
    return NextResponse.json({ error: "Gagal membuang order cancel" }, { status: 500 });
  }
}
