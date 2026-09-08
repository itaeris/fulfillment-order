import { NextRequest } from "next/server";
import { exchangeAuthCode, getRequestOrigin } from "@/lib/tiktok-auth";
import { consumeOauthReturn, redirectAfterOauth } from "@/lib/oauth-return";
import { toIndonesianError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const code =
    req.nextUrl.searchParams.get("code") ||
    req.nextUrl.searchParams.get("auth_code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  const savedState = req.cookies.get("tiktok_oauth_state")?.value;
  const next = consumeOauthReturn(req);

  const finish = (params: Record<string, string>) => {
    const res = redirectAfterOauth(origin, params, next);
    res.cookies.delete("tiktok_oauth_state");
    return res;
  };

  if (oauthError) {
    return finish({
      tiktok: "error",
      message: toIndonesianError(
        req.nextUrl.searchParams.get("error_description") || oauthError,
        "Gagal menghubungkan TikTok"
      ),
    });
  }

  if (!code) {
    return finish({ tiktok: "error", message: "Kode otorisasi TikTok tidak ditemukan" });
  }

  if (savedState && state && savedState !== state) {
    return finish({ tiktok: "error", message: "Sesi otorisasi tidak valid. Coba hubungkan lagi." });
  }

  try {
    await exchangeAuthCode(code);
    return finish({ tiktok: "connected" });
  } catch (error) {
    const message = toIndonesianError(
      error instanceof Error ? error.message : null,
      "Gagal menukar kode otorisasi TikTok"
    );
    return finish({ tiktok: "error", message });
  }
}
