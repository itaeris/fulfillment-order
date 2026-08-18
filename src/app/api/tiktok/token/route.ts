import { NextResponse } from "next/server";
import { maintainTikTokTokens } from "@/lib/tiktok-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await maintainTikTokTokens();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal cek token TikTok";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
