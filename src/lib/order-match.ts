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
  { prefix: "TTS", minRest: 8, restMustStartWithDigit: true },
  { prefix: "SP", minRest: 8, restMustStartWithDigit: true },
  { prefix: "TT", minRest: 8, restMustStartWithDigit: true },
  { prefix: "TP", minRest: 8, restMustStartWithDigit: true },
];

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
  return Array.from(keys);
}

export function orderNumberKeys(order: {
  orderNumber?: string;
  refNo?: string;
}): string[] {
  return uniqueKeys([
    ...expandMatchKeys(order.orderNumber),
    ...expandMatchKeys(order.refNo),
  ]);
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
