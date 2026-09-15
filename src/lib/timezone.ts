/** WIB — UTC+7. Jangan pakai UTC-7. */
export const INDONESIA_TZ = "Asia/Jakarta";
export const INDONESIA_OFFSET = "+07:00";
export const ORDER_CUTOFF_HOUR = 15;

export function indonesiaDateKey(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: INDONESIA_TZ });
}

export function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days, 12);
  return new Date(utc).toLocaleDateString("en-CA", { timeZone: "UTC" });
}

export function indonesiaHour(now = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDONESIA_TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number.parseInt(hour, 10);
}

/** Jendela order gudang: 15.00 kemarin → 15.00 sekarang (WIB). Ganti siklus tiap jam 15.00. */
export function indonesiaOrderCutoffRange(now = new Date()): { from: Date; to: Date; key: string } {
  const dateKey = indonesiaDateKey(now);
  const startKey = indonesiaHour(now) >= ORDER_CUTOFF_HOUR ? dateKey : addCalendarDays(dateKey, -1);
  const endKey = addCalendarDays(startKey, 1);
  return {
    key: startKey,
    from: new Date(`${startKey}T${String(ORDER_CUTOFF_HOUR).padStart(2, "0")}:00:00${INDONESIA_OFFSET}`),
    to: new Date(`${endKey}T${String(ORDER_CUTOFF_HOUR).padStart(2, "0")}:00:00${INDONESIA_OFFSET}`),
  };
}

export function indonesiaOrderCutoffKey(now = new Date()): string {
  return indonesiaOrderCutoffRange(now).key;
}

export function indonesiaDateRange(daysBack: number, now = new Date()): { from: string; to: string } {
  const to = indonesiaDateKey(now);
  return { from: addCalendarDays(to, -Math.max(0, daysBack)), to };
}

/** Unix detik untuk awal hari kalender Indonesia (UTC+7). */
export function indonesiaDayStartUnix(dateKey = indonesiaDateKey()): number {
  return Math.floor(new Date(`${dateKey}T00:00:00${INDONESIA_OFFSET}`).getTime() / 1000);
}

/** Unix detik untuk akhir hari kalender Indonesia (UTC+7). */
export function indonesiaDayEndUnix(dateKey = indonesiaDateKey()): number {
  return Math.floor(new Date(`${dateKey}T23:59:59${INDONESIA_OFFSET}`).getTime() / 1000);
}

export function parseIndonesiaDateTime(value?: string | number | Date | null): Date | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === "number") {
    if (value <= 0 || !Number.isFinite(value)) return undefined;
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : undefined;
    if (!ms) return undefined;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const raw = String(value).trim();
  if (!raw) return undefined;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00${INDONESIA_OFFSET}`);
  }
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?/);
  if (match) {
    const seconds = match[2] ?? "00";
    return new Date(`${match[1]}:${seconds}${INDONESIA_OFFSET}`);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
