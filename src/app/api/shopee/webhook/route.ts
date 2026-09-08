import crypto from "crypto";
import { NextResponse } from "next/server";
import { applyLiveShopeeStatuses } from "@/lib/shopee-status";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function pushUrlCandidates(request: Request): string[] {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  const withQuery = `${proto}://${host}${url.pathname}${url.search}`;
  const withoutQuery = `${proto}://${host}${url.pathname}`;
  return Array.from(new Set([withQuery, withoutQuery, request.url].filter(Boolean)));
}

function verifyPush(urls: string[], rawBody: string, authorization: string | null): boolean {
  const partnerKey = process.env.SHOPEE_PARTNER_KEY?.trim();
  if (!authorization || !partnerKey) return !authorization;
  return urls.some((url) => {
    const expected = crypto
      .createHmac("sha256", partnerKey)
      .update(`${url}|${rawBody}`)
      .digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

function collectOrderSns(value: unknown, ids: string[]) {
  if (value == null) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length >= 8) ids.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectOrderSns(item, ids);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  for (const key of ["ordersn", "order_sn", "orderSn"]) {
    const raw = obj[key];
    if (typeof raw === "string" && raw.trim().length >= 8) ids.push(raw.trim());
  }
  if ("data" in obj) collectOrderSns(obj.data, ids);
  if ("orders" in obj) collectOrderSns(obj.orders, ids);
}

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const authorization = request.headers.get("authorization");
  if (authorization && !verifyPush(pushUrlCandidates(request), rawBody, authorization)) {
    return new NextResponse(null, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return new NextResponse(null, { status: 200 });
  }

  const ids: string[] = [];
  collectOrderSns(payload, ids);
  const unique = Array.from(new Set(ids));
  if (unique.length > 0) {
    try {
      await applyLiveShopeeStatuses(unique.slice(0, 20));
    } catch (error) {
      console.error("Shopee webhook status update failed:", error);
    }
  }

  return new NextResponse(null, { status: 200 });
}
