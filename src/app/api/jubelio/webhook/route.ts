import { NextResponse } from "next/server";
import { applyJubelioStatusHint, applyLiveJubelioStatuses } from "@/lib/jubelio-status";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KEY_FIELDS = [
  "salesorder_id",
  "salesorder_no",
  "salesorderId",
  "salesorderNo",
  "order_id",
  "orderId",
  "order_number",
  "orderNumber",
  "ref_no",
  "refNo",
  "invoice_no",
  "invoiceNo",
  "id",
];

function authorized(request: Request, rawBody: string): boolean {
  const secret = process.env.JUBELIO_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const header =
    request.headers.get("x-jubelio-token") ||
    request.headers.get("x-webhook-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  const url = new URL(request.url);
  const urlToken =
    url.searchParams.get("secret") ||
    url.searchParams.get("token") ||
    "";
  return header === secret || urlToken === secret || rawBody.includes(secret);
}

function collectKeys(value: unknown, keys: string[]) {
  if (value == null) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    keys.push(String(value));
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      collectKeys(JSON.parse(trimmed), keys);
      return;
    } catch {
      if (trimmed.length >= 3) keys.push(trimmed);
      return;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  for (const field of KEY_FIELDS) {
    const raw = obj[field];
    if (typeof raw === "number" && Number.isFinite(raw)) keys.push(String(raw));
    if (typeof raw === "string" && raw.trim()) keys.push(raw.trim());
  }
  if ("data" in obj) collectKeys(obj.data, keys);
  if ("order" in obj) collectKeys(obj.order, keys);
  if ("salesorder" in obj) collectKeys(obj.salesorder, keys);
}

function findStatus(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const nested = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : obj;
  for (const field of ["channel_status", "status", "sub_status", "wms_status", "order_status"]) {
    const raw = nested[field] ?? obj[field];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return undefined;
}

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

function forwardUrls(): string[] {
  const raw = process.env.JUBELIO_WEBHOOK_FORWARD_URL || "";
  return raw
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.startsWith("http"));
}

async function forwardWebhook(rawBody: string, contentType: string | null) {
  const urls = forwardUrls();
  if (urls.length === 0) return;
  await Promise.allSettled(
    urls.map((url) =>
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": contentType || "application/json",
        },
        body: rawBody,
        cache: "no-store",
      })
    )
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!authorized(request, rawBody)) {
    return new NextResponse(null, { status: 401 });
  }

  const forwarded = forwardWebhook(rawBody, request.headers.get("content-type"));

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    await forwarded.catch(() => undefined);
    return new NextResponse(null, { status: 200 });
  }

  const keys: string[] = [];
  collectKeys(payload, keys);
  const unique = Array.from(new Set(keys)).slice(0, 20);

  try {
    if (unique.length > 0) {
      const updated = await applyLiveJubelioStatuses(unique);
      if (updated === 0) {
        await applyJubelioStatusHint(unique, findStatus(payload));
      }
    }
  } catch (error) {
    console.error("Jubelio webhook status update failed:", error);
  }

  await forwarded.catch((error) => {
    console.error("Jubelio webhook forward failed:", error);
  });

  return new NextResponse(null, { status: 200 });
}
