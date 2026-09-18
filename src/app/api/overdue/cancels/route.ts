import { NextRequest, NextResponse } from "next/server";
import { dismissCancelAlert, getCancelAlerts, syncTodayCancelLog, upsertCancelAlert } from "@/lib/db";
import { cancelAlertMatchKey, canonicalizeCancelNumber } from "@/lib/live-cancel";
import { isTrackingLikeCode } from "@/lib/order-match";
import {
  describeCancelReason,
  fallbackCancelReason,
  lookupCancelReasons,
  type CancelAlertSource,
} from "@/lib/cancel-reason";
import { warehouseTodayKey } from "@/lib/timezone";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function asSource(value?: string): CancelAlertSource {
  if (value === "scan" || value === "queue") return value;
  return "live";
}

function toClient(row: Awaited<ReturnType<typeof upsertCancelAlert>>) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    platform: row.platform,
    source: row.source,
    reason: row.reason,
    reasonCode: row.reasonCode,
    at: row.cancelledAt.toISOString(),
    dismissed: row.dismissed,
  };
}

export async function GET(request: NextRequest) {
  try {
    const today = warehouseTodayKey();
    const scanDate = request.nextUrl.searchParams.get("date") || today;
    const alerts = scanDate === today ? await syncTodayCancelLog() : await getCancelAlerts(scanDate);
    return NextResponse.json({ scanDate, alerts: alerts.map(toClient) });
  } catch (error) {
    console.error("cancel-alerts GET:", error);
    return NextResponse.json({ error: "Gagal mengambil notifikasi cancel" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      orderNumber?: string;
      platform?: string;
      source?: string;
      reason?: string;
      alerts?: { orderNumber?: string; platform?: string; source?: string; reason?: string }[];
    };
    const incoming = Array.isArray(body.alerts) && body.alerts.length > 0
      ? body.alerts
      : [{ orderNumber: body.orderNumber, platform: body.platform, source: body.source, reason: body.reason }];
    const items = incoming
      .map((item) => {
        const orderNumber = canonicalizeCancelNumber(String(item.orderNumber || "").trim());
        let platform = String(item.platform || "").trim() || undefined;
        if (platform === "jubelio") platform = /^\d{10,}$/.test(orderNumber) ? "tiktok" : "shopee";
        return {
          orderNumber,
          platform,
          source: asSource(item.source),
          reason: String(item.reason || "").trim() || undefined,
        };
      })
      .filter((item) => item.orderNumber && !isTrackingLikeCode(item.orderNumber));
    if (items.length === 0) {
      return NextResponse.json({ error: "Nomor pesanan kosong" }, { status: 400 });
    }

    const scanDate = warehouseTodayKey();
    const alerts = [];
    for (const item of items) {
      const saved = await upsertCancelAlert({
        id: `${scanDate}:${cancelAlertMatchKey(item.orderNumber)}`,
        orderNumber: item.orderNumber,
        platform: item.platform,
        source: item.source,
        reason:
          item.reason ||
          describeCancelReason({ source: item.source, platform: item.platform }) ||
          fallbackCancelReason(item.source, item.platform),
        matchKey: cancelAlertMatchKey(item.orderNumber),
        scanDate,
      });
      alerts.push(toClient(saved));
    }

    const notes = await lookupCancelReasons(items).catch(() => new Map());
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const note = notes.get(cancelAlertMatchKey(item.orderNumber));
      if (!note?.reason) continue;
      const saved = await upsertCancelAlert({
        id: `${scanDate}:${cancelAlertMatchKey(item.orderNumber)}`,
        orderNumber: item.orderNumber,
        platform: item.platform,
        source: item.source,
        reason: note.reason,
        reasonCode: note.reasonCode,
        matchKey: cancelAlertMatchKey(item.orderNumber),
        scanDate,
      });
      alerts[i] = toClient(saved);
    }
    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("cancel-alerts POST:", error);
    return NextResponse.json({ error: "Gagal menyimpan notifikasi cancel" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string; orderNumber?: string };
    const id = String(body.id || "").trim();
    const orderNumber = String(body.orderNumber || "").trim();
    if (!id && !orderNumber) return NextResponse.json({ error: "ID kosong" }, { status: 400 });
    const row = await dismissCancelAlert(id, orderNumber);
    return NextResponse.json({ alert: row ? toClient(row) : null });
  } catch (error) {
    console.error("cancel-alerts PATCH:", error);
    return NextResponse.json({ error: "Gagal menutup notifikasi cancel" }, { status: 500 });
  }
}
