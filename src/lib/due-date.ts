import { Order } from "@/types/order";

const TZ = "Asia/Jakarta";
const URGENT_MS = 60 * 60 * 1000;

const SKIP_STATUS = new Set(["cancelled", "returned", "delivered", "shipped"]);

export type MarketplaceName = "Shopee" | "TikTok" | "Tokopedia";

export type CriticalLevel = "overdue" | "due_soon" | "instant" | null;

export interface DueDateRow {
  key: string;
  orderNumber: string;
  quantity: number;
  marketplace?: MarketplaceName;
  marketplaceOrder?: Order;
  jubelioOrder?: Order;
  marketplaceDue?: Date;
  jubelioDue?: Date;
  effectiveDue?: Date;
  remainingMs: number;
  remainingLabel: string;
  overdue: boolean;
  dueSoon: boolean;
  urgent: boolean;
  instant: boolean;
  critical: boolean;
  criticalLevel: CriticalLevel;
  preorder: boolean;
  courier: string;
  shipping: string;
  reason: string;
}

export interface DeadlineBucket {
  key: string;
  label: string;
  sortAt: number;
  orders: number;
  quantity: number;
  shopee: number;
  tiktok: number;
  jubelio: number;
  instant: number;
  sameDay: number;
}

export interface CourierStat {
  name: string;
  orders: number;
  quantity: number;
  urgentItems: number;
}

export interface DueDateOverview {
  analyzedAt: Date;
  todayKey: string;
  rows: DueDateRow[];
  totalOrders: number;
  totalItems: number;
  shopee: number;
  tiktok: number;
  jubelio: number;
  instant: number;
  urgent: number;
  overdue: number;
  dueSoon: number;
  critical: number;
  preorder: number;
  buckets: DeadlineBucket[];
  couriers: CourierStat[];
}

function toDate(value?: Date | string | null): Date | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return undefined;
  const year = d.getFullYear();
  if (year < 2020 || year > 2100) return undefined;
  return d;
}

export function dayKey(value?: Date | string | null): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function todayKey(now = new Date()): string {
  return dayKey(now)!;
}

