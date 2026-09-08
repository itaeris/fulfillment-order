import { NextRequest } from "next/server";
import { exchangeAuthCode, getRequestOrigin } from "@/lib/shopee-auth";
import { consumeOauthReturn, redirectAfterOauth } from "@/lib/oauth-return";
import { toIndonesianError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const next = consumeOauthReturn(req);
  const finish = (params: Record<string, string>) => redirectAfterOauth(origin, params, next);
  const code = req.nextUrl.searchParams.get("code");
  const shopIdRaw = req.nextUrl.searchParams.get("shop_id");
  const mainAccountRaw = req.nextUrl.searchParams.get("main_account_id");
  const oauthError =
    req.nextUrl.searchParams.get("error") || req.nextUrl.searchParams.get("msg");

  if (oauthError) {
    return finish({
      shopee: "error",
      message: toIndonesianError(oauthError, "Gagal menghubungkan Shopee"),
    });
  }

  if (!code) {
    return finish({
      shopee: "error",
      message: "Kode otorisasi Shopee tidak ditemukan",
    });
  }

  const shopId = shopIdRaw ? Number(shopIdRaw) : undefined;
  const mainAccountId = mainAccountRaw ? Number(mainAccountRaw) : undefined;
  if (!shopId && !mainAccountId) {
    return finish({
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
    return finish({ shopee: "connected" });
  } catch (error) {
    const message = toIndonesianError(
      error instanceof Error ? error.message : null,
      "Gagal menukar kode otorisasi Shopee"
    );
    return finish({ shopee: "error", message });
  }
}
