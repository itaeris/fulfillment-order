import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Shopee Open API v2 tokens.
 * Docs: https://open.shopee.com/developer-guide/20
 *
 * access_token ~4 jam, refresh_token ~30 hari.
 * POST /api/v2/auth/token/get
 * POST /api/v2/auth/access_token/get
 */

const TOKEN_ROW_ID = "default";
const ACCESS_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const REFRESH_TOKEN_REAUTH_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function tokenFilePath() {
  if (process.env.VERCEL) return path.join("/tmp", "shopee-tokens.json");
  return path.join(process.cwd(), "data", "shopee-tokens.json");
}

export interface ShopeeStoredTokens {
  accessToken: string;
  refreshToken: string;
  shopId?: number;
  merchantId?: number;
  mainAccountId?: number;
  accessTokenExpireAt?: string;
  refreshTokenExpireAt?: string;
  updatedAt: string;
}

export interface ShopeeTokenStatus {
  hasRefreshToken: boolean;
  hasAccessToken: boolean;
  hasShopId: boolean;
  shopId?: number;
  accessTokenExpireAt?: string;
  refreshTokenExpireAt?: string;
  needsRefresh: boolean;
  needsReauth: boolean;
  hadConnection: boolean;
}

interface ShopeeTokenApiData {
  access_token?: string;
  refresh_token?: string;
  expire_in?: number;
  shop_id?: number;
  merchant_id?: number;
  shop_id_list?: number[];
  merchant_id_list?: number[];
  error?: string;
  message?: string;
}

let refreshLock: Promise<ShopeeStoredTokens> | null = null;

export function getShopeePartnerId(): number {
  const raw = process.env.SHOPEE_PARTNER_ID?.trim();
  const id = raw ? Number(raw) : NaN;
  if (!Number.isFinite(id)) {
    throw new Error("SHOPEE_PARTNER_ID belum di-set");
  }
  return id;
}

export function getShopeePartnerKey(): string {
  const key = process.env.SHOPEE_PARTNER_KEY?.trim();
  if (!key) throw new Error("SHOPEE_PARTNER_KEY belum di-set");
  return key;
}

export function getShopeeBaseUrl(): string {
  return (process.env.SHOPEE_BASE_URL || "https://partner.shopeemobile.com").replace(/\/$/, "");
}

export function shopeeSign(path: string, timestamp: number, extra = ""): string {
  const base = `${getShopeePartnerId()}${path}${timestamp}${extra}`;
  return crypto.createHmac("sha256", getShopeePartnerKey()).update(base).digest("hex");
}

function toExpireIso(seconds?: number, fallbackMs?: number): string | undefined {
  if (seconds && Number.isFinite(seconds)) {
    return new Date(Date.now() + seconds * 1000).toISOString();
  }
  if (fallbackMs) return new Date(Date.now() + fallbackMs).toISOString();
  return undefined;
}

function expiresWithin(iso: string | undefined, ms: number, missingMeansExpiring: boolean): boolean {
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
  tokens: ShopeeStoredTokens | null,
  extra: { needsReauth?: boolean; hadConnection?: boolean } = {}
): ShopeeTokenStatus {
  return {
    hasRefreshToken: Boolean(tokens?.refreshToken),
    hasAccessToken: Boolean(tokens?.accessToken),
    hasShopId: Boolean(tokens?.shopId),
    shopId: tokens?.shopId,
    accessTokenExpireAt: tokens?.accessTokenExpireAt,
    refreshTokenExpireAt: tokens?.refreshTokenExpireAt,
    needsRefresh:
      !tokens?.refreshToken ||
      expiresWithin(tokens?.accessTokenExpireAt, ACCESS_REFRESH_BUFFER_MS, true),
    needsReauth: extra.needsReauth ?? false,
    hadConnection: extra.hadConnection ?? Boolean(tokens?.refreshToken),
  };
}

