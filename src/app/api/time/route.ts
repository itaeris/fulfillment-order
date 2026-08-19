import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GOOGLE_TIME_URLS = ["https://time.google.com", "https://www.google.com"];

async function readGoogleDate(url: string): Promise<Date | null> {
  const res = await fetch(url, {
    method: "HEAD",
    cache: "no-store",
    redirect: "follow",
  });
  const header = res.headers.get("date");
  if (!header) return null;
  const parsed = new Date(header);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET() {
  for (const url of GOOGLE_TIME_URLS) {
    try {
      const at = await readGoogleDate(url);
      if (at) {
        return NextResponse.json({
          at: at.toISOString(),
          source: "google",
        });
      }
    } catch {
      // Coba host Google berikutnya.
    }
  }

  const fallback = new Date();
  return NextResponse.json({
    at: fallback.toISOString(),
    source: "local",
  });
}
