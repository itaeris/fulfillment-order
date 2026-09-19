const ERROR_TEXT: Record<string, string> = {
  "missing-input-secret": "TURNSTILE_SECRET_KEY belum diisi di server",
  "invalid-input-secret": "Secret key Turnstile salah. Pakai Secret key Cloudflare (bukan Site key).",
  "missing-input-response": "Selesaikan verifikasi Cloudflare dulu",
  "invalid-input-response": "Verifikasi kadaluarsa. Centang lagi kotak Cloudflare.",
  "timeout-or-duplicate": "Verifikasi sudah dipakai. Centang lagi kotak Cloudflare.",
  "internal-error": "Cloudflare sedang gangguan. Coba beberapa detik lagi.",
  "bad-request": "Permintaan verifikasi tidak valid. Muat ulang halaman.",
};

export async function verifyTurnstileToken(
  token: string | undefined,
  ip?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || "").trim();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "Verifikasi Cloudflare belum dikonfigurasi di server" };
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
    const code = data["error-codes"]?.[0] || "";
    return { ok: false, error: ERROR_TEXT[code] || "Verifikasi gagal. Muat ulang halaman lalu coba lagi." };
  }
  return { ok: true };
}
