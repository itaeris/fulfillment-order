import { NextResponse } from "next/server";
import { refreshOpenTikTokStatuses } from "@/lib/tiktok-status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/belum lengkap|TIKTOK_/i.test(message)) {
    return "TikTok belum terhubung di server. Hubungi IT.";
  }
  return "Gagal memperbarui status TikTok.";
}

export async function GET() {
  try {
    const result = await refreshOpenTikTokStatuses();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