async function readFileTokens(): Promise<ShopeeStoredTokens | null> {
  try {
    const raw = await readFile(tokenFilePath(), "utf8");
    const parsed = JSON.parse(raw) as ShopeeStoredTokens;
    if (!parsed?.accessToken && !parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeFileTokens(tokens: ShopeeStoredTokens): Promise<void> {
  const file = tokenFilePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(tokens, null, 2), "utf8");
}

async function readDbTokens(): Promise<ShopeeStoredTokens | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("shopee_tokens")
    .select("*")
    .eq("id", TOKEN_ROW_ID)
    .maybeSingle();
  if (error) {
    console.error("shopee_tokens read failed:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    shopId: data.shop_id ?? undefined,
    merchantId: data.merchant_id ?? undefined,
    mainAccountId: data.main_account_id ?? undefined,
    accessTokenExpireAt: data.access_token_expire_at ?? undefined,
    refreshTokenExpireAt: data.refresh_token_expire_at ?? undefined,
    updatedAt: data.updated_at,
  };
}

async function writeDbTokens(tokens: ShopeeStoredTokens): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    if (process.env.VERCEL) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY wajib di Vercel supaya access token Shopee tersimpan."
      );
    }
    return;
  }

  const { error } = await admin.from("shopee_tokens").upsert({
    id: TOKEN_ROW_ID,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    shop_id: tokens.shopId ?? null,
    merchant_id: tokens.merchantId ?? null,
    main_account_id: tokens.mainAccountId ?? null,
    access_token_expire_at: tokens.accessTokenExpireAt ?? null,
    refresh_token_expire_at: tokens.refreshTokenExpireAt ?? null,
    updated_at: tokens.updatedAt,
  });

  if (error) {
    throw new Error(
      `Gagal menyimpan token Shopee ke database (${error.message}). Jalankan tabel shopee_tokens di supabase/migration.sql.`
    );
  }
}

export async function loadStoredTokens(): Promise<ShopeeStoredTokens | null> {
  const db = await readDbTokens();
  if (db?.refreshToken || db?.accessToken) return db;
  const file = await readFileTokens();
  if (file?.refreshToken || file?.accessToken) {
    try {
      await writeDbTokens(file);
    } catch (error) {
      console.error(
        "Shopee token ada di cache lokal, gagal disimpan ke database:",
        error instanceof Error ? error.message : error
      );
    }
    return file;
  }
  return null;
}

export async function saveStoredTokens(tokens: ShopeeStoredTokens): Promise<void> {
  const payload: ShopeeStoredTokens = {
    ...tokens,
    updatedAt: new Date().toISOString(),
  };
  await writeDbTokens(payload);
  try {
    await writeFileTokens(payload);
  } catch {
    // /tmp cache only on Vercel
  }
}

function refreshTokenDying(tokens: ShopeeStoredTokens | null): boolean {
  return (
    isExpired(tokens?.refreshTokenExpireAt) ||
    expiresWithin(tokens?.refreshTokenExpireAt, REFRESH_TOKEN_REAUTH_MS, false)
  );
}

function accessNeedsRefresh(tokens: ShopeeStoredTokens): boolean {
  if (!tokens.accessToken) return true;
  if (tokens.accessTokenExpireAt) {
    return expiresWithin(tokens.accessTokenExpireAt, ACCESS_REFRESH_BUFFER_MS, false);
  }
  if (tokens.updatedAt) {
    const assumedExpiry = new Date(tokens.updatedAt).getTime() + 4 * 60 * 60 * 1000;
    return assumedExpiry - Date.now() <= ACCESS_REFRESH_BUFFER_MS;
  }
  return false;
}

export async function getTokenStatus(): Promise<ShopeeTokenStatus> {
  const tokens = await loadStoredTokens();
  const hadConnection = Boolean(tokens?.refreshToken);
  return toStatus(tokens, {
    hadConnection,
    needsReauth: hadConnection && refreshTokenDying(tokens),
  });
}

export function getRequestOrigin(req: Request): string {
  const configured = (
    process.env.SHOPEE_REDIRECT_ORIGIN ||
    process.env.TIKTOK_REDIRECT_ORIGIN ||
    ""
  ).replace(/\/$/, "");
  if (configured) return configured;

  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const proto =
    req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "http";
  return `${proto}://${host}`;
}

export function getCallbackUrl(origin: string): string {
  return `${origin}/api/shopee/callback`;
}

export function getAuthorizeUrl(redirectUri: string): string {
  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = shopeeSign(path, timestamp);
  const url = new URL(`${getShopeeBaseUrl()}${path}`);
  url.searchParams.set("partner_id", String(getShopeePartnerId()));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  url.searchParams.set("redirect", redirectUri);
  return url.toString();
}

