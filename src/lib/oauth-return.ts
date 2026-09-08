import { NextRequest, NextResponse } from "next/server";

const COOKIE = "oauth_return";
const ALLOWED = new Set(["/overview-duedate"]);

export function oauthReturnFromRequest(req: NextRequest): string | undefined {
  const next = req.nextUrl.searchParams.get("next");
  return next && ALLOWED.has(next) ? next : undefined;
}

export function attachOauthReturnCookie(
  res: NextResponse,
  origin: string,
  next?: string
): NextResponse {
  if (!next) return res;
  res.cookies.set(COOKIE, next, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    maxAge: 10 * 60,
    path: "/",
  });
  return res;
}

export function consumeOauthReturn(req: NextRequest): string | undefined {
  const next = req.cookies.get(COOKIE)?.value;
  return next && ALLOWED.has(next) ? next : undefined;
}

export function redirectAfterOauth(
  origin: string,
  params: Record<string, string>,
  returnPath?: string
): NextResponse {
  const url = new URL(returnPath || "/", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = NextResponse.redirect(url);
  res.cookies.delete(COOKIE);
  return res;
}
