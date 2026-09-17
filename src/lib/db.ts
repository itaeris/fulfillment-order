import { supabase } from "./supabase";
import { addCalendarDays, INDONESIA_OFFSET, indonesiaDateKey, indonesiaOrderCutoffKey, inProcessCutoffWindow, processCutoffQuerySpan } from "./timezone";
import { lookupMatchKeys, expandMatchKeys } from "./order-match";
import { classifyShipping, isAheadPackOrder } from "./due-date";
import type { Order } from "@/types/order";

const PAGE_SIZE = 1000;

function applyPagedFilters(
  query: any,
  options?: {
    eq?: { column: string; value: string };
    ins?: { column: string; values: string[] }[];
    orderColumn?: string | null;
  }
) {
  if (options?.eq) query = query.eq(options.eq.column, options.eq.value);
  if (options?.ins) {
    for (const filter of options.ins) {
      query = query.in(filter.column, filter.values);
    }
  }
  if (options?.orderColumn) {
    query = query.order(options.orderColumn, { ascending: false }).order("id", { ascending: true });
  } else {
    query = query.order("id", { ascending: true });
  }
  return query;
}

async function fetchPage(
  table: string,
  select: string,
  from: number,
  options?: {
    eq?: { column: string; value: string };
    ins?: { column: string; values: string[] }[];
    orderColumn?: string | null;
  }
) {
  const { data, error } = await applyPagedFilters(
    supabase.from(table).select(select),
    options
  ).range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return data ?? [];
}

async function fetchPagedRowsProgressive(
  table: string,
  select = "*",
  options?: {
    eq?: { column: string; value: string };
    ins?: { column: string; values: string[] }[];
    orderColumn?: string | null;
  },
  onChunk?: (rows: any[], done: boolean) => void
) {
  const rows: any[] = [];
  const first = await fetchPage(table, select, 0, options);
  rows.push(...first);
  if (first.length < PAGE_SIZE) {
    onChunk?.(rows, true);
    return rows;
  }
  onChunk?.(rows, false);

  let from = PAGE_SIZE;
  while (true) {
    const starts = [from, from + PAGE_SIZE, from + PAGE_SIZE * 2];
    const wave = await Promise.all(
      starts.map((start) => fetchPage(table, select, start, options))
    );
    let done = false;
    for (const page of wave) {
      rows.push(...page);
      if (page.length < PAGE_SIZE) {
        done = true;
        break;
      }
    }
    onChunk?.(rows, done);
    if (done) return rows;
    from += PAGE_SIZE * 3;
  }
}

async function fetchPagedRows(
  table: string,
  select = "*",
  options?: {
    eq?: { column: string; value: string };
    ins?: { column: string; values: string[] }[];
    orderColumn?: string | null;
  }
) {
  return fetchPagedRowsProgressive(table, select, options);
}

// ── Order operations ──

export async function getAllOrders() {
  const allRows = await fetchPagedRows("orders", "*", { orderColumn: "order_date" });
  return allRows.map(rowToOrder);
}

export async function getAllOrdersProgressive(
  onChunk: (orders: Order[], done: boolean) => void
) {
  let last: Order[] = [];
  await fetchPagedRowsProgressive("orders", "*", { orderColumn: "order_date" }, (rows, done) => {
    last = rows.map(rowToOrder);
    onChunk(last, done);
  });
  return last;
}

export async function searchOrdersByNumber(query: string) {
  const raw = String(query || "").trim();
  if (!raw) return [];
  const keys = Array.from(
    new Set(
      lookupMatchKeys(raw)
        .map((key) => key.replace(/[%_(),]/g, "").slice(0, 40))
        .filter((key) => key.length >= 5)
    )
  ).slice(0, 8);
  if (keys.length === 0) return [];
  const clauses = keys.flatMap((key) => [`order_number.ilike.%${key}%`, `tracking_number.ilike.%${key}%`]);
  const { data, error } = await supabase.from("orders").select("*").or(clauses.join(",")).limit(50);
  if (error) throw error;
  return (data ?? []).map(rowToOrder);
}

