import { Order, Platform, UploadedFile } from "@/types/order";

const UPSERT_CHUNK = 250;
const LEGACY_DB_NAME = "overview-duedate";
const LEGACY_DB_VERSION = 1;
const LEGACY_ORDERS_STORE = "orders";
const LEGACY_FILES_STORE = "files";

let migratePromise: Promise<void> | null = null;

async function readJson<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || fallbackMessage);
  }
  return res.json() as Promise<T>;
}

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

async function migrateLegacyIfNeeded(): Promise<void> {
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    const currentRes = await fetch("/api/overview/orders");
    if (!currentRes.ok) return;
    const current = (await currentRes.json()) as { orders?: Order[] };
    if ((current.orders ?? []).length > 0) return;

    const legacy = await readLegacyIndexedDb();
    if (legacy.orders.length === 0 && legacy.files.length === 0) return;

    await upsertOverviewOrders(legacy.orders);
    for (const file of legacy.files) {
      await saveOverviewFile({
        ...file,
        uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : new Date(),
      });
    }
    await clearLegacyIndexedDb();
  })();
  return migratePromise;
}

export async function loadOverviewOrders(): Promise<Order[]> {
  await migrateLegacyIfNeeded();
  const res = await fetch("/api/overview/orders");
  const data = await readJson<{ orders?: Order[] }>(res, "Gagal memuat pesanan Kirim hari ini");
  return data.orders ?? [];
}

export async function loadOverviewFiles(): Promise<UploadedFile[]> {
  await migrateLegacyIfNeeded();
  const res = await fetch("/api/overview/files");
  const data = await readJson<{ files?: UploadedFile[] }>(res, "Gagal memuat file Kirim hari ini");
  return (data.files ?? []).map((file) => ({
    ...file,
    uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : new Date(),
  }));
}

export async function upsertOverviewOrders(orders: Order[]): Promise<void> {
  if (orders.length === 0) return;
  for (let i = 0; i < orders.length; i += UPSERT_CHUNK) {
    const chunk = orders.slice(i, i + UPSERT_CHUNK);
    const res = await fetch("/api/overview/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: chunk }),
    });
    await readJson(res, "Gagal menyimpan pesanan Kirim hari ini");
  }
}

export async function replaceOverviewPlatforms(
  platforms: Platform[],
  orders: Order[]
): Promise<Order[]> {
  const res = await fetch("/api/overview/orders", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platforms, orders: [] }),
  });
  const data = await readJson<{ orders?: Order[] }>(
    res,
    "Gagal mengganti pesanan Kirim hari ini"
  );
  await upsertOverviewOrders(orders);
  return [...(data.orders ?? []), ...orders];
}

export async function saveOverviewFile(file: UploadedFile): Promise<void> {
  const res = await fetch("/api/overview/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...file,
      uploadedAt: file.uploadedAt instanceof Date ? file.uploadedAt.toISOString() : file.uploadedAt,
    }),
  });
  await readJson(res, "Gagal menyimpan file Kirim hari ini");
}

export async function clearOverviewStore(): Promise<void> {
  const res = await fetch("/api/overview/orders", { method: "DELETE" });
  await readJson(res, "Gagal menghapus data Kirim hari ini");
  await clearLegacyIndexedDb();
}
