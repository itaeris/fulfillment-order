import { supabase } from "./supabase";

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

async function fetchPagedRows(
  table: string,
  select = "*",
  options?: {
    eq?: { column: string; value: string };
    ins?: { column: string; values: string[] }[];
    orderColumn?: string | null;
  }
) {
  const firstQuery = applyPagedFilters(
    supabase.from(table).select(select, { count: "exact" }),
    options
  );
  const { data: first, error, count } = await firstQuery.range(0, PAGE_SIZE - 1);
  if (error) throw error;

  const rows = [...(first ?? [])];
  const total = count ?? rows.length;
  if (total <= rows.length) return rows;

  const starts: number[] = [];
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) starts.push(from);

  const pages = await Promise.all(
    starts.map((from) =>
      applyPagedFilters(supabase.from(table).select(select), options).range(
        from,
        from + PAGE_SIZE - 1
      )
    )
  );

  for (const page of pages) {
    if (page.error) throw page.error;
    rows.push(...(page.data ?? []));
  }
  return rows;
}

// ── Order operations ──

export async function getAllOrders() {
  const allRows = await fetchPagedRows("orders", "*", { orderColumn: "order_date" });
  return allRows.map(rowToOrder);
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
  const found = new Set<string>();
  if (orderNumbers.length === 0 || platforms.length === 0) return found;
  const CHUNK = 100;
  for (let i = 0; i < orderNumbers.length; i += CHUNK) {
    const chunk = orderNumbers.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("orders")
      .select("order_number")
      .in("platform", platforms)
      .in("order_number", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.order_number) found.add(row.order_number);
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

export async function insertOverviewOrders(orders: OrderInput[]) {
  if (orders.length === 0) return;
  const rows = orders.map(overviewOrderToRow);
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