export async function getMarketplaceOrdersMovedOn(dateKey: string) {
  const start = `${dateKey}T00:00:00+07:00`;
  const end = `${dateKey}T23:59:59+07:00`;
  const platforms = ["shopee", "tiktok", "tokopedia"];
  const movedFilter = `pickup_time.gte.${start},shipped_time.gte.${start},must_ship_before.gte.${start}`;
  const ordersRes = await supabase
    .from("orders")
    .select("*")
    .in("platform", platforms)
    .in("status", ["shipped", "delivered"])
    .or(movedFilter);
  if (ordersRes.error) throw ordersRes.error;

  const liveRes = await supabase
    .from("live_order_status")
    .select("*")
    .in("platform", platforms)
    .in("status", ["shipped", "delivered"])
    .or(movedFilter);
  if (liveRes.error) throw liveRes.error;

  const fromOrders = (ordersRes.data ?? []).map(rowToOrder);
  const fromLive = (liveRes.data ?? []).map((row) =>
    rowToOrder({
      id: `live-${row.platform}-${row.order_number}`,
      order_number: row.order_number,
      platform: row.platform,
      customer_name: "",
      product_name: "",
      quantity: 1,
      price: 0,
      total_amount: 0,
      status: row.status,
      order_date: row.updated_at || start,
      shipped_time: row.shipped_time,
      must_ship_before: row.must_ship_before || end,
      pickup_time: row.pickup_time,
      tracking_number: row.tracking_number,
      courier: row.courier,
      shipping_option: row.shipping_option,
      ref_no: row.ref_no,
    })
  );
  return { fromOrders, fromLive };
}

export type MarketplacePlacedToday = {
  dateKey: string;
  total: number;
  shopee: number;
  tiktok: number;
  cancelled: number;
};

export type MarketplacePlacedTodayOrder = {
  orderNumber: string;
  platform: string;
  status: string;
  orderDate?: string;
  paidTime?: string;
  courier?: string;
  shippingOption?: string;
};

