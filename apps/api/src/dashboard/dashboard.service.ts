import { Injectable, Logger } from "@nestjs/common";
import { getDashboardCache, redisMode, setDashboardCache, type DashboardPayload } from "../cache";
import { getMysql, mysqlConfigured, mysqlReady } from "../mysql";

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
    return { cache: redisMode(), mysql: mysqlConfigured() };
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
    if (!mysqlConfigured() || !(await mysqlReady())) {
      throw new Error("MySQL belum siap");
    }
    const [orders, files] = await Promise.all([this.loadMysqlOrders(), this.loadMysqlFiles()]);
    return { orders, files };
  }

  private async loadMysqlFiles() {
    const [rows] = await getMysql().query(
      "SELECT name, platform, uploaded_at, order_count FROM uploaded_files ORDER BY uploaded_at DESC"
    );
    return (Array.isArray(rows) ? rows : []).map((row) => rowToFile(row as OrderRow));
  }

  private async loadMysqlOrders() {
    const [rows] = await getMysql().query(
      `SELECT ${ORDER_COLUMNS} FROM orders ORDER BY order_date DESC, id ASC`
    );
    return (Array.isArray(rows) ? rows : []).map((row) => rowToOrder(row as OrderRow));
  }
}
