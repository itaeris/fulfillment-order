import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const siteKey = String(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || ""
  ).trim();
  return NextResponse.json({ siteKey, enabled: Boolean(siteKey) });
}
