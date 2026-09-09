import { Order } from "@/types/order";
import { orderNumberKeys, trackingKeys } from "@/lib/order-match";

const TZ = "Asia/Jakarta";
const URGENT_MS = 60 * 60 * 1000;

const SKIP_STATUS = new Set(["cancelled", "returned", "delivered", "shipped"]);

export type MarketplaceName = "Shopee" | "TikTok" | "Tokopedia";

export type CriticalLevel = "overdue" | "due_soon" | "instant" | null;

export type ShippingKind = "regular" | "instant" | "same_day";

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
  shippingKind: ShippingKind;
  deadlineMismatch: boolean;
  critical: boolean;
  criticalLevel: CriticalLevel;
  preorder: boolean;
  courier: string;
  shipping: string;
  reason: string;
}

export interface ShippingBreakdown {
  total: number;
  regular: number;
  instant: number;
  sameDay: number;
}

export interface DeadlineBucket {
  key: string;
  label: string;
  sortAt: number;
  orders: number;
  shopee: ShippingBreakdown;
  tiktok: ShippingBreakdown;
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
  shopeeShipping: ShippingBreakdown;
  tiktokShipping: ShippingBreakdown;
  shipping: ShippingBreakdown;
  buckets: DeadlineBucket[];
  couriers: CourierStat[];
  mismatchRows: DueDateRow[];
  missingJubelioRows: DueDateRow[];
  jubelioOnlyRows: DueDateRow[];
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

function isMatchableJubelio(order: Order): boolean {
  return order.platform === "jubelio" && order.status !== "cancelled" && order.status !== "returned";
}

function indexByKeys(orders: Order[], keysOf: (order: Order) => string[]) {
  const map = new Map<string, Order[]>();
  for (const order of orders) {
    for (const key of keysOf(order)) {
      const list = map.get(key) || [];
      list.push(order);
      map.set(key, list);
    }
  }
  return map;
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

function classifyShipping(order?: Order): ShippingKind {
  if (isSameDayShip(order)) return "same_day";
  if (isInstant(order)) return "instant";
  return "regular";
}

function emptyShipping(): ShippingBreakdown {
  return { total: 0, regular: 0, instant: 0, sameDay: 0 };
}

function addShipping(stat: ShippingBreakdown, kind: ShippingKind) {
  stat.total += 1;
  if (kind === "regular") stat.regular += 1;
  else if (kind === "instant") stat.instant += 1;
  else stat.sameDay += 1;
}

function isDeadlineMismatch(marketplaceDue?: Date, jubelioDue?: Date): boolean {
  if (!marketplaceDue || !jubelioDue) return false;
  return dayKey(marketplaceDue) !== dayKey(jubelioDue);
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

function isMarketplaceRelevantToday(row: DueDateRow, today: string): boolean {
  if (!row.marketplaceOrder) return false;

  if (
    looksLikePreorder(row.marketplaceOrder) &&
    row.marketplaceDue &&
    !isDueTodayOrPast(row.marketplaceDue, today)
  ) {
    return false;
  }

  const mk = dayKey(row.marketplaceDue);
  if (!mk) return false;
  return mk === today || row.overdue;
}

function isDueOnQueueDate(order: Order, dateKey: string, now: Date): boolean {
  if (!isOpen(order)) return false;
  const due = toDate(order.mustShipBefore);
  const mk = dayKey(due);
  if (!mk) return false;
  const today = todayKey(now);
  if (dateKey === today) {
    if (looksLikePreorder(order) && due && !isDueTodayOrPast(due, today)) return false;
    return mk <= today;
  }
  return mk === dateKey;
}

/** Pesanan terbuka yang tenggatnya hari ini atau sudah lewat (antrian Kirim hari ini). */
export function isShipTodayQueueOrder(order: Order, now = new Date()): boolean {
  return isDueOnQueueDate(order, todayKey(now), now);
}

export function filterShipTodayQueue<T extends Order>(orders: T[], now = new Date()): T[] {
  return orders.filter((order) => isShipTodayQueueOrder(order, now));
}

/** Pesanan toko (bukan Jubelio) yang masih terbuka dan tenggatnya pada `dateKey` (YYYY-MM-DD, Asia/Jakarta). */
export function isMarketplaceShipOnDate(order: Order, dateKey: string, now = new Date()): boolean {
  if (order.platform === "jubelio") return false;
  return isDueOnQueueDate(order, dateKey, now);
}

export function isMarketplaceShipToday(order: Order, now = new Date()): boolean {
  return isMarketplaceShipOnDate(order, todayKey(now), now);
}

export function formatDayKeyLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.toLocaleDateString("id-ID", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isJubelioOnlyRelevantToday(row: DueDateRow, today: string): boolean {
  if (row.marketplaceOrder || !row.jubelioOrder) return false;
  if (
    looksLikePreorder(row.jubelioOrder) &&
    row.jubelioDue &&
    !isDueTodayOrPast(row.jubelioDue, today)
  ) {
    return false;
  }
  const jk = dayKey(row.jubelioDue);
  return jk === today || row.overdue;
}

function isPreorderDueToday(order?: Order, due?: Date, today?: string): boolean {
  if (!order || !due || !today) return false;
  return looksLikePreorder(order) && isDueTodayOrPast(due, today);
}

function matchOrders(jubelioOrders: Order[], platformOrders: Order[]) {
  const matchedJubelio = new Set<string>();
  const matchedPlatform = new Set<string>();
  const pairs: { jubelio: Order; platform: Order }[] = [];

  const byOrder = indexByKeys(platformOrders, orderNumberKeys);
  const byTracking = indexByKeys(platformOrders, trackingKeys);

  const takeAll = (j: Order, candidates: Order[]) => {
    let hit = false;
    const pool: Order[] = [];
    for (const p of candidates) {
      pool.push(p);
      for (const key of orderNumberKeys(p)) {
        pool.push(...(byOrder.get(key) || []));
      }
    }
    const seen = new Set<string>();
    for (const p of pool) {
      if (seen.has(p.id) || matchedPlatform.has(p.id)) continue;
      seen.add(p.id);
      pairs.push({ jubelio: j, platform: p });
      matchedJubelio.add(j.id);
      matchedPlatform.add(p.id);
      hit = true;
    }
    return hit;
  };

  for (const j of jubelioOrders) {
    const orderKeys = orderNumberKeys(j);
    if (orderKeys.some((key) => takeAll(j, byOrder.get(key) || []))) continue;
    trackingKeys(j).some((key) => takeAll(j, byTracking.get(key) || []));
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
  const queueOrder = marketplaceOrder || jubelioOrder;
  const effectiveDue = marketplaceOrder ? marketplaceDue : jubelioDue;
  const remain = remaining(effectiveDue, now);
  const marketplace = marketplaceName(marketplaceOrder);
  const shippingKind = classifyShipping(queueOrder);
  const instant = shippingKind === "instant" || shippingKind === "same_day";
  const deadlineMismatch = Boolean(marketplaceOrder && jubelioOrder && isDeadlineMismatch(marketplaceDue, jubelioDue));
  const preorder = marketplaceOrder
    ? isPreorderDueToday(marketplaceOrder, marketplaceDue, today)
    : isPreorderDueToday(jubelioOrder, jubelioDue, today);
  const dueSoon = !remain.overdue && remain.ms <= URGENT_MS;
  const critical = remain.overdue || dueSoon || instant;
  const { level, reason: baseReason } = criticalReason({
    overdue: remain.overdue,
    dueSoon,
    instant,
    preorder,
    remainingLabel: remain.label,
  });
  const reason = deadlineMismatch
    ? `${baseReason} · Tenggat marketplace ≠ Jubelio`
    : baseReason;

  const orderNumber =
    marketplaceOrder?.orderNumber ||
    jubelioOrder?.refNo ||
    jubelioOrder?.orderNumber ||
    "";

  return {
    key: marketplaceOrder?.id || jubelioOrder?.id || orderNumber,
    orderNumber,
    quantity: (marketplaceOrder ? marketplaceOrder.quantity : jubelioOrder?.quantity) || 1,
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
    shippingKind,
    deadlineMismatch,
    critical,
    criticalLevel: level,
    preorder,
    courier: courierName(queueOrder),
    shipping: (queueOrder?.shippingOption || "—").trim() || "—",
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
  const openJubelio = open.filter((o) => o.platform === "jubelio");
  const matchableJubelio = orders.filter(isMatchableJubelio);
  const platformOrders = open.filter(
    (o) => o.platform === "shopee" || o.platform === "tiktok" || o.platform === "tokopedia"
  );

  const { pairs, matchedJubelio, matchedPlatform } = matchOrders(matchableJubelio, platformOrders);
  const pairedAndPlatform: DueDateRow[] = [];
  const unmatchedJubelio: DueDateRow[] = [];

  for (const pair of pairs) {
    pairedAndPlatform.push(
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
    pairedAndPlatform.push(buildRow({ marketplaceOrder: p, now, today }));
  }
  for (const j of openJubelio) {
    if (matchedJubelio.has(j.id)) continue;
    unmatchedJubelio.push(buildRow({ jubelioOrder: j, now, today }));
  }

  const byUrgency = (a: DueDateRow, b: DueDateRow) => {
    const rank = (row: DueDateRow) => {
      if (row.overdue) return 0;
      if (row.dueSoon) return 1;
      if (row.instant) return 2;
      return 3;
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return a.remainingMs - b.remainingMs;
  };

  const rows = pairedAndPlatform
    .filter((row) => Boolean(row.marketplaceOrder) && isMarketplaceRelevantToday(row, today))
    .sort(byUrgency);
  const jubelioOnlyRows = unmatchedJubelio
    .filter((row) => isJubelioOnlyRelevantToday(row, today))
    .sort(byUrgency);
  const missingJubelioRows = rows.filter((row) => !row.jubelioOrder);
  const mismatchRows = rows.filter((row) => row.deadlineMismatch);

  const bucketsMap = new Map<string, DeadlineBucket>();
  const shopeeShipping = emptyShipping();
  const tiktokShipping = emptyShipping();
  const shipping = emptyShipping();

  for (const row of rows) {
    const meta = bucketLabel(row, now);
    let bucket = bucketsMap.get(meta.key);
    if (!bucket) {
      bucket = {
        key: meta.key,
        label: meta.label,
        sortAt: meta.sortAt,
        orders: 0,
        shopee: emptyShipping(),
        tiktok: emptyShipping(),
      };
      bucketsMap.set(meta.key, bucket);
    }
    if (row.marketplace === "Shopee") {
      bucket.orders += 1;
      addShipping(shipping, row.shippingKind);
      addShipping(bucket.shopee, row.shippingKind);
      addShipping(shopeeShipping, row.shippingKind);
    } else if (row.marketplace === "TikTok" || row.marketplace === "Tokopedia") {
      bucket.orders += 1;
      addShipping(shipping, row.shippingKind);
      addShipping(bucket.tiktok, row.shippingKind);
      addShipping(tiktokShipping, row.shippingKind);
    }
  }

  const courierMap = new Map<string, CourierStat>();
  for (const row of rows) {
    if (row.marketplace !== "Shopee" && row.marketplace !== "TikTok" && row.marketplace !== "Tokopedia") {
      continue;
    }
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

  const shopee = rows.filter((r) => r.marketplace === "Shopee").length;
  const tiktok = rows.filter((r) => r.marketplace === "TikTok" || r.marketplace === "Tokopedia").length;

  return {
    analyzedAt: now,
    todayKey: today,
    rows,
    totalOrders: shopee + tiktok,
    totalItems: rows.reduce((sum, row) => sum + row.quantity, 0),
    shopee,
    tiktok,
    jubelio: rows.filter((r) => r.jubelioOrder).length,
    instant: rows.filter((r) => r.instant).length,
    urgent: rows.filter((r) => r.critical).length,
    overdue: rows.filter((r) => r.overdue).length,
    dueSoon: rows.filter((r) => r.dueSoon).length,
    critical: rows.filter((r) => r.critical).length,
    preorder: rows.filter((r) => r.preorder).length,
    shopeeShipping,
    tiktokShipping,
    shipping,
    buckets: Array.from(bucketsMap.values()).filter((bucket) => bucket.orders > 0).sort((a, b) => a.sortAt - b.sortAt),
    couriers: Array.from(courierMap.values()).sort((a, b) => b.orders - a.orders),
    mismatchRows,
    missingJubelioRows,
    jubelioOnlyRows,
  };
}
