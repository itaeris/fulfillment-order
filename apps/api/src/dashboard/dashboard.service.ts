import { Injectable, Logger } from "@nestjs/common";
import { getDashboardCache, redisMode, setDashboardCache, type DashboardPayload } from "../cache";
import { getSupabase } from "../supabase";

const PAGE = 1000;
const ORDER_COLUMNS = [
  "id",
  "order_number",
  "platform",
  "customer_name",
  "recipient_name",
  "product_name",
  "variation",
  "sku",
  "quantity",
  "original_price",
  "price",
  "total_amount",
  "status",
  "order_date",
  "paid_time",
  "shipped_time",
  "must_ship_before",
  "shipping_address",
  "city",
  "province",
  "tracking_number",
  "shipping_option",
  "courier",
  "phone",
  "notes",
  "weight",
  "channel_name",
  "store_name",
  "ref_no",
  "pickup_time",
  "created_at",
].join(",");

type OrderRow = Record<string, unknown>;

function rowToOrder(r: OrderRow) {
  return {
    id: r.id,
    orderNumber: r.order_number,
    platform: r.platform,
    customerName: r.customer_name,
    recipientName: r.recipient_name,
    productName: r.product_name,
    variation: r.variation,
    sku: r.sku,
    quantity: r.quantity ?? 1,
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

function rowToFile(r: OrderRow) {
  return {
    name: r.name,
    platform: r.platform,
    uploadedAt: r.uploaded_at,
    orderCount: r.order_count,
  };
}

@Injectable()
export class DashboardService {
  private readonly log = new Logger(DashboardService.name);
  private inflight: Promise<DashboardPayload> | null = null;

  cacheInfo() {
    return { cache: redisMode() };
  }

  async loadDashboard(fresh = false) {
    if (!fresh) {
      const hit = await getDashboardCache();
      if (hit) {
        if (hit.stale) void this.refresh();
        return hit.data;
      }
    }
    return this.refresh();
  }

  private refresh() {
    if (this.inflight) return this.inflight;
    const started = Date.now();
    this.inflight = this.fetchLive()
      .then(async (data) => {
        await setDashboardCache(data);
        this.log.log(`dashboard ${data.orders.length} orders ${Date.now() - started}ms cache=${redisMode()}`);
        return data;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async fetchLive(): Promise<DashboardPayload> {
    const supabase = getSupabase();
    const [orders, files] = await Promise.all([this.loadOrders(supabase), this.loadFiles(supabase)]);
    return { orders, files };
  }

  private async loadFiles(supabase: ReturnType<typeof getSupabase>) {
    const { data, error } = await supabase
      .from("uploaded_files")
      .select("name, platform, uploaded_at, order_count")
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToFile);
  }

  private async loadOrders(supabase: ReturnType<typeof getSupabase>) {
    const rows: OrderRow[] = [];
    const first = await this.page(supabase, 0);
    rows.push(...first);
    if (first.length < PAGE) return rows.map(rowToOrder);

    let from = PAGE;
    while (true) {
      const starts = [from, from + PAGE, from + PAGE * 2];
      const wave = await Promise.all(starts.map((start) => this.page(supabase, start)));
      let done = false;
      for (const page of wave) {
        rows.push(...page);
        if (page.length < PAGE) {
          done = true;
          break;
        }
      }
      if (done) break;
      from += PAGE * 3;
    }
    return rows.map(rowToOrder);
  }

  private async page(supabase: ReturnType<typeof getSupabase>, from: number) {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .order("order_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    return ((data ?? []) as unknown) as OrderRow[];
  }
}
