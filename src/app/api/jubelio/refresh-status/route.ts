import { NextResponse } from "next/server";
import { refreshOpenJubelioStatuses } from "@/lib/jubelio-status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/belum di-set|JUBELIO_/i.test(message)) {
    return "Jubelio belum terhubung di server. Hubungi IT.";
  }
  return "Gagal memperbarui status Jubelio. Hubungi IT.";
}

export async function GET() {
  try {
    const result = await refreshOpenJubelioStatuses();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
