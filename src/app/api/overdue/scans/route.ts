import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  findMatchedOverdueScan,
  getOverdueScans,
  insertOverdueScan,
  updateOverdueScanResult,
} from "@/lib/db";
import type { OverdueScanStatus } from "@/lib/overdue-scan";
import { indonesiaDateKey } from "@/lib/timezone";

export async function GET(request: NextRequest) {
  try {
    const scanDate = request.nextUrl.searchParams.get("date") || indonesiaDateKey();
    const scans = await getOverdueScans(scanDate);
    return NextResponse.json({ scanDate, scans });
  } catch (error) {
    console.error("Error fetching overdue scans:", error);
    return NextResponse.json({ error: "Gagal mengambil data scan" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      code?: string;
      scannedBy?: string;
      id?: string;
      orderId?: string;
      orderNumber?: string;
      platform?: string;
      result?: OverdueScanStatus;
    };
    const code = String(body.code || "").trim();
    if (!code) {
      return NextResponse.json({ error: "Kode scan kosong" }, { status: 400 });
    }

    const scanDate = indonesiaDateKey();
    const orderId = String(body.orderId || "").trim() || undefined;
    const result: Exclude<OverdueScanStatus, "duplicate"> =
      body.result === "cancelled" ? "cancelled" : orderId ? "valid" : "not_in_queue";
    const match = orderId
      ? {
          orderId,
          orderNumber: String(body.orderNumber || "").trim() || code,
          platform: String(body.platform || "").trim(),
        }
      : null;

    if (match) {
      try {
        const scan = await insertOverdueScan({
          id: String(body.id || "").trim() || randomUUID(),
          scannedCode: code,
          orderId: match.orderId,
          orderNumber: match.orderNumber,
          platform: match.platform,
          matched: true,
          result,
          scannedBy: body.scannedBy,
          scanDate,
        });
        return NextResponse.json({
          status: result,
          scan,
          match,
        });
      } catch (error: any) {
        if (error?.code === "23505") {
          const existing = await findMatchedOverdueScan(scanDate, match.orderId);
          if (existing) {
            if (result === "cancelled") {
              const updated = await updateOverdueScanResult(
                existing.id,
                "cancelled",
                code,
                body.scannedBy
              );
              return NextResponse.json({
                status: "cancelled" as OverdueScanStatus,
                scan: updated,
                match,
              });
            }
            const existingResult = String(existing.result || "valid");
            return NextResponse.json({
              status: (existingResult === "cancelled" ? "cancelled" : "duplicate") as OverdueScanStatus,
              scan: existing,
              match,
            });
          }
        }
        throw error;
      }
    }

    const scan = await insertOverdueScan({
      id: String(body.id || "").trim() || randomUUID(),
      scannedCode: code,
      matched: false,
      result: "not_in_queue",
      scannedBy: body.scannedBy,
      scanDate,
    });
    return NextResponse.json({
      status: "not_in_queue" as OverdueScanStatus,
      scan,
      match: null,
    });
  } catch (error) {
    console.error("Error saving overdue scan:", error);
    return NextResponse.json({ error: "Gagal menyimpan scan" }, { status: 500 });
  }
}
