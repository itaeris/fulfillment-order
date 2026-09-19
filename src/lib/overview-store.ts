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

async function postJson(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; orders?: Order[] };
  if (!res.ok) throw new Error(data.error || "Gagal menyimpan data ringkasan");
  return data;
}

export async function migrateLegacyOverviewIfNeeded(): Promise<void> {
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    const legacy = await readLegacyIndexedDb();
    if (legacy.orders.length === 0 && legacy.files.length === 0) return;
    if (legacy.orders.length > 0) {
      await postJson("/api/overview/orders", { orders: legacy.orders });
    }
    for (const file of legacy.files) {
      await postJson("/api/overview/files", file);
    }
    await clearLegacyIndexedDb();
  })();
  return migratePromise;
}

export async function upsertOverviewOrders(orders: Order[]): Promise<void> {
  if (orders.length === 0) return;
  await postJson("/api/overview/orders", { orders });
  clearOverviewCache();
}

export async function replaceOverviewPlatforms(
  platforms: Platform[],
  orders: Order[]
): Promise<Order[]> {
  const data = await postJson("/api/overview/orders", { platforms, orders }, "PUT");
  clearOverviewCache();
  return hydrateOrders((data.orders || []) as Order[]);
}

export async function saveOverviewFile(file: UploadedFile): Promise<void> {
  await postJson("/api/overview/files", file);
  clearOverviewCache();
}

export async function clearOverviewStore(): Promise<void> {
  const res = await fetch("/api/overview/orders", { method: "DELETE" });
  if (!res.ok) throw new Error("Gagal menghapus data ringkasan");
  await clearLegacyIndexedDb();
  clearOverviewCache();
}
