import { NextRequest, NextResponse } from "next/server";

/**
 * TikTok Partner Center sering set Redirect URL ke origin ( / ),
 * bukan /api/tiktok/callback. Teruskan code ke handler token.
 */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/") return NextResponse.next();
  if (searchParams.has("tiktok")) return NextResponse.next();

  const code = searchParams.get("code") || searchParams.get("auth_code");
  if (!code) return NextResponse.next();

  const looksLikeTikTok =
    searchParams.has("app_key") ||
    code.startsWith("ROW_") ||
    searchParams.has("shop_cipher");

  if (!looksLikeTikTok) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/api/tiktok/callback";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: "/",
};
