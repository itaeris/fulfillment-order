import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getSupabaseAdmin } from "./supabase-admin";

/**
 * TikTok Shop token (API v2):
 * - access_token kadaluarsa ~4 jam
 * - refresh_token berlaku lama (~1 tahun) dan dipakai untuk perpanjang access_token
 *   tanpa authorize ulang.
 *
 * GET https://auth.tiktok-shops.com/api/v2/token/refresh
 * GET https://auth.tiktok-shops.com/api/v2/token/get  (auth_code → token)
 */

const TOKEN_ROW_ID = "default";
const TOKEN_FILE = path.join(process.cwd(), "data", "tiktok-tokens.json");
const AUTH_BASE = process.env.TIKTOK_AUTH_BASE_URL || "https://auth.tiktok-shops.com";
const ACCESS_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const REFRESH_TOKEN_ROTATE_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_REAUTH_MS = 7 * 24 * 60 * 60 * 1000;

export interface TikTokStoredTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpireAt?: string;
  refreshTokenExpireAt?: string;
  updatedAt: string;
}

export interface TikTokTokenStatus {
  hasRefreshToken: boolean;
  hasAccessToken: boolean;
  accessTokenExpireAt?: string;
  refreshTokenExpireAt?: string;
  needsRefresh: boolean;
  needsReauth: boolean;
  hadConnection: boolean;
}

interface TikTokTokenApiData {
  access_token?: string;
  refresh_token?: string;
  access_token_expire_in?: number;
  refresh_token_expire_in?: number;
  open_id?: string;
  seller_name?: string;
}

let refreshLock: Promise<TikTokStoredTokens> | null = null;

function toExpireIso(value?: number): string | undefined {
  if (!value || !Number.isFinite(value)) return undefined;
  if (value < 1_000_000_000) {
    return new Date(Date.now() + value * 1000).toISOString();
  }
  return new Date(value * 1000).toISOString();
}

function expiresWithin(
  iso: string | undefined,
  ms: number,
  missingMeansExpiring: boolean
): boolean {
  if (!iso) return missingMeansExpiring;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return missingMeansExpiring;
  return at - Date.now() <= ms;
}

function isExpired(iso?: string): boolean {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return false;
  return at <= Date.now();
}

function toStatus(
  tokens: TikTokStoredTokens | null,
  extra: { needsReauth?: boolean; hadConnection?: boolean } = {}
): TikTokTokenStatus {
  return {
    hasRefreshToken: Boolean(tokens?.refreshToken),
    hasAccessToken: Boolean(tokens?.accessToken),
    accessTokenExpireAt: tokens?.accessTokenExpireAt,
    refreshTokenExpireAt: tokens?.refreshTokenExpireAt,
    needsRefresh:
      !tokens?.refreshToken ||
      expiresWithin(tokens?.accessTokenExpireAt, ACCESS_REFRESH_BUFFER_MS, true),
    needsReauth: extra.needsReauth ?? false,
    hadConnection: extra.hadConnection ?? Boolean(tokens?.refreshToken),
  };
}

async function readFileTokens(): Promise<TikTokStoredTokens | null> {
  try {
    const raw = await readFile(TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw) as TikTokStoredTokens;
    if (!parsed?.accessToken && !parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeFileTokens(tokens: TikTokStoredTokens): Promise<void> {
  await mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf8");
}

async function readDbTokens(): Promise<TikTokStoredTokens | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("tiktok_tokens")
      .select("*")
      .eq("id", TOKEN_ROW_ID)
      .maybeSingle();
    if (error || !data) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpireAt: data.access_token_expire_at ?? undefined,
      refreshTokenExpireAt: data.refresh_token_expire_at ?? undefined,
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}

async function writeDbTokens(tokens: TikTokStoredTokens): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.from("tiktok_tokens").upsert({
      id: TOKEN_ROW_ID,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      access_token_expire_at: tokens.accessTokenExpireAt ?? null,
      refresh_token_expire_at: tokens.refreshTokenExpireAt ?? null,
      updated_at: tokens.updatedAt,
    });
  } catch {
    // Tabel belum ada — file store tetap dipakai
  }
}

function tokensFromEnv(): TikTokStoredTokens | null {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN || "";
  const refreshToken = process.env.TIKTOK_REFRESH_TOKEN || "";
  if (!accessToken && !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    updatedAt: new Date(0).toISOString(),
  };
}

export async function loadStoredTokens(): Promise<TikTokStoredTokens | null> {
  const db = await readDbTokens();
  if (db?.refreshToken) return db;
  const file = await readFileTokens();
  if (file?.refreshToken || file?.accessToken) return file;
  return tokensFromEnv();
}

export async function saveStoredTokens(tokens: TikTokStoredTokens): Promise<void> {
  const payload: TikTokStoredTokens = {
    ...tokens,
    updatedAt: new Date().toISOString(),
  };
  await writeFileTokens(payload);
  await writeDbTokens(payload);
}

export async function getTokenStatus(): Promise<TikTokTokenStatus> {
  const tokens = await loadStoredTokens();
  return toStatus(tokens, { hadConnection: Boolean(tokens?.refreshToken) });
}

