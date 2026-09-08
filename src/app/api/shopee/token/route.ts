import { NextResponse } from "next/server";
import { maintainShopeeTokens } from "@/lib/shopee-auth";
import { toIndonesianError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await maintainShopeeTokens();
    return NextResponse.json(status);
  } catch (error) {
    const message = toIndonesianError(
      error instanceof Error ? error.message : null,
      "Gagal cek token Shopee"
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
