import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Jubelio WMS / Omnichannel API
 * Docs: https://docs-wms.jubelio.com/
 *
 * POST /login  → token berlaku 12 jam
 * Jika expired, login ulang otomatis (bukan OAuth).
 */

const TOKEN_ROW_ID = "default";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const REFRESH_BUFFER_MS = 15 * 60 * 1000;

function tokenFilePath() {
  if (process.env.VERCEL) return path.join("/tmp", "jubelio-tokens.json");
  return path.join(process.cwd(), "data", "jubelio-tokens.json");
}

export interface JubelioStoredToken {
  accessToken: string;
  accessTokenExpireAt: string;
  updatedAt: string;
}

let loginLock: Promise<JubelioStoredToken> | null = null;

function getCredentials() {
  const email = process.env.JUBELIO_EMAIL?.trim();
  const password = process.env.JUBELIO_PASSWORD;
  const baseUrl = (process.env.JUBELIO_BASE_URL || "https://api2.jubelio.com").replace(
    /\/$/,
    ""
  );
  if (!email || !password) {
    throw new Error(
      "Kredensial Jubelio belum di-set. Isi JUBELIO_EMAIL dan JUBELIO_PASSWORD di .env.local / Vercel."
    );
  }
  return { email, password, baseUrl };
}

function isExpiring(iso?: string): boolean {
  if (!iso) return true;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return true;
  return at - Date.now() <= REFRESH_BUFFER_MS;
}

async function readFileToken(): Promise<JubelioStoredToken | null> {
  try {
    const raw = await readFile(tokenFilePath(), "utf8");
    const parsed = JSON.parse(raw) as JubelioStoredToken;
    if (!parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeFileToken(token: JubelioStoredToken): Promise<void> {
  const file = tokenFilePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(token, null, 2), "utf8");
}

async function readDbToken(): Promise<JubelioStoredToken | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("jubelio_tokens")
    .select("*")
    .eq("id", TOKEN_ROW_ID)
    .maybeSingle();
  if (error || !data?.access_token) return null;
  return {
    accessToken: data.access_token,
    accessTokenExpireAt: data.access_token_expire_at,
    updatedAt: data.updated_at,
  };
}

async function writeDbToken(token: JubelioStoredToken): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    if (process.env.VERCEL) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY wajib di Vercel supaya token Jubelio tersimpan."
      );
    }
    return;
  }
  const { error } = await admin.from("jubelio_tokens").upsert({
    id: TOKEN_ROW_ID,
    access_token: token.accessToken,
    access_token_expire_at: token.accessTokenExpireAt,
    updated_at: token.updatedAt,
  });
  if (error) {
    // Lokal: file cache di data/jubelio-tokens.json cukup. Jangan gagalkan sync.
    if (!process.env.VERCEL) {
      console.warn(
        "Jubelio token tidak tersimpan di DB, memakai file cache lokal:",
        error.message
      );
      return;
    }
    throw new Error(
      `Gagal menyimpan token Jubelio (${error.message}). Jalankan tabel jubelio_tokens di supabase/migration.sql.`
    );
  }
}

async function loadStoredToken(): Promise<JubelioStoredToken | null> {
  const db = await readDbToken();
  if (db?.accessToken) return db;
  return readFileToken();
}

async function saveStoredToken(token: JubelioStoredToken): Promise<void> {
  await writeDbToken(token);
  try {
    await writeFileToken(token);
  } catch {
    // cache /tmp di Vercel
  }
}

function toExpireIso(exp?: number): string | undefined {
  if (!exp || !Number.isFinite(exp) || exp <= 0) return undefined;

  // Jubelio JWT `exp` kadang milidetik (~1.7e12), kadang detik (~1.7e9).
  const ms = exp > 1e12 ? exp : exp > 1e9 ? exp * 1000 : Date.now() + exp * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear();
  if (year < 2020 || year > 2100) return undefined;
  return date.toISOString();
}

function jwtExpireIso(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as { exp?: number };
    return toExpireIso(json.exp);
  } catch {
    return undefined;
  }
}

export async function loginJubelio(): Promise<JubelioStoredToken> {
  if (loginLock) return loginLock;

  loginLock = (async () => {
    const { email, password, baseUrl } = getCredentials();
    const res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      token?: string;
      data?: { token?: string };
      message?: string;
    };
    const token = json.token || json.data?.token;
    if (!res.ok || !token) {
      throw new Error(
        `Login Jubelio gagal (${res.status}): ${json.message || res.statusText}`
      );
    }
    const stored: JubelioStoredToken = {
      accessToken: token,
      accessTokenExpireAt:
        jwtExpireIso(token) || new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveStoredToken(stored);
    return stored;
  })().finally(() => {
    loginLock = null;
  });

  return loginLock;
}

export async function ensureJubelioToken(): Promise<JubelioStoredToken> {
  const current = await loadStoredToken();
  if (current?.accessToken && !isExpiring(current.accessTokenExpireAt)) {
    return current;
  }
  return loginJubelio();
}

export function getJubelioBaseUrl(): string {
  return (process.env.JUBELIO_BASE_URL || "https://api2.jubelio.com").replace(/\/$/, "");
}

export function isJubelioAuthError(status: number, message?: string): boolean {
  if (status === 401 || status === 403) return true;
  const text = (message || "").toLowerCase();
  return (
    text.includes("expired") ||
    text.includes("unauthorized") ||
    text.includes("invalid token") ||
    text.includes("jwt")
  );
}