export function formatDueLabel(value?: Date | string | null): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleString("id-ID", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAnalyzedAt(value: Date): string {
  return value.toLocaleString("id-ID", {
    timeZone: TZ,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function normalize(s: string): string {
  return s.replace(/[\s\-_.#]+/g, "").toUpperCase();
}

function marketplaceName(order?: Order): MarketplaceName | undefined {
  if (!order) return undefined;
  if (order.platform === "shopee") return "Shopee";
  const hint = [order.channelName, order.storeName, order.platform]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (hint.includes("tokopedia") || hint.includes("tokped") || order.platform === "tokopedia") {
    return "Tokopedia";
  }
  return "TikTok";
}

function isOpen(order: Order): boolean {
  return !SKIP_STATUS.has(order.status);
}

function isInstant(order?: Order): boolean {
  if (!order) return false;
  const text = `${order.courier || ""} ${order.shippingOption || ""}`.toLowerCase();
  if (/standard|reguler(?!\s*instant)|regular(?!\s*instant)/.test(text) && !/instant|instan|same[\s-]?day/.test(text)) {
    return false;
  }
  return /instant|instan|same[\s-]?day|sameday|gosend|grab\s*express|spx instant|anteraja instant|ninja instant/.test(text);
}

function isSameDayShip(order?: Order): boolean {
  if (!order) return false;
  const text = `${order.courier || ""} ${order.shippingOption || ""}`.toLowerCase();
  return /same[\s-]?day|sameday|hari ini|same day/.test(text);
}

function courierName(order?: Order): string {
  const raw = (order?.courier || order?.shippingOption || "").trim();
  return raw || "Kurir belum terisi";
}

function criticalReason(args: {
  overdue: boolean;
  dueSoon: boolean;
  instant: boolean;
  preorder: boolean;
  remainingLabel: string;
}): { level: CriticalLevel; reason: string } {
  if (args.overdue) {
    return { level: "overdue", reason: `Instant · Terlambat ${args.remainingLabel.replace(/^Terlambat\s+/, "")}` };
  }
  if (args.dueSoon) {
    return { level: "due_soon", reason: `Instant · Jatuh tempo ≤ 1 jam (${args.remainingLabel})` };
  }
  if (args.instant) {
    return { level: "instant", reason: "Instant / same-day" };
  }
  if (args.preorder) {
    return { level: null, reason: "Preorder — jatuh tempo hari ini" };
  }
  return { level: null, reason: "Antrian hari ini" };
}

function formatSpan(absMs: number, overdue: boolean): string {
  const prefix = overdue ? "Terlambat " : "";
  const mins = Math.round(absMs / 60000);
  if (mins < 60) return `${prefix}${Math.max(0, mins)}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${prefix}${hours}j ${rem}m` : `${prefix}${hours}j`;
  const days = Math.floor(hours / 24);
  const hoursLeft = hours % 24;
  if (days < 14 && hoursLeft > 0) return `${prefix}${days}h ${hoursLeft}j`;
  return `${prefix}${days}h`;
}

function remaining(deadline: Date | undefined, now: Date): { ms: number; label: string; overdue: boolean } {
  if (!deadline) return { ms: Number.POSITIVE_INFINITY, label: "—", overdue: false };
  const ms = deadline.getTime() - now.getTime();
  if (ms < 0) return { ms, label: formatSpan(Math.abs(ms), true), overdue: true };
  return { ms, label: formatSpan(ms, false), overdue: false };
}

function daysBetweenKeys(fromKey: string, toKey: string): number {
  const [ay, am, ad] = fromKey.split("-").map(Number);
  const [by, bm, bd] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function looksLikePreorder(order?: Order): boolean {
  if (!order) return false;
  if (order.isPreorder) return true;
  const type = (order.orderType || "").trim().toLowerCase();
  if (type && type !== "normal" && type !== "regular" && /pre[\s-]?order|preorder|pesanan pre/.test(type)) {
    return true;
  }
  const ordered = dayKey(order.orderDate);
  const due = dayKey(order.mustShipBefore);
  if (ordered && due && daysBetweenKeys(ordered, due) >= 2) return true;
  return false;
}

function isDueTodayOrPast(due: Date | undefined, today: string): boolean {
  const key = dayKey(due);
  return Boolean(key && key <= today);
}

function isRelevantToday(row: DueDateRow, today: string): boolean {
  const marketplacePo = looksLikePreorder(row.marketplaceOrder);
  const jubelioPo = looksLikePreorder(row.jubelioOrder);

  if (marketplacePo && row.marketplaceDue && !isDueTodayOrPast(row.marketplaceDue, today)) {
    return false;
  }

  if (!row.marketplaceOrder && jubelioPo && row.jubelioDue && !isDueTodayOrPast(row.jubelioDue, today)) {
    return false;
  }

  const mk = dayKey(row.marketplaceDue);
  const jk = dayKey(row.jubelioDue);
  return mk === today || jk === today || row.overdue;
}

function isPreorderDueToday(order?: Order, due?: Date, today?: string): boolean {
  if (!order || !due || !today) return false;
  return looksLikePreorder(order) && isDueTodayOrPast(due, today);
}

function matchOrders(jubelioOrders: Order[], platformOrders: Order[]) {
  const matchedJubelio = new Set<string>();
  const matchedPlatform = new Set<string>();
  const pairs: { jubelio: Order; platform: Order }[] = [];

  const byOrderNumber = new Map<string, Order[]>();
  const byTracking = new Map<string, Order[]>();
  for (const p of platformOrders) {
    const key = normalize(p.orderNumber);
    const list = byOrderNumber.get(key) || [];
    list.push(p);
    byOrderNumber.set(key, list);
    if (p.trackingNumber) {
      const t = normalize(p.trackingNumber);
      if (t.length >= 5) {
        const tList = byTracking.get(t) || [];
        tList.push(p);
        byTracking.set(t, tList);
      }
    }
  }

  const take = (j: Order, p: Order) => {
    if (matchedJubelio.has(j.id) || matchedPlatform.has(p.id)) return false;
    pairs.push({ jubelio: j, platform: p });
    matchedJubelio.add(j.id);
    matchedPlatform.add(p.id);
    return true;
  };

  for (const j of jubelioOrders) {
    if (j.refNo) {
      const candidates = byOrderNumber.get(normalize(j.refNo)) || [];
      if (candidates.some((p) => take(j, p))) continue;
    }
    const byNo = byOrderNumber.get(normalize(j.orderNumber)) || [];
    if (byNo.some((p) => take(j, p))) continue;
    if (j.trackingNumber) {
      const t = normalize(j.trackingNumber);
      if (t.length >= 5) {
        const byT = byTracking.get(t) || [];
        byT.some((p) => take(j, p));
      }
    }
  }

  return { pairs, matchedJubelio, matchedPlatform };
}

function buildRow(args: {
  marketplaceOrder?: Order;
  jubelioOrder?: Order;
  now: Date;
  today: string;
}): DueDateRow {
  const { marketplaceOrder, jubelioOrder, now, today } = args;
  const marketplaceDue = toDate(marketplaceOrder?.mustShipBefore);
  const jubelioDue = toDate(jubelioOrder?.mustShipBefore);
  const effectiveDue = marketplaceDue || jubelioDue;
  const remain = remaining(effectiveDue, now);
  const marketplace = marketplaceName(marketplaceOrder);
  const instant = isInstant(marketplaceOrder) || isInstant(jubelioOrder);
  const preorder =
    isPreorderDueToday(marketplaceOrder, marketplaceDue, today) ||
    isPreorderDueToday(jubelioOrder, jubelioDue, today);
  const dueSoon = !remain.overdue && remain.ms <= URGENT_MS;
  const critical = remain.overdue || dueSoon || instant;
  const { level, reason } = criticalReason({
    overdue: remain.overdue,
    dueSoon,
    instant,
    preorder,
    remainingLabel: remain.label,
  });

  const orderNumber =
    marketplaceOrder?.orderNumber ||
    jubelioOrder?.refNo ||
    jubelioOrder?.orderNumber ||
    "";

  return {
    key: marketplaceOrder?.id || jubelioOrder?.id || orderNumber,
    orderNumber,
    quantity: marketplaceOrder?.quantity || jubelioOrder?.quantity || 1,
    marketplace,
    marketplaceOrder,
    jubelioOrder,
    marketplaceDue,
    jubelioDue,
    effectiveDue,
    remainingMs: remain.ms,
    remainingLabel: remain.label,
    overdue: remain.overdue,
    dueSoon,
    urgent: critical,
    instant,
    critical,
    criticalLevel: level,
    preorder,
    courier: courierName(marketplaceOrder || jubelioOrder),
    shipping: (marketplaceOrder?.shippingOption || jubelioOrder?.shippingOption || "—").trim() || "—",
    reason,
  };
}

function bucketLabel(row: DueDateRow, now: Date): { key: string; label: string; sortAt: number } {
  if (row.overdue) {
    return { key: "overdue", label: "Instant · Terlambat — kirim sekarang", sortAt: 0 };
  }
  if (row.dueSoon) {
    return {
      key: "within-1h",
      label: `Instant · Jatuh tempo ≤ 1 jam — ${formatDueLabel(row.effectiveDue)}`,
      sortAt: 1,
    };
  }
  if (row.instant) {
    return {
      key: "instant",
      label: `Instant / same-day — ${formatDueLabel(row.effectiveDue)}`,
      sortAt: 2,
    };
  }
  if (!row.effectiveDue) {
    return { key: "no-due", label: "Tenggat belum terisi", sortAt: Number.POSITIVE_INFINITY };
  }
  return {
    key: dayKey(row.effectiveDue) + "-" + row.effectiveDue.getTime(),
    label: formatDueLabel(row.effectiveDue),
    sortAt: 10 + (row.effectiveDue.getTime() - now.getTime()),
  };
}

export function buildDueDateOverview(orders: Order[], now = new Date()): DueDateOverview {
  const today = todayKey(now);
  const open = orders.filter(isOpen);
  const jubelioOrders = open.filter((o) => o.platform === "jubelio");
  const platformOrders = open.filter(
    (o) => o.platform === "shopee" || o.platform === "tiktok" || o.platform === "tokopedia"
  );

  const { pairs, matchedJubelio, matchedPlatform } = matchOrders(jubelioOrders, platformOrders);
  const allRows: DueDateRow[] = [];

  for (const pair of pairs) {
    allRows.push(
      buildRow({
        marketplaceOrder: pair.platform,
        jubelioOrder: pair.jubelio,
        now,
        today,
      })
    );
  }
  for (const p of platformOrders) {
    if (matchedPlatform.has(p.id)) continue;
    allRows.push(buildRow({ marketplaceOrder: p, now, today }));
  }
  for (const j of jubelioOrders) {
    if (matchedJubelio.has(j.id)) continue;
    allRows.push(buildRow({ jubelioOrder: j, now, today }));
  }

  const rows = allRows
    .filter((row) => isRelevantToday(row, today))
    .sort((a, b) => {
      const rank = (row: DueDateRow) => {
        if (row.overdue) return 0;
        if (row.dueSoon) return 1;
        if (row.instant) return 2;
        return 3;
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.remainingMs - b.remainingMs;
    });

  const bucketsMap = new Map<string, DeadlineBucket>();
  for (const row of rows) {
    const meta = bucketLabel(row, now);
    let bucket = bucketsMap.get(meta.key);
    if (!bucket) {
      bucket = {
        key: meta.key,
        label: meta.label,
        sortAt: meta.sortAt,
        orders: 0,
        quantity: 0,
        shopee: 0,
        tiktok: 0,
        jubelio: 0,
        instant: 0,
        sameDay: 0,
      };
      bucketsMap.set(meta.key, bucket);
    }
    bucket.orders += 1;
    bucket.quantity += row.quantity;
    if (row.marketplace === "Shopee") bucket.shopee += 1;
    if (row.marketplace === "TikTok" || row.marketplace === "Tokopedia") bucket.tiktok += 1;
    if (row.jubelioOrder) bucket.jubelio += 1;
    if (row.instant) bucket.instant += 1;
    if (isSameDayShip(row.marketplaceOrder) || isSameDayShip(row.jubelioOrder)) bucket.sameDay += 1;
  }

  const courierMap = new Map<string, CourierStat>();
  for (const row of rows) {
    const current = courierMap.get(row.courier) || {
      name: row.courier,
      orders: 0,
      quantity: 0,
      urgentItems: 0,
    };
    current.orders += 1;
    current.quantity += row.quantity;
    if (row.critical) current.urgentItems += row.quantity;
    courierMap.set(row.courier, current);
  }

  return {
    analyzedAt: now,
    todayKey: today,
    rows,
    totalOrders: rows.length,
    totalItems: rows.reduce((sum, row) => sum + row.quantity, 0),
    shopee: rows.filter((r) => r.marketplace === "Shopee").length,
    tiktok: rows.filter((r) => r.marketplace === "TikTok" || r.marketplace === "Tokopedia").length,
    jubelio: rows.filter((r) => r.jubelioOrder).length,
    instant: rows.filter((r) => r.instant).length,
    urgent: rows.filter((r) => r.critical).length,
    overdue: rows.filter((r) => r.overdue).length,
    dueSoon: rows.filter((r) => r.dueSoon).length,
    critical: rows.filter((r) => r.critical).length,
    preorder: rows.filter((r) => r.preorder).length,
    buckets: Array.from(bucketsMap.values()).sort((a, b) => a.sortAt - b.sortAt),
    couriers: Array.from(courierMap.values()).sort((a, b) => b.orders - a.orders),
  };
}
