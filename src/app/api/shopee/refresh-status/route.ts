import { NextResponse } from "next/server";
import { refreshOpenShopeeStatuses } from "@/lib/shopee-status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/belum|SHOPEE_/i.test(message)) {
    return "Shopee belum terhubung di server. Hubungi IT.";
  }
  return "Gagal memperbarui status Shopee.";
}

export async function GET() {
  try {
    const result = await refreshOpenShopeeStatuses();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
