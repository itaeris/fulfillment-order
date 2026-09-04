import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { token } = (await req.json()) as { token?: string };
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const result = await verifyTurnstileToken(token, ip);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Verifikasi gagal. Coba lagi." },
      { status: 400 }
    );
  }
}
