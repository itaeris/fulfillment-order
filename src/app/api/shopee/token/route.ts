import { NextResponse } from "next/server";
import { getTokenStatus } from "@/lib/shopee-auth";
import { toIndonesianError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

export async function GET() {
  try {
    const status = await getTokenStatus();
    return NextResponse.json(status, { headers: NO_STORE });
  } catch (error) {
    const message = toIndonesianError(
      error instanceof Error ? error.message : null,
      "Gagal cek token Shopee"
    );
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE });
  }
}
