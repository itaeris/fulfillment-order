const NO_STORE: RequestInit = { cache: "no-store", credentials: "same-origin" };

export function isShopLinkedPayload(data: unknown): boolean | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (typeof row.hasRefreshToken !== "boolean") return null;
  return Boolean(row.hasRefreshToken || row.hasAccessToken || row.hadConnection);
}

export async function fetchMarketplaceTokenStatus(): Promise<{
  shopee: Record<string, unknown> | null;
  tiktok: Record<string, unknown> | null;
}> {
  const [shopeeRes, tiktokRes] = await Promise.all([
    fetch("/api/shopee/token", NO_STORE),
    fetch("/api/tiktok/token", NO_STORE),
  ]);
  const shopee = shopeeRes.ok ? ((await shopeeRes.json()) as Record<string, unknown>) : null;
  const tiktok = tiktokRes.ok ? ((await tiktokRes.json()) as Record<string, unknown>) : null;
  return { shopee, tiktok };
}