async function collectMarketplacePlacedToday(now = new Date()): Promise<{
  summary: MarketplacePlacedToday;
  orders: MarketplacePlacedTodayOrder[];
}> {
  const { from, to } = processCutoffQuerySpan(now);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const platforms = ["shopee", "tiktok", "tokopedia"];
  const select = "order_number, platform, status, order_date, paid_time, courier, shipping_option";

  const byOrderDate = await supabase
    .from("orders")
    .select(select)
    .in("platform", platforms)
    .gte("order_date", fromIso)
    .lt("order_date", toIso);
  if (byOrderDate.error) throw byOrderDate.error;

  const byPaidTime = await supabase
    .from("orders")
    .select(select)
    .in("platform", platforms)
    .gte("paid_time", fromIso)
    .lt("paid_time", toIso);
  if (byPaidTime.error) throw byPaidTime.error;

  const seen = new Set<string>();
  let shopee = 0;
  let tiktok = 0;
  let cancelled = 0;
  const orders: MarketplacePlacedTodayOrder[] = [];

  const consider = (row: {
    order_number?: string;
    platform?: string;
    status?: string;
    order_date?: string;
    paid_time?: string;
    courier?: string;
    shipping_option?: string;
  }) => {
    const platform = String(row.platform || "");
    const kind = classifyShipping({
      courier: row.courier,
      shippingOption: row.shipping_option,
    });
    const inWindow =
      inProcessCutoffWindow(platform, kind, row.order_date, now) ||
      inProcessCutoffWindow(platform, kind, row.paid_time, now);
    if (!inWindow) return;
    const number = String(row.order_number || "").trim().toUpperCase();
    if (!number) return;
    const seenKey = `${platform}|${number}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);
    const status = String(row.status || "").toLowerCase();
    if (status === "pending") return;
    if (status === "cancelled" || status === "returned") {
      cancelled += 1;
      return;
    }
    if (platform === "shopee") shopee += 1;
    else tiktok += 1;
    orders.push({
      orderNumber: String(row.order_number || "").trim(),
      platform,
      status,
      orderDate: row.order_date,
      paidTime: row.paid_time,
      courier: row.courier,
      shippingOption: row.shipping_option,
    });
  };

  for (const row of byOrderDate.data ?? []) consider(row);
  for (const row of byPaidTime.data ?? []) consider(row);

  orders.sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    return a.orderNumber.localeCompare(b.orderNumber);
  });

  return {
    summary: {
      dateKey: indonesiaOrderCutoffKey(now),
      total: shopee + tiktok,
      shopee,
      tiktok,
      cancelled,
    },
    orders,
  };
}

export async function countMarketplacePlacedToday(
  now = new Date()
): Promise<MarketplacePlacedToday> {
  const { summary } = await collectMarketplacePlacedToday(now);
  return summary;
}

export async function listMarketplacePlacedToday(now = new Date()) {
  return collectMarketplacePlacedToday(now);
}

export async function getOpenMarketplaceAheadOrders(now = new Date()) {
  const from = `${addCalendarDays(indonesiaDateKey(now), 1)}T00:00:00${INDONESIA_OFFSET}`;
  const rows: any[] = [];
  for (let fromIdx = 0; ; fromIdx += PAGE_SIZE) {
    const page = await supabase
      .from("orders")
      .select("*")
      .in("platform", ["shopee", "tiktok", "tokopedia"])
      .not("status", "in", "(cancelled,returned,shipped,delivered)")
      .gte("must_ship_before", from)
      .order("must_ship_before", { ascending: true })
      .order("id", { ascending: true })
      .range(fromIdx, fromIdx + PAGE_SIZE - 1);
    if (page.error) throw page.error;
    const chunk = page.data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows.map(rowToOrder).filter((order) => isAheadPackOrder(order, now));
}

export async function countOrdersByPlatform(platform: string) {
  const { count, error } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("platform", platform);
  if (error) throw error;
  return count ?? 0;
}

export async function getOrderIdsByPlatform(platform: string) {
  const rows = await fetchPagedRows("orders", "id", {
    eq: { column: "platform", value: platform },
    orderColumn: null,
  });
  return rows.map((row) => row.id).filter(Boolean);
}

export async function countOrdersByPlatforms(platforms: string[]) {
  if (platforms.length === 0) return 0;
  const { count, error } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .in("platform", platforms);
  if (error) throw error;
  return count ?? 0;
}

export async function findExistingOrderIds(ids: string[]) {
  const found = new Set<string>();
  if (ids.length === 0) return found;
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.from("orders").select("id").in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.id) found.add(row.id);
    }
  }
  return found;
}

export async function findExistingOrderNumbers(platforms: string[], orderNumbers: string[]) {
  const statuses = await findExistingOrderStatuses(platforms, orderNumbers);
  return new Set(Array.from(statuses.keys()));
}

export async function findExistingOrderStatuses(platforms: string[], orderNumbers: string[]) {
  const found = new Map<string, string>();
  if (orderNumbers.length === 0 || platforms.length === 0) return found;
  const CHUNK = 100;
  for (let i = 0; i < orderNumbers.length; i += CHUNK) {
    const chunk = orderNumbers.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("orders")
      .select("order_number, status")
      .in("platform", platforms)
      .in("order_number", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.order_number) found.set(row.order_number, String(row.status || ""));
    }
  }
  return found;
}

export async function getOpenOrderNumbersByPlatforms(
  platforms: string[],
  statuses: string[] = ["pending", "processing"]
) {
  if (platforms.length === 0) return [];
  const rows = await fetchPagedRows("orders", "order_number", {
    ins: [
      { column: "platform", values: platforms },
      { column: "status", values: statuses },
    ],
    orderColumn: null,
  });
  return Array.from(new Set(rows.map((row) => row.order_number).filter(Boolean)));
}

export async function updateOrdersFulfillment(
  platforms: string[],
  patches: {
    id?: string;
    orderNumber: string;
    platform?: string;
    status: string;
    trackingNumber?: string;
    courier?: string;
    shippingOption?: string;
    shippedTime?: string;
    mustShipBefore?: string;
    pickupTime?: string;
    refNo?: string;
  }[]
) {
  if (platforms.length === 0 || patches.length === 0) return;

  const CONCURRENCY = 8;
  let index = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, patches.length) }, async () => {
    while (index < patches.length) {
      const patch = patches[index++];
      const fields: Record<string, string | null> = {
        status: patch.status,
      };
      if (patch.trackingNumber) fields.tracking_number = patch.trackingNumber;
      if (patch.courier) fields.courier = patch.courier;
      if (patch.shippingOption) fields.shipping_option = patch.shippingOption;
      if (patch.shippedTime) fields.shipped_time = patch.shippedTime;

      if (patch.id) {
        const byId = await supabase.from("orders").update(fields).eq("id", patch.id);
        if (byId.error) throw byId.error;
      }

      const { error } = await supabase
        .from("orders")
        .update(fields)
        .in("platform", platforms)
        .eq("order_number", patch.orderNumber);
      if (error) throw error;

      const targetPlatforms = patch.platform ? [patch.platform] : platforms;
      const overviewRes = await supabase
        .from("overview_orders")
        .update(fields)
        .in("platform", targetPlatforms)
        .eq("order_number", patch.orderNumber);
      if (overviewRes.error) {
        // Tabel overview belum ada, atau tidak ada baris yang cocok.
      }
    }
  });
  await Promise.all(workers);

  await upsertLiveOrderStatuses(
    patches.map((patch) => ({
      ...patch,
      platform: patch.platform || platforms[0],
    }))
  ).catch((error) => {
    console.error("live_order_status upsert skipped:", error);
  });
}

export type LiveOrderStatus = {
  orderNumber: string;
  platform: string;
  status: string;
  trackingNumber?: string;
  courier?: string;
  shippingOption?: string;
  shippedTime?: string;
  mustShipBefore?: string;
  pickupTime?: string;
  refNo?: string;
  updatedAt?: string;
};

export async function upsertLiveOrderStatuses(patches: LiveOrderStatus[]) {
  if (patches.length === 0) return;
  const rows = patches.map((patch) => ({
    order_number: patch.orderNumber,
    platform: patch.platform,
    status: patch.status,
    tracking_number: patch.trackingNumber ?? null,
    courier: patch.courier ?? null,
    shipping_option: patch.shippingOption ?? null,
    shipped_time: patch.shippedTime ?? null,
    must_ship_before: patch.mustShipBefore ?? null,
    pickup_time: patch.pickupTime ?? null,
    ref_no: patch.refNo ?? null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("live_order_status").upsert(rows, {
    onConflict: "order_number,platform",
  });
  if (error) throw error;
}

export async function getLiveOrderStatuses(numbers: string[]): Promise<LiveOrderStatus[]> {
  const unique = Array.from(new Set(numbers.map((n) => String(n).trim()).filter(Boolean)));
  if (unique.length === 0) return [];
  const found: LiveOrderStatus[] = [];
  const seen = new Set<string>();
  const push = (row: {
    order_number?: string;
    platform?: string;
    status?: string;
    tracking_number?: string;
    courier?: string;
    shipping_option?: string;
    shipped_time?: string;
    must_ship_before?: string;
    pickup_time?: string;
    ref_no?: string;
    updated_at?: string;
  }) => {
    const key = `${row.platform}|${row.order_number}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({
      orderNumber: row.order_number || "",
      platform: row.platform || "",
      status: row.status || "",
      trackingNumber: row.tracking_number,
      courier: row.courier,
      shippingOption: row.shipping_option,
      shippedTime: row.shipped_time,
      mustShipBefore: row.must_ship_before,
      pickupTime: row.pickup_time,
      refNo: row.ref_no,
      updatedAt: row.updated_at,
    });
  };

  const CHUNK = 100;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const byNumber = await supabase.from("live_order_status").select("*").in("order_number", chunk);
    if (byNumber.error) throw byNumber.error;
    for (const row of byNumber.data ?? []) push(row);
    const byRef = await supabase.from("live_order_status").select("*").in("ref_no", chunk);
    if (byRef.error) throw byRef.error;
    for (const row of byRef.data ?? []) push(row);
  }
  return found;
}

