import { NextResponse } from "next/server";
import { maintainTikTokTokens } from "@/lib/tiktok-auth";
import { toIndonesianError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await maintainTikTokTokens();
    return NextResponse.json(status);
  } catch (error) {
    const message = toIndonesianError(
      error instanceof Error ? error.message : null,
      "Gagal cek token TikTok"
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
