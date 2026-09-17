import { NextRequest, NextResponse } from "next/server";
import { dismissCancelAlert, getCancelAlerts, upsertCancelAlert } from "@/lib/db";
import { cancelAlertMatchKey } from "@/lib/live-cancel";
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
    const scanDate = request.nextUrl.searchParams.get("date") || warehouseTodayKey();
    const alerts = await getCancelAlerts(scanDate);
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
      .map((item) => ({
        orderNumber: String(item.orderNumber || "").trim(),
        platform: String(item.platform || "").trim() || undefined,
        source: asSource(item.source),
        reason: String(item.reason || "").trim() || undefined,
      }))
      .filter((item) => item.orderNumber);
    if (items.length === 0) {
      return NextResponse.json({ error: "Nomor pesanan kosong" }, { status: 400 });
    }

    const notes = await lookupCancelReasons(items).catch(() => new Map());
    const scanDate = warehouseTodayKey();
    const alerts = [];
    for (const item of items) {
      const note = notes.get(cancelAlertMatchKey(item.orderNumber));
      const reason =
        note?.reason ||
        item.reason ||
        describeCancelReason({ source: item.source, platform: item.platform }) ||
        fallbackCancelReason(item.source, item.platform);
      const saved = await upsertCancelAlert({
        id: `${scanDate}:${cancelAlertMatchKey(item.orderNumber)}`,
        orderNumber: item.orderNumber,
        platform: item.platform,
        source: item.source,
        reason,
        reasonCode: note?.reasonCode,
        matchKey: cancelAlertMatchKey(item.orderNumber),
        scanDate,
      });
      alerts.push(toClient(saved));
    }
    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("cancel-alerts POST:", error);
    return NextResponse.json({ error: "Gagal menyimpan notifikasi cancel" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "ID kosong" }, { status: 400 });
    const row = await dismissCancelAlert(id);
    return NextResponse.json({ alert: row ? toClient(row) : null });
  } catch (error) {
    console.error("cancel-alerts PATCH:", error);
    return NextResponse.json({ error: "Gagal menutup notifikasi cancel" }, { status: 500 });
  }
}
