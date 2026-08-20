/** Map English / vendor error text to Indonesian for UI alerts. */
export function toIndonesianError(
  message: string | null | undefined,
  fallback = "Terjadi kesalahan. Coba lagi."
): string {
  if (!message?.trim()) return fallback;

  const text = message.trim();
  const lower = text.toLowerCase();

  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "Email/username atau password salah";
  }
  if (lower.includes("email not confirmed")) {
    return "Email belum dikonfirmasi. Cek kotak masuk kamu.";
  }
  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered") ||
    lower.includes("already exists")
  ) {
    return "Email sudah terdaftar";
  }
  if (lower.includes("password should be at least") || lower.includes("password is too short")) {
    return "Password minimal 6 karakter";
  }
  if (lower.includes("new password should be different")) {
    return "Password baru harus berbeda dari password lama";
  }
  if (lower.includes("unable to validate email") || lower.includes("invalid email")) {
    return "Format email tidak valid";
  }
  if (lower.includes("rate limit") || lower.includes("only request this after")) {
    return "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.";
  }
  if (lower.includes("auth session missing") || lower.includes("session missing")) {
    return "Sesi login tidak ditemukan. Silakan login ulang.";
  }
  if (lower.includes("network") || lower.includes("fetch failed")) {
    return "Terjadi kesalahan jaringan. Coba lagi.";
  }
  if (lower.includes("unique") || lower.includes("duplicate")) {
    return "Data sudah dipakai. Coba nilai lain.";
  }
  if (lower.includes("access_denied") || lower.includes("access denied")) {
    return "Akses ditolak";
  }
  if (lower.includes("server_error") || lower.includes("internal server")) {
    return "Terjadi kesalahan pada server. Coba lagi.";
  }
  if (lower.includes("failed to") || lower.includes("unable to") || lower.includes("could not")) {
    return fallback;
  }

  // Keep messages that already look Indonesian
  if (
    /\b(gagal|wajib|tidak|salah|belum|terjadi|hubungi|coba|sudah|format|minimal|semua|email|password|username|akun|sesi|jaringan|sistem)\b/i.test(
      text
    )
  ) {
    return text;
  }

  // Unknown English-looking vendor text → generic Indonesian
  if (/^[A-Za-z0-9 .,_:()\-/'"!]+$/.test(text) && /\b(the|is|are|was|were|to|of|for|and|or|you|your|please|error|invalid|failed)\b/i.test(text)) {
    return fallback;
  }

  return text;
}
