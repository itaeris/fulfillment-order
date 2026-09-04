export async function verifyTurnstileToken(
  token: string | undefined,
  ip?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!secret || !siteKey) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "Verifikasi Cloudflare belum dikonfigurasi" };
    }
    return { ok: true };
  }

  if (!token) {
    return { ok: false, error: "Selesaikan verifikasi Cloudflare dulu" };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (ip) body.set("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
  if (!data.success) {
    return { ok: false, error: "Verifikasi gagal. Muat ulang halaman lalu coba lagi." };
  }
  return { ok: true };
}