export async function getOrderNumbersByPlatforms(platforms: string[]) {
  if (platforms.length === 0) return [];
  const rows = await fetchPagedRows("orders", "order_number", {
    ins: [{ column: "platform", values: platforms }],
    orderColumn: null,
  });
  return Array.from(new Set(rows.map((row) => row.order_number).filter(Boolean)));
}

export async function deleteOrdersByIds(ids: string[]) {
  if (ids.length === 0) return;
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await supabase.from("orders").delete().in("id", chunk);
    if (error) throw error;
  }
}

export async function deleteOrdersByOrderNumbers(platforms: string[], orderNumbers: string[]) {
  if (orderNumbers.length === 0 || platforms.length === 0) return;
  const CHUNK = 100;
  for (let i = 0; i < orderNumbers.length; i += CHUNK) {
    const chunk = orderNumbers.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("orders")
      .delete()
      .in("platform", platforms)
      .in("order_number", chunk);
    if (error) throw error;
  }
}

export async function getOrdersByPlatform(platform: string) {
  const allRows = await fetchPagedRows("orders", "*", {
    eq: { column: "platform", value: platform },
    orderColumn: "order_date",
  });
  return allRows.map(rowToOrder);
}

export async function insertOrder(order: OrderInput) {
  const row = orderToRow(order);
  const { error } = await supabase.from("orders").upsert(row);
  if (error) throw error;
}

