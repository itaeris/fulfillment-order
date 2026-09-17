/** WIB — UTC+7. Jangan pakai UTC-7. */
export const INDONESIA_TZ = "Asia/Jakarta";
export const INDONESIA_OFFSET = "+07:00";

export type ProcessCutoffClock = { hour: number; minute: number };
export type ProcessCutoffKind = "regular" | "instant";

const CUTOFF_1501: ProcessCutoffClock = { hour: 15, minute: 1 };
const CUTOFF_1701: ProcessCutoffClock = { hour: 17, minute: 1 };

/** Cutoff proses order gudang (WIB). Instant TikTok/Tokopedia lebih sore. */
export const PROCESS_CUTOFF = {
  shopee: { regular: CUTOFF_1501, instant: CUTOFF_1501 },
  tiktok: { regular: CUTOFF_1501, instant: CUTOFF_1701 },
  tokopedia: { regular: CUTOFF_1501, instant: CUTOFF_1701 },
} as const;

/** Teks kartu Order hari ini — cutoff masuk proses, bukan tenggat kirim. */
export const ORDER_TODAY_CUTOFF_HINT = [
  "Shopee — reguler: sampai 15.01",
  "Shopee — instant: sampai 15.01 (sama dengan reguler)",
  "TikTok/Tokped — reguler: sampai 15.01",
  "TikTok/Tokped — instant: sampai 17.01",
] as const;

export const ORDER_TODAY_CUTOFF_SUBTITLE =
  "Cutoff proses gudang (bukan tenggat kirim). Shopee reguler & instant sampai 15.01. TikTok & Tokopedia reguler sampai 15.01, instant sampai 17.01.";

export const ORDER_CUTOFF_HOUR = CUTOFF_1501.hour;

/** Due gudang, semua channel (WIB). */
export const WAREHOUSE_DUE_NIGHT_START: ProcessCutoffClock = { hour: 17, minute: 0 };
export const WAREHOUSE_DUE_MORNING_END: ProcessCutoffClock = { hour: 9, minute: 0 };

/** Shopee Regular / Hemat / Next Day: masuk sebelum 12.00 → hari kerja yang sama pukul 23.59. */
export const SHOPEE_STANDARD_CUTOFF: ProcessCutoffClock = { hour: 12, minute: 0 };
export const SHOPEE_STANDARD_DEADLINE: ProcessCutoffClock = { hour: 23, minute: 59 };

export function indonesiaDateKey(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: INDONESIA_TZ });
}

export function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days, 12);
  return new Date(utc).toLocaleDateString("en-CA", { timeZone: "UTC" });
}

export function indonesiaTimeParts(now = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDONESIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return {
    hour: Number.parseInt(parts.find((part) => part.type === "hour")?.value || "0", 10),
    minute: Number.parseInt(parts.find((part) => part.type === "minute")?.value || "0", 10),
  };
}

export function indonesiaHour(now = new Date()): number {
  return indonesiaTimeParts(now).hour;
}

export function isOvernightPlacement(value: Date | string | null | undefined): boolean {
  if (value == null || value === "") return false;
  const at = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(at.getTime())) return false;
  const { hour } = indonesiaTimeParts(at);
  return hour >= WAREHOUSE_DUE_NIGHT_START.hour || hour < WAREHOUSE_DUE_MORNING_END.hour;
}

function clockStamp(clock: ProcessCutoffClock) {
  return `${pad2(clock.hour)}:${pad2(clock.minute)}:00`;
}

/**
 * Due gudang dari waktu order/bayar:
 * 09.00–17.00 → hari itu jam 17.00
 * 17.00–09.00 besok → besok jam 09.00
 */
export function warehouseDueSchedule(placed: Date | string): { dueDay: string; deadline: Date } {
  const at = placed instanceof Date ? placed : new Date(placed);
  const date = indonesiaDateKey(at);
  const { hour } = indonesiaTimeParts(at);
  if (hour >= WAREHOUSE_DUE_NIGHT_START.hour) {
    const dueDay = addCalendarDays(date, 1);
    return {
      dueDay,
      deadline: new Date(`${dueDay}T${clockStamp(WAREHOUSE_DUE_MORNING_END)}${INDONESIA_OFFSET}`),
    };
  }
  if (hour < WAREHOUSE_DUE_MORNING_END.hour) {
    return {
      dueDay: date,
      deadline: new Date(`${date}T${clockStamp(WAREHOUSE_DUE_MORNING_END)}${INDONESIA_OFFSET}`),
    };
  }
  return {
    dueDay: date,
    deadline: new Date(`${date}T${clockStamp(WAREHOUSE_DUE_NIGHT_START)}${INDONESIA_OFFSET}`),
  };
}

export function warehouseDueDayKey(placed: Date | string): string {
  return warehouseDueSchedule(placed).dueDay;
}

function indonesiaWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function shopeeWorkingDayOnOrAfter(dateKey: string): string {
  let next = dateKey;
  while (indonesiaWeekday(next) === 0) {
    next = addCalendarDays(next, 1);
  }
  return next;
}

/**
 * SLA Shopee Regular / Hemat / Next Day (WIB):
 * masuk sebelum 12.00 → hari kerja itu juga, paling lama 23.59
 * masuk jam 12.00+ → hari kerja berikutnya, 23.59
 */
export function shopeeStandardDueSchedule(placed: Date | string): { dueDay: string; deadline: Date } {
  const at = placed instanceof Date ? placed : new Date(placed);
  const date = indonesiaDateKey(at);
  const { hour } = indonesiaTimeParts(at);
  const rawDue = hour < SHOPEE_STANDARD_CUTOFF.hour ? date : addCalendarDays(date, 1);
  const dueDay = shopeeWorkingDayOnOrAfter(rawDue);
  return {
    dueDay,
    deadline: new Date(`${dueDay}T${clockStamp(SHOPEE_STANDARD_DEADLINE)}${INDONESIA_OFFSET}`),
  };
}

export function shopeeStandardDueDayKey(placed: Date | string): string {
  return shopeeStandardDueSchedule(placed).dueDay;
}

/** Hari antrian kirim: kalender WIB. Order 17.00+ masuk antrian besok. */
export function warehouseTodayKey(now = new Date()): string {
  return indonesiaDateKey(now);
}

export function warehouseMorningDeadline(dueDayKey: string): Date {
  return new Date(`${dueDayKey}T${clockStamp(WAREHOUSE_DUE_MORNING_END)}${INDONESIA_OFFSET}`);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function cutoffReached(now: Date, clock: ProcessCutoffClock): boolean {
  const time = indonesiaTimeParts(now);
  return time.hour > clock.hour || (time.hour === clock.hour && time.minute >= clock.minute);
}

function cutoffClockFor(platform: string, kind: ProcessCutoffKind): ProcessCutoffClock {
  if (platform === "shopee") return PROCESS_CUTOFF.shopee[kind];
  if (platform === "tokopedia") return PROCESS_CUTOFF.tokopedia[kind];
  return PROCESS_CUTOFF.tiktok[kind];
}

function cutoffInstant(kind?: string): ProcessCutoffKind {
  return kind === "instant" || kind === "same_day" ? "instant" : "regular";
}

export function processCutoffRange(
  platform: string,
  kind: ProcessCutoffKind | string = "regular",
  now = new Date()
): { from: Date; to: Date; key: string; clock: ProcessCutoffClock } {
  const clock = cutoffClockFor(platform, cutoffInstant(kind));
  const dateKey = indonesiaDateKey(now);
  const startKey = cutoffReached(now, clock) ? dateKey : addCalendarDays(dateKey, -1);
  const endKey = addCalendarDays(startKey, 1);
  const stamp = `${pad2(clock.hour)}:${pad2(clock.minute)}:00`;
  return {
    clock,
    key: `${startKey}T${pad2(clock.hour)}:${pad2(clock.minute)}`,
    from: new Date(`${startKey}T${stamp}${INDONESIA_OFFSET}`),
    to: new Date(`${endKey}T${stamp}${INDONESIA_OFFSET}`),
  };
}

export function processCutoffQuerySpan(now = new Date()): { from: Date; to: Date } {
  const ranges = [
    processCutoffRange("shopee", "regular", now),
    processCutoffRange("tiktok", "regular", now),
    processCutoffRange("tiktok", "instant", now),
  ];
  return {
    from: new Date(Math.min(...ranges.map((range) => range.from.getTime()))),
    to: new Date(Math.max(...ranges.map((range) => range.to.getTime()))),
  };
}

export function inProcessCutoffWindow(
  platform: string,
  kind: ProcessCutoffKind | string,
  value: Date | string | null | undefined,
  now = new Date()
): boolean {
  if (value == null || value === "") return false;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(ms)) return false;
  const { from, to } = processCutoffRange(platform, kind, now);
  return ms >= from.getTime() && ms < to.getTime();
}

/** Jendela generik 15.01 (reguler). Untuk siklus kartu, pakai indonesiaOrderCutoffKey. */
export function indonesiaOrderCutoffRange(now = new Date()): { from: Date; to: Date; key: string } {
  const range = processCutoffRange("shopee", "regular", now);
  return { from: range.from, to: range.to, key: range.key };
}

/** Ganti siklus Order hari ini di 15.01 (semua channel) dan 17.01 (instant TikTok/Tokopedia). */
export function indonesiaOrderCutoffKey(now = new Date()): string {
  const regular = processCutoffRange("shopee", "regular", now);
  const instantTiktok = processCutoffRange("tiktok", "instant", now);
  return `${regular.key}|${instantTiktok.key}`;
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
