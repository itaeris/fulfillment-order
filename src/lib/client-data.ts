import {
  getAllOverviewFiles,
  getAllOverviewOrders,
  getAllOrders,
  getAllOrdersProgressive,
  getAllUploadedFiles,
} from "@/lib/db";
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
    const filesPromise = getAllUploadedFiles();
    if (!onPartial) {
      const [orders, files] = await Promise.all([getAllOrders(), filesPromise]);
      const next = snapshot(orders, files);
      dashboardCache = next;
      return next;
    }

    const files = await filesPromise;
    const orders = await getAllOrdersProgressive((chunk) => {
      const next = snapshot(chunk, files);
      dashboardCache = next;
      onPartial(next);
    });
    const next = snapshot(orders, files);
    dashboardCache = next;
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
    const [orders, files] = await Promise.all([
      getAllOverviewOrders(),
      getAllOverviewFiles(),
    ]);
    const next = snapshot(orders, files);
    overviewCache = next;
    return next;
  })().finally(() => {
    overviewInflight = null;
  });

  return overviewInflight;
}