export async function insertOrders(orders: OrderInput[]) {
  if (orders.length === 0) return;
  const rows = orders.map(orderToRow);

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("orders").upsert(batch);
    if (error) throw error;
  }
}

export async function deleteAllOrders() {
  const { error } = await supabase.from("orders").delete().neq("id", "");
  if (error) throw error;
}

export async function deleteOrdersByPlatform(platform: string) {
  const { error } = await supabase.from("orders").delete().eq("platform", platform);
  if (error) throw error;
}

// ── Uploaded files operations ──

export async function getAllUploadedFiles() {
  const { data, error } = await supabase
    .from("uploaded_files")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToFile);
}

export async function insertUploadedFile(file: {
  name: string;
  platform: string;
  orderCount: number;
}) {
  const { error } = await supabase.from("uploaded_files").upsert(
    {
      name: file.name,
      platform: file.platform,
      order_count: file.orderCount,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "name" }
  );
  if (error) throw error;
}

export async function deleteUploadedFile(name: string) {
  const { error } = await supabase.from("uploaded_files").delete().eq("name", name);
  if (error) throw error;
}

export async function deleteAllUploadedFiles() {
  const { error } = await supabase.from("uploaded_files").delete().neq("id", "0");
  if (error) throw error;
}

export async function deleteUploadedFilesByPlatform(platform: string) {
  const { error } = await supabase.from("uploaded_files").delete().eq("platform", platform);
  if (error) throw error;
}

// ── Kirim hari ini (overview_orders / overview_files) ──

export async function getAllOverviewOrders() {
  const allRows = await fetchPagedRows("overview_orders", "*", { orderColumn: "order_date" });
  return allRows.map(rowToOrder);
}

export async function countOverviewOrdersByPlatforms(platforms: string[]) {
  if (platforms.length === 0) return 0;
  const { count, error } = await supabase
    .from("overview_orders")
    .select("*", { count: "exact", head: true })
    .in("platform", platforms);
  if (error) throw error;
  return count ?? 0;
}

export async function insertOverviewOrders(orders: OrderInput[]) {
  if (orders.length === 0) return;
  const unique = new Map<string, ReturnType<typeof overviewOrderToRow>>();
  for (const order of orders) {
    const row = overviewOrderToRow(order);
    unique.set(row.id, row);
  }
  const rows = Array.from(unique.values());
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("overview_orders").upsert(batch);
    if (error) throw error;
  }
}

export async function deleteOverviewOrdersByPlatforms(platforms: string[]) {
  if (platforms.length === 0) return;
  const { error } = await supabase.from("overview_orders").delete().in("platform", platforms);
  if (error) throw error;
}

export async function deleteOverviewOrdersByIds(ids: string[]) {
  if (ids.length === 0) return;
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await supabase.from("overview_orders").delete().in("id", ids.slice(i, i + CHUNK));
    if (error) throw error;
  }
}

export async function deleteOverviewOrdersByNumbers(numbers: string[]) {
  const unique = Array.from(new Set(numbers.map((value) => String(value || "").trim()).filter(Boolean)));
  if (unique.length === 0) return;
  const CHUNK = 100;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { error } = await supabase.from("overview_orders").delete().in("order_number", chunk);
    if (error) throw error;
  }
}

export async function deleteAllOverviewOrders() {
  const { error } = await supabase.from("overview_orders").delete().neq("id", "");
  if (error) throw error;
}

export async function replaceOverviewOrdersByPlatforms(platforms: string[], orders: OrderInput[]) {
  await deleteOverviewOrdersByPlatforms(platforms);
  await insertOverviewOrders(orders);
  return getAllOverviewOrders();
}

