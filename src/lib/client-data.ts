import { sanitizeOrderMetrics } from "@/lib/utils";
import { Order, UploadedFile } from "@/types/order";

export type DataSnapshot = {
  orders: Order[];
  files: UploadedFile[];
};

let dashboardCache: DataSnapshot | null = null;
let dashboardInflight: Promise<DataSnapshot> | null = null;
let overviewCache: DataSnapshot | null = null;
let overviewInflight: Promise<DataSnapshot> | null = null;

export function hydrateOrder(order: Order): Order {
  return sanitizeOrderMetrics({
    ...order,
    orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
    paidTime: order.paidTime ? new Date(order.paidTime) : undefined,
    shippedTime: order.shippedTime ? new Date(order.shippedTime) : undefined,
    mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore) : undefined,
    pickupTime: order.pickupTime ? new Date(order.pickupTime) : undefined,
  });
}

export function hydrateOrders(orders: Order[]): Order[] {
  return orders.map(hydrateOrder);
}

export function hydrateFiles(files: UploadedFile[]): UploadedFile[] {
  return files.map((file) => ({
    ...file,
    uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : new Date(),
  }));
}

function snapshot(orders: Order[], files: UploadedFile[]): DataSnapshot {
  return {
    orders: hydrateOrders(orders),
    files: hydrateFiles(files),
  };
}

function isLocalApi(url: string) {
  return /localhost|127\.0\.0\.1/.test(url);
}

function apiBaseUrl() {
  const raw = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!raw) return "";
  if (!isLocalApi(raw)) return raw;
  if (typeof window === "undefined") return raw;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" ? raw : "";
}

async function loadDashboardFromNest(): Promise<DataSnapshot | null> {
  const base = apiBaseUrl();
  const url = base ? `${base}/v1/dashboard` : "/api/v1/dashboard";
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { orders?: Order[]; files?: UploadedFile[] };
    if (!Array.isArray(data.orders)) return null;
    return snapshot(data.orders, data.files || []);
  } catch {
    return null;
  }
}

export function getCachedDashboard(): DataSnapshot | null {
  return dashboardCache;
}

const PERSIST_KEY = "fti-dashboard-v1";

export function readPersistedDashboard(): DataSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { orders?: Order[]; files?: UploadedFile[] };
    if (!Array.isArray(parsed.orders)) return null;
    return snapshot(parsed.orders, parsed.files || []);
  } catch {
    return null;
  }
}

export function writePersistedDashboard(data: DataSnapshot) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        orders: data.orders,
        files: data.files,
      })
    );
  } catch {
    try {
      sessionStorage.removeItem(PERSIST_KEY);
    } catch {
      /* quota */
    }
  }
}

export function setDashboardCache(next: DataSnapshot) {
  dashboardCache = next;
}

export function clearDashboardCache() {
  dashboardCache = null;
  dashboardInflight = null;
}

export async function loadDashboardData(
  force = false,
  onPartial?: (data: DataSnapshot) => void
): Promise<DataSnapshot> {
  if (!force && dashboardCache) return dashboardCache;
  if (dashboardInflight) return dashboardInflight;

  dashboardInflight = (async () => {
    const nestPromise = loadDashboardFromNest();

    const fromApi = await nestPromise;
    if (fromApi) {
      dashboardCache = fromApi;
      onPartial?.(fromApi);
      return fromApi;
    }
    const res = await fetch("/api/v1/dashboard", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { orders?: Order[]; files?: UploadedFile[] };
    const next = snapshot(data.orders || [], data.files || []);
    dashboardCache = next;
    onPartial?.(next);
    return next;
  })().finally(() => {
    dashboardInflight = null;
  });

  return dashboardInflight;
}

export function getCachedOverview(): DataSnapshot | null {
  return overviewCache;
}

export function setOverviewCache(next: DataSnapshot) {
  overviewCache = next;
}

export function clearOverviewCache() {
  overviewCache = null;
  overviewInflight = null;
}

export async function loadOverviewData(force = false): Promise<DataSnapshot> {
  if (!force && overviewCache) return overviewCache;
  if (overviewInflight) return overviewInflight;

  overviewInflight = (async () => {
    const [ordersRes, filesRes] = await Promise.all([
      fetch("/api/overview/orders", { cache: "no-store" }),
      fetch("/api/overview/files", { cache: "no-store" }),
    ]);
    const ordersJson = (await ordersRes.json().catch(() => ({}))) as { orders?: Order[] };
    const filesJson = (await filesRes.json().catch(() => ({}))) as { files?: UploadedFile[] };
    const next = snapshot(ordersJson.orders || [], filesJson.files || []);
    overviewCache = next;
    return next;
  })().finally(() => {
    overviewInflight = null;
  });

  return overviewInflight;
}
