import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { buildDueDateOverview } from "@/lib/due-date";
import { getAllOverviewOrders, getOverdueScans, findMatchedOverdueScan, insertOverdueScan } from "@/lib/db";
import {
  matchOverdueScan,
  overdueScanMatchFromRow,
  type OverdueScanStatus,
} from "@/lib/overdue-scan";
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
    const body = (await request.json()) as { code?: string; scannedBy?: string };
    const code = String(body.code || "").trim();
    if (!code) {
      return NextResponse.json({ error: "Kode scan kosong" }, { status: 400 });
    }

    const scanDate = indonesiaDateKey();
    const orders = await getAllOverviewOrders();
    const overview = buildDueDateOverview(orders);
    const row = matchOverdueScan(code, overview.rows);

    if (row) {
      const match = overdueScanMatchFromRow(row);
      const existing = await findMatchedOverdueScan(scanDate, match.orderId);
      if (existing) {
        return NextResponse.json({
          status: "duplicate" as OverdueScanStatus,
          scan: existing,
          match,
        });
      }

      try {
        const scan = await insertOverdueScan({
          id: randomUUID(),
          scannedCode: code,
          orderId: match.orderId,
          orderNumber: match.orderNumber,
          platform: match.platform,
          matched: true,
          scannedBy: body.scannedBy,
          scanDate,
        });
        return NextResponse.json({
          status: "valid" as OverdueScanStatus,
          scan,
          match,
        });
      } catch (error: any) {
        if (error?.code === "23505") {
          const again = await findMatchedOverdueScan(scanDate, match.orderId);
          if (again) {
            return NextResponse.json({
              status: "duplicate" as OverdueScanStatus,
              scan: again,
              match,
            });
          }
        }
        throw error;
      }
    }

    const scan = await insertOverdueScan({
      id: randomUUID(),
      scannedCode: code,
      matched: false,
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
