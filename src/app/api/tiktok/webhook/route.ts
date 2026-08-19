import crypto from "crypto";
import { NextResponse } from "next/server";
import { applyLiveTikTokStatuses } from "@/lib/tiktok-status";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function verifySignature(rawBody: string, authorization: string | null): boolean {
  const appKey = process.env.TIKTOK_APP_KEY || "";
  const appSecret = process.env.TIKTOK_APP_SECRET || "";
  if (!authorization || !appKey || !appSecret) return false;
  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(appKey + rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
  } catch {
    return false;
  }
}

function collectOrderIds(value: unknown, ids: string[]) {
  if (value == null) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{10,}$/.test(trimmed)) {
      ids.push(trimmed);
      return;
    }
    try {
      collectOrderIds(JSON.parse(trimmed), ids);
    } catch {
      return;
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectOrderIds(item, ids);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  for (const key of ["order_id", "orderId", "id"]) {
    const raw = obj[key];
    if (typeof raw === "string" && /^\d{10,}$/.test(raw)) ids.push(raw);
  }
  if ("data" in obj) collectOrderIds(obj.data, ids);
  if ("orders" in obj) collectOrderIds(obj.orders, ids);
}

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const authorization = request.headers.get("authorization");
  if (authorization && !verifySignature(rawBody, authorization)) {
    return new NextResponse(null, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return new NextResponse(null, { status: 200 });
  }

  const ids: string[] = [];
  collectOrderIds(payload, ids);
  const unique = Array.from(new Set(ids));
  if (unique.length > 0) {
    try {
      await applyLiveTikTokStatuses(unique);
    } catch (error) {
      console.error("TikTok webhook status update failed:", error);
    }
  }

  return new NextResponse(null, { status: 200 });
}