export async function maintainTikTokTokens(): Promise<TikTokTokenStatus> {
  const before = await loadStoredTokens();
  const hadConnection = Boolean(before?.refreshToken);

  if (hadConnection) {
    try {
      await ensureFreshTokens();
    } catch {
      return toStatus(before, { needsReauth: true, hadConnection: true });
    }
  }

  const after = await loadStoredTokens();
  const refreshDying =
    isExpired(after?.refreshTokenExpireAt) ||
    expiresWithin(after?.refreshTokenExpireAt, REFRESH_TOKEN_REAUTH_MS, false);

  return toStatus(after, {
    hadConnection,
    needsReauth: hadConnection && refreshDying,
  });
}

async function callTokenEndpoint(
  path: string,
  params: Record<string, string>
): Promise<TikTokTokenApiData> {
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("TIKTOK_APP_KEY / TIKTOK_APP_SECRET belum di-set");
  }

  const query = new URLSearchParams({
    app_key: appKey,
    app_secret: appSecret,
    ...params,
  });

  const res = await fetch(`${AUTH_BASE}${path}?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const json = (await res.json()) as {
    code: number;
    message: string;
    data?: TikTokTokenApiData;
  };

  if (!res.ok || json.code !== 0 || !json.data?.access_token) {
    throw new Error(
      `Gagal memperbarui token TikTok (${json.code ?? res.status}): ${json.message || res.statusText}`
    );
  }

  return json.data;
}

function mapTokenResponse(data: TikTokTokenApiData, fallbackRefresh?: string): TikTokStoredTokens {
  const refreshToken = data.refresh_token || fallbackRefresh;
  if (!refreshToken) {
    throw new Error("Respons TikTok tidak berisi refresh_token");
  }
  return {
    accessToken: data.access_token!,
    refreshToken,
    accessTokenExpireAt: toExpireIso(data.access_token_expire_in),
    refreshTokenExpireAt: toExpireIso(data.refresh_token_expire_in),
    updatedAt: new Date().toISOString(),
  };
}

export function getRequestOrigin(req: Request): string {
  const configured = process.env.TIKTOK_REDIRECT_ORIGIN?.replace(/\/$/, "");
  if (configured) return configured;

  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const proto =
    req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "http";
  return `${proto}://${host}`;
}

export function getCallbackUrl(origin: string): string {
  return `${origin}/api/tiktok/callback`;
}

export function getAuthorizeUrl(state: string, redirectUri?: string): string {
  const custom = process.env.TIKTOK_AUTHORIZE_URL?.trim();
  const serviceId = process.env.TIKTOK_SERVICE_ID?.trim();
  const appKey = process.env.TIKTOK_APP_KEY?.trim();

  if (custom) {
    const url = new URL(custom);
    url.searchParams.set("state", state);
    return url.toString();
  }

  if (serviceId) {
    const url = new URL("https://services.tiktokshop.com/open/authorize");
    url.searchParams.set("service_id", serviceId);
    url.searchParams.set("state", state);
    return url.toString();
  }

  if (!appKey) {
    throw new Error("TIKTOK_APP_KEY belum di-set");
  }

  const url = new URL(`${AUTH_BASE}/oauth/authorize`);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("state", state);
  if (redirectUri) url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export async function exchangeAuthCode(authCode: string): Promise<TikTokStoredTokens> {
  const data = await callTokenEndpoint("/api/v2/token/get", {
    auth_code: authCode.trim(),
    grant_type: "authorized_code",
  });
  const tokens = mapTokenResponse(data);
  await saveStoredTokens(tokens);
  return tokens;
}

export async function saveRefreshToken(refreshToken: string): Promise<TikTokStoredTokens> {
  const tokens = await refreshWithToken(refreshToken.trim());
  await saveStoredTokens(tokens);
  return tokens;
}

async function refreshWithToken(refreshToken: string): Promise<TikTokStoredTokens> {
  const data = await callTokenEndpoint("/api/v2/token/refresh", {
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return mapTokenResponse(data, refreshToken);
}

export function isTikTokAuthError(code?: number, message?: string): boolean {
  if (code === 105001 || code === 105002 || code === 36004005 || code === 36009004) {
    return true;
  }
  const text = (message || "").toLowerCase();
  return (
    text.includes("access token") ||
    text.includes("access_token") ||
    text.includes("token is expired") ||
    text.includes("invalid token") ||
    text.includes("unauthorized")
  );
}

export async function refreshAccessToken(): Promise<TikTokStoredTokens> {
  if (refreshLock) return refreshLock;

  refreshLock = (async () => {
    const current = await loadStoredTokens();
    if (!current?.refreshToken) {
      throw new Error(
        "Refresh token TikTok belum ada. Hubungkan akun TikTok di Settings."
      );
    }
    const next = await refreshWithToken(current.refreshToken);
    await saveStoredTokens(next);
    return next;
  })().finally(() => {
    refreshLock = null;
  });

  return refreshLock;
}

export async function ensureFreshTokens(): Promise<TikTokStoredTokens> {
  const current = await loadStoredTokens();
  if (!current?.refreshToken) {
    if (current?.accessToken) return current;
    throw new Error(
      "Kredensial TikTok belum lengkap. Hubungkan akun TikTok di Settings."
    );
  }

  const needAccessRefresh = expiresWithin(
    current.accessTokenExpireAt,
    ACCESS_REFRESH_BUFFER_MS,
    true
  );
  const needRotateRefresh = expiresWithin(
    current.refreshTokenExpireAt,
    REFRESH_TOKEN_ROTATE_MS,
    false
  );

  if (current.accessToken && !needAccessRefresh && !needRotateRefresh) {
    return current;
  }

  return refreshAccessToken();
}