export async function updateOverviewOrdersFulfillment(
  platforms: string[],
  patches: {
    id?: string;
    orderNumber: string;
    platform?: string;
    status: string;
    trackingNumber?: string;
    courier?: string;
    shippingOption?: string;
    shippedTime?: string;
    mustShipBefore?: string;
    pickupTime?: string;
    refNo?: string;
  }[]
) {
  if (platforms.length === 0 || patches.length === 0) return;
  for (const patch of patches) {
    const fields: Record<string, string | null> = {
      status: patch.status,
    };
    if (patch.trackingNumber) fields.tracking_number = patch.trackingNumber;
    if (patch.courier) fields.courier = patch.courier;
    if (patch.shippingOption) fields.shipping_option = patch.shippingOption;
    if (patch.shippedTime) fields.shipped_time = patch.shippedTime;

    const targetPlatforms = patch.platform ? [patch.platform] : platforms;
    const { error } = await supabase
      .from("overview_orders")
      .update(fields)
      .in("platform", targetPlatforms)
      .eq("order_number", patch.orderNumber);
    if (error) throw error;
  }
}

export async function getAllOverviewFiles() {
  const { data, error } = await supabase
    .from("overview_files")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToFile);
}

export async function insertOverviewFile(file: {
  name: string;
  platform: string;
  orderCount: number;
  uploadedAt?: string | Date;
}) {
  const uploadedAt =
    file.uploadedAt instanceof Date
      ? file.uploadedAt.toISOString()
      : file.uploadedAt || new Date().toISOString();
  const { error } = await supabase.from("overview_files").upsert(
    {
      name: file.name,
      platform: file.platform,
      order_count: file.orderCount,
      uploaded_at: uploadedAt,
    },
    { onConflict: "name" }
  );
  if (error) throw error;
}

export async function deleteAllOverviewFiles() {
  const { error } = await supabase.from("overview_files").delete().neq("id", "0");
  if (error) throw error;
}

export async function clearOverviewData() {
  await deleteAllOverviewOrders();
  await deleteAllOverviewFiles();
}

// ── Row ↔ App mapping helpers ──

interface OrderInput {
  id: string;
  orderNumber: string;
  platform: string;
  customerName?: string;
  recipientName?: string;
  productName?: string;
  variation?: string;
  sku?: string;
  quantity?: number;
  originalPrice?: number;
  price?: number;
  totalAmount?: number;
  status?: string;
  orderDate?: string;
  paidTime?: string;
  shippedTime?: string;
  mustShipBefore?: string;
  shippingAddress?: string;
  city?: string;
  province?: string;
  trackingNumber?: string;
  shippingOption?: string;
  courier?: string;
  phone?: string;
  notes?: string;
  weight?: number;
  channelName?: string;
  storeName?: string;
  refNo?: string;
  pickupTime?: string;
  orderType?: string;
  isPreorder?: boolean;
}

function orderToRow(o: OrderInput) {
  return {
    id: o.id,
    order_number: o.orderNumber,
    platform: o.platform,
    customer_name: o.customerName ?? null,
    recipient_name: o.recipientName ?? null,
    product_name: o.productName ?? null,
    variation: o.variation ?? null,
    sku: o.sku ?? null,
    quantity: o.quantity ?? 1,
    original_price: o.originalPrice ?? null,
    price: o.price ?? null,
    total_amount: o.totalAmount ?? null,
    status: o.status ?? null,
    order_date: o.orderDate ?? null,
    paid_time: o.paidTime ?? null,
    shipped_time: o.shippedTime ?? null,
    must_ship_before: o.mustShipBefore ?? null,
    shipping_address: o.shippingAddress ?? null,
    city: o.city ?? null,
    province: o.province ?? null,
    tracking_number: o.trackingNumber ?? null,
    shipping_option: o.shippingOption ?? null,
    courier: o.courier ?? null,
    phone: o.phone ?? null,
    notes: o.notes ?? null,
    weight: o.weight ?? null,
    channel_name: o.channelName ?? null,
    store_name: o.storeName ?? null,
    ref_no: o.refNo ?? null,
    pickup_time: o.pickupTime ?? null,
  };
}

function overviewOrderToRow(o: OrderInput) {
  return {
    ...orderToRow(o),
    order_type: o.orderType ?? null,
    is_preorder: o.isPreorder ?? false,
  };
}

