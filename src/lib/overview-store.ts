import {
  clearOverviewData,
  insertOverviewFile,
  insertOverviewOrders,
  replaceOverviewOrdersByPlatforms,
} from "@/lib/db";
import { clearOverviewCache, hydrateOrders } from "@/lib/client-data";
import { Order, Platform, UploadedFile } from "@/types/order";

const LEGACY_DB_NAME = "overview-duedate";
const LEGACY_DB_VERSION = 1;
const LEGACY_ORDERS_STORE = "orders";
const LEGACY_FILES_STORE = "files";

let migratePromise: Promise<void> | null = null;

function openLegacyDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const request = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_ORDERS_STORE)) {
        db.createObjectStore(LEGACY_ORDERS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(LEGACY_FILES_STORE)) {
        db.createObjectStore(LEGACY_FILES_STORE, { keyPath: "name" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readLegacyIndexedDb(): Promise<{ orders: Order[]; files: UploadedFile[] }> {
  const db = await openLegacyDb();
  if (!db) return { orders: [], files: [] };
  try {
    const orders = (await requestToPromise(
      db.transaction(LEGACY_ORDERS_STORE, "readonly").objectStore(LEGACY_ORDERS_STORE).getAll()
    )) as Order[];
    const files = (await requestToPromise(
      db.transaction(LEGACY_FILES_STORE, "readonly").objectStore(LEGACY_FILES_STORE).getAll()
    )) as UploadedFile[];
    return { orders: orders || [], files: files || [] };
  } catch {
    return { orders: [], files: [] };
  } finally {
    db.close();
  }
}

async function clearLegacyIndexedDb(): Promise<void> {
  const db = await openLegacyDb();
  if (!db) return;
  try {
    const tx = db.transaction([LEGACY_ORDERS_STORE, LEGACY_FILES_STORE], "readwrite");
    tx.objectStore(LEGACY_ORDERS_STORE).clear();
    tx.objectStore(LEGACY_FILES_STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  } finally {
    db.close();
  }
}

function serializeOrder(order: Order) {
  return {
    ...order,
    orderDate: order.orderDate ? new Date(order.orderDate).toISOString() : undefined,
    paidTime: order.paidTime ? new Date(order.paidTime).toISOString() : undefined,
    shippedTime: order.shippedTime ? new Date(order.shippedTime).toISOString() : undefined,
    mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore).toISOString() : undefined,
    pickupTime: order.pickupTime ? new Date(order.pickupTime).toISOString() : undefined,
  };
}

export async function migrateLegacyOverviewIfNeeded(): Promise<void> {
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    const legacy = await readLegacyIndexedDb();
    if (legacy.orders.length === 0 && legacy.files.length === 0) return;
    if (legacy.orders.length > 0) {
      await insertOverviewOrders(legacy.orders.map(serializeOrder));
    }
    for (const file of legacy.files) {
      await insertOverviewFile({
        name: file.name,
        platform: file.platform,
        orderCount: file.orderCount,
        uploadedAt: file.uploadedAt,
      });
    }
    await clearLegacyIndexedDb();
  })();
  return migratePromise;
}

export async function upsertOverviewOrders(orders: Order[]): Promise<void> {
  if (orders.length === 0) return;
  await insertOverviewOrders(orders.map(serializeOrder));
  clearOverviewCache();
}

export async function replaceOverviewPlatforms(
  platforms: Platform[],
  orders: Order[]
): Promise<Order[]> {
  const next = await replaceOverviewOrdersByPlatforms(
    platforms,
    orders.map(serializeOrder)
  );
  clearOverviewCache();
  return hydrateOrders(next as Order[]);
}

export async function saveOverviewFile(file: UploadedFile): Promise<void> {
  await insertOverviewFile({
    name: file.name,
    platform: file.platform,
    orderCount: file.orderCount,
    uploadedAt: file.uploadedAt,
  });
  clearOverviewCache();
}

export async function clearOverviewStore(): Promise<void> {
  await clearOverviewData();
  await clearLegacyIndexedDb();
  clearOverviewCache();
}
