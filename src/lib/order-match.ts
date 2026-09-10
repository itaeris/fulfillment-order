/** Keys for matching marketplace rows to Jubelio (order no, SP- prefix, resi). */

export function normalizeMatchKey(value?: string | null): string {
  return String(value || "")
    .replace(/[\s\-_.#]+/g, "")
    .toUpperCase();
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

export function expandMatchKeys(value?: string | null): string[] {
  const base = normalizeMatchKey(value);
  if (base.length < 5) return [];
  const keys = new Set<string>([base]);
  for (const rule of PREFIX_RULES) {
    if (!base.startsWith(rule.prefix)) continue;
    const rest = base.slice(rule.prefix.length);
    if (rest.length < rule.minRest) continue;
    if (rule.restMustStartWithDigit && !/^\d/.test(rest)) continue;
    keys.add(rest);
  }
  const generic = base.match(/^([A-Z]{1,10})(\d{10,})$/);
  if (generic) keys.add(generic[2]);
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
