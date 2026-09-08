import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthCode, getRequestOrigin } from "@/lib/shopee-auth";
import { toIndonesianError } from "@/lib/errors";

export const dynamic = "force-dynamic";

function redirectHome(origin: string, params: Record<string, string>) {
  const url = new URL("/", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const code = req.nextUrl.searchParams.get("code");
  const shopIdRaw = req.nextUrl.searchParams.get("shop_id");
  const mainAccountRaw = req.nextUrl.searchParams.get("main_account_id");
  const oauthError =
    req.nextUrl.searchParams.get("error") || req.nextUrl.searchParams.get("msg");

  if (oauthError) {
    return redirectHome(origin, {
      shopee: "error",
      message: toIndonesianError(oauthError, "Gagal menghubungkan Shopee"),
    });
  }

  if (!code) {
    return redirectHome(origin, {
      shopee: "error",
      message: "Kode otorisasi Shopee tidak ditemukan",
    });
  }

  const shopId = shopIdRaw ? Number(shopIdRaw) : undefined;
  const mainAccountId = mainAccountRaw ? Number(mainAccountRaw) : undefined;
  if (!shopId && !mainAccountId) {
    return redirectHome(origin, {
      shopee: "error",
      message: "Callback Shopee tidak berisi shop_id. Coba hubungkan lagi.",
    });
  }

  try {
    await exchangeAuthCode({
      code,
      shopId: Number.isFinite(shopId) ? shopId : undefined,
      mainAccountId: Number.isFinite(mainAccountId) ? mainAccountId : undefined,
    });
    return redirectHome(origin, { shopee: "connected" });
  } catch (error) {
    const message = toIndonesianError(
      error instanceof Error ? error.message : null,
      "Gagal menukar kode otorisasi Shopee"
    );
    return redirectHome(origin, { shopee: "error", message });
  }
}
