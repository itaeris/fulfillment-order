import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthorizeUrl, getCallbackUrl, getRequestOrigin } from "@/lib/tiktok-auth";
import { toIndonesianError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const origin = getRequestOrigin(req);
    const state = crypto.randomBytes(16).toString("hex");
    const authorizeUrl = getAuthorizeUrl(state, getCallbackUrl(origin));

    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set("tiktok_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      maxAge: 10 * 60,
      path: "/",
    });
    return res;
  } catch (error) {
    const message = toIndonesianError(
      error instanceof Error ? error.message : null,
      "Gagal memulai authorize TikTok"
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
