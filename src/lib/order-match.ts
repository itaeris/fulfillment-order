/** Keys for matching marketplace rows to Jubelio (order no, SP- prefix, resi). */

export function normalizeMatchKey(value?: string | null): string {
  return String(value || "")
    .replace(/[\s\-_.#]+/g, "")
    .toUpperCase();
}

/** Resi/AWB: leading zero atau 8–14 digit. Bukan nomor TikTok (~18 digit) / Shopee SN (ada huruf). */
export function isTrackingLikeCode(value?: string | null): boolean {
  const n = normalizeMatchKey(value);
  if (n.length < 8) return false;
  if (/[A-Z]/.test(n) && !/^0+/.test(n)) return false;
  if (/^0\d{7,}$/.test(n)) return true;
  return /^\d{8,14}$/.test(n);
}

const PREFIX_RULES: { prefix: string; restMustStartWithDigit?: boolean; minRest: number }[] = [
  { prefix: "SHOPEE", minRest: 8 },
  { prefix: "TOKOPEDIA", minRest: 8 },
  { prefix: "TOKPED", minRest: 8 },
  { prefix: "TIKTOK", minRest: 8 },
  { prefix: "LAZADA", minRest: 8 },
  { prefix: "TTS", minRest: 8, restMustStartWithDigit: true },
  { prefix: "SP", minRest: 8, restMustStartWithDigit: true },
  { prefix: "TT", minRest: 8, restMustStartWithDigit: true },
  { prefix: "TP", minRest: 8, restMustStartWithDigit: true },
  { prefix: "LZ", minRest: 8, restMustStartWithDigit: true },
  { prefix: "SHP", minRest: 8, restMustStartWithDigit: true },
];

export function splitIdentityValues(value?: string | null): string[] {
  return String(value || "")
    .split(/[,;|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function lookupMatchKeys(value?: string | null): string[] {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const keys = new Set<string>(expandMatchKeys(raw));
  keys.add(raw);
  keys.add(normalizeMatchKey(raw));
  return Array.from(keys).filter((key) => key.length >= 5);
}

export function expandMatchKeys(value?: string | null): string[] {
  const raw = String(value || "").trim();
  const base = normalizeMatchKey(raw);
  if (base.length < 5) return [];
  const keys = new Set<string>([base]);

  const dashed = raw.toUpperCase().match(/^(TT|TP|SP|TTS|SHOPEE|TOKOPEDIA|TOKPED|LZ|SHP)[-](.+?)(?:[-](\d{3,6}))?$/);
  if (dashed?.[2]) {
    for (const extra of expandMatchKeys(dashed[2])) keys.add(extra);
  }

  for (const rule of PREFIX_RULES) {
    if (!base.startsWith(rule.prefix)) continue;
    const rest = base.slice(rule.prefix.length);
    if (rest.length < rule.minRest) continue;
    if (rule.restMustStartWithDigit && !/^\d/.test(rest)) continue;
    keys.add(rest);
    if (/^\d+$/.test(rest) && rest.length > 18) keys.add(rest.slice(0, 18));
    if (/^\d+$/.test(rest) && rest.length > 19) keys.add(rest.slice(0, 19));
  }
  const generic = base.match(/^([A-Z]{1,10})(\d{10,})$/);
  if (generic) {
    keys.add(generic[2]);
    if (generic[2].length > 18) keys.add(generic[2].slice(0, 18));
  }
  return Array.from(keys);
}

export function orderNumberKeys(order: {
  orderNumber?: string;
  refNo?: string;
}): string[] {
  return uniqueKeys(
    [order.orderNumber, ...splitIdentityValues(order.refNo)].flatMap((value) => expandMatchKeys(value))
  );
}

export function trackingKeys(order: { trackingNumber?: string }): string[] {
  return expandMatchKeys(order.trackingNumber).filter((key) => key.length >= 5);
}

export function identityKeys(order: {
  orderNumber?: string;
  refNo?: string;
  trackingNumber?: string;
}): string[] {
  return uniqueKeys([...orderNumberKeys(order), ...trackingKeys(order)]);
}

function uniqueKeys(keys: string[]): string[] {
  return Array.from(new Set(keys.filter(Boolean)));
}

/** Varian ID untuk GET /sales/orders/{id} — Shopee di Jubelio biasanya SP-{sn}. */
export function jubelioApiLookupKeys(value?: string | null): string[] {
  const trimmed = String(value || "").trim();
  if (!trimmed) return [];
  const keys = new Set<string>([trimmed]);
  const n = normalizeMatchKey(trimmed);
  const prefixed = n.match(/^(SP|TT|TP|TTS)(.+)$/);
  if (prefixed && prefixed[2].length >= 8) {
    const rest = trimmed.replace(/^(SP|TT|TP|TTS)-?/i, "");
    if (rest) keys.add(rest);
  } else if (/^\d{6,}[A-Z0-9]*$/i.test(n)) {
    keys.add(`SP-${trimmed}`);
  } else if (/^\d{12,}$/.test(n)) {
    keys.add(`TT-${trimmed}`);
    keys.add(`TP-${trimmed}`);
  }
  return Array.from(keys);
}
