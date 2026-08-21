import {
  getAllOverviewFiles,
  getAllOverviewOrders,
  getAllOrders,
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

export function setDashboardCache(next: DataSnapshot) {
  dashboardCache = next;
}

export function clearDashboardCache() {
  dashboardCache = null;
  dashboardInflight = null;
}

export async function loadDashboardData(force = false): Promise<DataSnapshot> {
  if (!force && dashboardCache) return dashboardCache;
  if (dashboardInflight) return dashboardInflight;

  dashboardInflight = (async () => {
    const [orders, files] = await Promise.all([getAllOrders(), getAllUploadedFiles()]);
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
