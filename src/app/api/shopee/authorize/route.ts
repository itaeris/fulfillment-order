import { NextRequest, NextResponse } from "next/server";
import { getAuthorizeUrl, getCallbackUrl, getRequestOrigin } from "@/lib/shopee-auth";
import { attachOauthReturnCookie, oauthReturnFromRequest } from "@/lib/oauth-return";
import { toIndonesianError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const origin = getRequestOrigin(req);
    const authorizeUrl = getAuthorizeUrl(getCallbackUrl(origin));
    const res = NextResponse.redirect(authorizeUrl);
    return attachOauthReturnCookie(res, origin, oauthReturnFromRequest(req));
  } catch (error) {
    const message = toIndonesianError(
      error instanceof Error ? error.message : null,
      "Gagal memulai otorisasi Shopee"
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