function rowToOrder(r: any) {
  return {
    id: r.id,
    orderNumber: r.order_number,
    platform: r.platform,
    customerName: r.customer_name,
    recipientName: r.recipient_name,
    productName: r.product_name,
    variation: r.variation,
    sku: r.sku,
    quantity: r.quantity,
    originalPrice: r.original_price,
    price: r.price,
    totalAmount: r.total_amount,
    status: r.status,
    orderDate: r.order_date,
    paidTime: r.paid_time,
    shippedTime: r.shipped_time,
    mustShipBefore: r.must_ship_before,
    shippingAddress: r.shipping_address,
    city: r.city,
    province: r.province,
    trackingNumber: r.tracking_number,
    shippingOption: r.shipping_option,
    courier: r.courier,
    phone: r.phone,
    notes: r.notes,
    weight: r.weight,
    channelName: r.channel_name,
    storeName: r.store_name,
    refNo: r.ref_no,
    pickupTime: r.pickup_time,
    createdAt: r.created_at,
    orderType: r.order_type,
    isPreorder: r.is_preorder == null ? undefined : Boolean(r.is_preorder),
  };
}

function rowToFile(r: any) {
  return {
    name: r.name,
    platform: r.platform,
    uploadedAt: r.uploaded_at,
    orderCount: r.order_count,
  };
}

// ── Validasi scan kirim hari ini (overdue_scans) ──

export type OverdueScanRow = {
  id: string;
  scannedCode: string;
  orderId?: string;
  orderNumber?: string;
  platform?: string;
  matched: boolean;
  result?: string;
  scannedAt: Date;
  scannedBy?: string;
  scanDate: string;
};

function rowToOverdueScan(r: any): OverdueScanRow {
  return {
    id: r.id,
    scannedCode: r.scanned_code,
    orderId: r.order_id || undefined,
    orderNumber: r.order_number || undefined,
    platform: r.platform || undefined,
    matched: Boolean(r.matched),
    result: r.result || undefined,
    scannedAt: r.scanned_at ? new Date(r.scanned_at) : new Date(),
    scannedBy: r.scanned_by || undefined,
    scanDate: String(r.scan_date || "").slice(0, 10),
  };
}

