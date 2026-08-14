import { supabase } from "./supabase";

// ── Order operations ──

const ORDER_COLUMNS = "id,order_number,platform,customer_name,recipient_name,product_name,variation,sku,quantity,original_price,price,total_amount,status,order_date,paid_time,shipped_time,must_ship_before,shipping_address,city,province,tracking_number,shipping_option,courier,phone,notes,weight,channel_name,store_name,ref_no,pickup_time,created_at";

export async function getAllOrders() {
  const allRows: any[] = [];
  const PAGE_SIZE = 5000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .order("order_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows.map(rowToOrder);
}

export async function getOrdersByPlatform(platform: string) {
  const allRows: any[] = [];
  const PAGE_SIZE = 5000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("platform", platform)
      .order("order_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

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