async function callTokenApi(
  apiPath: string,
  body: Record<string, unknown>
): Promise<ShopeeTokenApiData> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = shopeeSign(apiPath, timestamp);
  const partnerId = getShopeePartnerId();
  const query = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
  });
  const res = await fetch(`${getShopeeBaseUrl()}${apiPath}?${query.toString()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, partner_id: partnerId }),
    cache: "no-store",
  });
  const json = (await res.json()) as ShopeeTokenApiData;
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(
      `Gagal token Shopee (${json.error || res.status}): ${json.message || res.statusText}`
    );
  }
  return json;
}

function mapTokenResponse(
  data: ShopeeTokenApiData,
  fallback: Partial<ShopeeStoredTokens> = {}
): ShopeeStoredTokens {
  const refreshToken = data.refresh_token || fallback.refreshToken;
  if (!refreshToken) {
    throw new Error("Respons Shopee tidak berisi refresh_token");
  }
  const envShop = Number(process.env.SHOPEE_SHOP_ID || "");
  const shopId =
    data.shop_id ||
    data.shop_id_list?.[0] ||
    fallback.shopId ||
    (Number.isFinite(envShop) ? envShop : undefined);
  return {
    accessToken: data.access_token!,
    refreshToken,
    shopId,
    merchantId: data.merchant_id || data.merchant_id_list?.[0] || fallback.merchantId,
    mainAccountId: fallback.mainAccountId,
    accessTokenExpireAt: toExpireIso(data.expire_in),
    refreshTokenExpireAt:
      fallback.refreshTokenExpireAt && !isExpired(fallback.refreshTokenExpireAt)
        ? fallback.refreshTokenExpireAt
        : toExpireIso(undefined, REFRESH_TOKEN_TTL_MS),
    updatedAt: new Date().toISOString(),
  };
}

export async function exchangeAuthCode(params: {
  code: string;
  shopId?: number;
  mainAccountId?: number;
}): Promise<ShopeeStoredTokens> {
  const body: Record<string, unknown> = { code: params.code.trim() };
  if (params.shopId) body.shop_id = params.shopId;
  else if (params.mainAccountId) body.main_account_id = params.mainAccountId;
  else {
    throw new Error("Callback Shopee tidak berisi shop_id");
  }

  const data = await callTokenApi("/api/v2/auth/token/get", body);
  const tokens = mapTokenResponse(data, { mainAccountId: params.mainAccountId, shopId: params.shopId });
  if (!tokens.shopId) {
    throw new Error("Shopee tidak mengembalikan shop_id. Hubungkan ulang toko.");
  }
  await saveStoredTokens(tokens);
  return tokens;
}

async function refreshWithToken(current: ShopeeStoredTokens): Promise<ShopeeStoredTokens> {
  if (!current.shopId) {
    throw new Error("shop_id Shopee belum ada. Hubungkan ulang toko.");
  }
  const data = await callTokenApi("/api/v2/auth/access_token/get", {
    refresh_token: current.refreshToken,
    shop_id: current.shopId,
  });
  return mapTokenResponse(data, current);
}

export async function refreshAccessToken(): Promise<ShopeeStoredTokens> {
  if (refreshLock) return refreshLock;

  refreshLock = (async () => {
    const current = await loadStoredTokens();
    if (!current?.refreshToken) {
      throw new Error("Refresh token Shopee belum ada. Hubungkan toko di Settings.");
    }
    const next = await refreshWithToken(current);
    await saveStoredTokens(next);
    return next;
  })().finally(() => {
    refreshLock = null;
  });

  return refreshLock;
}

export async function ensureFreshTokens(): Promise<ShopeeStoredTokens> {
  const current = await loadStoredTokens();
  if (!current?.refreshToken || !current.shopId) {
    throw new Error("Shopee belum terhubung. Hubungkan toko di Settings.");
  }
  if (!accessNeedsRefresh(current)) return current;
  return refreshAccessToken();
}

export async function maintainShopeeTokens(): Promise<ShopeeTokenStatus> {
  return getTokenStatus();
}

export function isShopeeAuthError(error?: string, message?: string): boolean {
  const text = `${error || ""} ${message || ""}`.toLowerCase();
  return (
    text.includes("invalid_acceess_token") ||
    text.includes("invalid_access_token") ||
    text.includes("error_auth") ||
    text.includes("access_token") ||
    text.includes("invalid token") ||
    text.includes("token is expired")
  );
}