export async function getOverdueScans(scanDate: string): Promise<OverdueScanRow[]> {
  await purgeDuplicateAheadScans(scanDate);
  const { data, error } = await supabase
    .from("overdue_scans")
    .select("*")
    .eq("scan_date", scanDate)
    .order("scanned_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToOverdueScan);
}

export async function purgeDuplicateAheadScans(scanDate: string) {
  const { data, error } = await supabase
    .from("overdue_scans")
    .select("id, order_number, scanned_code, platform, result")
    .eq("scan_date", scanDate)
    .eq("result", "ahead");
  if (error) throw error;
  const rows = data ?? [];
  const idsToDelete: string[] = [];
  const seen = new Set<string>();
  const ranked = [
    ...rows.filter((row) => row.platform !== "jubelio"),
    ...rows.filter((row) => row.platform === "jubelio"),
  ];
  for (const row of ranked) {
    const keys = expandMatchKeys(String(row.order_number || row.scanned_code || ""));
    const isJubelio = String(row.platform || "") === "jubelio";
    const duplicate = isJubelio || keys.some((key) => seen.has(key));
    if (duplicate) idsToDelete.push(String(row.id));
    else for (const key of keys) seen.add(key);
  }
  if (idsToDelete.length === 0) return;
  const { error: delError } = await supabase.from("overdue_scans").delete().in("id", idsToDelete);
  if (delError) throw delError;
}

export async function findMatchedOverdueScan(
  scanDate: string,
  orderId: string
): Promise<OverdueScanRow | null> {
  const { data, error } = await supabase
    .from("overdue_scans")
    .select("*")
    .eq("scan_date", scanDate)
    .eq("order_id", orderId)
    .eq("matched", true)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToOverdueScan(data) : null;
}

export async function insertOverdueScan(input: {
  id: string;
  scannedCode: string;
  orderId?: string;
  orderNumber?: string;
  platform?: string;
  matched: boolean;
  result?: string;
  scannedBy?: string;
  scanDate: string;
}): Promise<OverdueScanRow> {
  const payload: Record<string, unknown> = {
    id: input.id,
    scanned_code: input.scannedCode,
    order_id: input.orderId || null,
    order_number: input.orderNumber || null,
    platform: input.platform || null,
    matched: input.matched,
    result: input.result || (input.matched ? "valid" : "not_in_queue"),
    scanned_by: input.scannedBy || null,
    scan_date: input.scanDate,
  };
  const first = await supabase.from("overdue_scans").insert(payload).select().single();
  if (!first.error) return rowToOverdueScan(first.data);
  if (String(first.error.message || "").includes("result")) {
    delete payload.result;
    const retry = await supabase.from("overdue_scans").insert(payload).select().single();
    if (retry.error) throw retry.error;
    return rowToOverdueScan(retry.data);
  }
  throw first.error;
}

export async function updateOverdueScanResult(
  id: string,
  result: string,
  scannedCode?: string,
  scannedBy?: string
): Promise<OverdueScanRow> {
  const fields: Record<string, unknown> = { result };
  if (scannedCode) fields.scanned_code = scannedCode;
  if (scannedBy !== undefined) fields.scanned_by = scannedBy || null;
  const { data, error } = await supabase
    .from("overdue_scans")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToOverdueScan(data);
}

export async function markOverdueScansCancelled(input: {
  scanDate: string;
  ids?: string[];
  numbers?: string[];
}) {
  const ids = Array.from(new Set((input.ids || []).map((value) => String(value || "").trim()).filter(Boolean)));
  const numbers = Array.from(
    new Set((input.numbers || []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  if (ids.length === 0 && numbers.length === 0) return;
  if (ids.length > 0) {
    const { error } = await supabase
      .from("overdue_scans")
      .update({ result: "cancelled", matched: true })
      .eq("scan_date", input.scanDate)
      .in("order_id", ids);
    if (error && !String(error.message || "").includes("result")) throw error;
  }
  if (numbers.length > 0) {
    const { error } = await supabase
      .from("overdue_scans")
      .update({ result: "cancelled", matched: true })
      .eq("scan_date", input.scanDate)
      .in("order_number", numbers);
    if (error && !String(error.message || "").includes("result")) throw error;
  }
}

export type CancelAlertRow = {
  id: string;
  orderNumber: string;
  platform?: string;
  source: string;
  reason?: string;
  reasonCode?: string;
  matchKey: string;
  scanDate: string;
  cancelledAt: Date;
  dismissed: boolean;
};

function rowToCancelAlert(r: any): CancelAlertRow {
  return {
    id: String(r.id || ""),
    orderNumber: String(r.order_number || ""),
    platform: r.platform ? String(r.platform) : undefined,
    source: String(r.source || "live"),
    reason: r.reason ? String(r.reason) : undefined,
    reasonCode: r.reason_code ? String(r.reason_code) : undefined,
    matchKey: String(r.match_key || ""),
    scanDate: String(r.scan_date || "").slice(0, 10),
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at) : new Date(),
    dismissed: Boolean(r.dismissed_at),
  };
}

export async function getCancelAlerts(scanDate: string): Promise<CancelAlertRow[]> {
  const { data, error } = await supabase
    .from("cancel_alerts")
    .select("*")
    .eq("scan_date", scanDate)
    .order("cancelled_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToCancelAlert);
}

export async function upsertCancelAlert(input: {
  id?: string;
  orderNumber: string;
  platform?: string;
  source: string;
  reason?: string;
  reasonCode?: string;
  matchKey: string;
  scanDate: string;
}): Promise<CancelAlertRow> {
  const payload = {
    id: input.id || `${input.scanDate}:${input.matchKey}`,
    order_number: input.orderNumber,
    platform: input.platform || null,
    source: input.source,
    reason: input.reason || null,
    reason_code: input.reasonCode || null,
    match_key: input.matchKey,
    scan_date: input.scanDate,
    cancelled_at: new Date().toISOString(),
    dismissed_at: null,
  };
  const { data, error } = await supabase
    .from("cancel_alerts")
    .upsert(payload, { onConflict: "scan_date,match_key" })
    .select()
    .single();
  if (error) throw error;
  return rowToCancelAlert(data);
}

export async function dismissCancelAlert(id: string): Promise<CancelAlertRow | null> {
  const { data, error } = await supabase
    .from("cancel_alerts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? rowToCancelAlert(data) : null;
}
