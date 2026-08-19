import { Order, Platform, UploadedFile } from "@/types/order";

const DB_NAME = "overview-duedate";
const DB_VERSION = 1;
const ORDERS_STORE = "orders";
const FILES_STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ORDERS_STORE)) {
        db.createObjectStore(ORDERS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: "name" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function hydrate(order: Order): Order {
  return {
    ...order,
    orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
    paidTime: order.paidTime ? new Date(order.paidTime) : undefined,
    shippedTime: order.shippedTime ? new Date(order.shippedTime) : undefined,
    mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore) : undefined,
    pickupTime: order.pickupTime ? new Date(order.pickupTime) : undefined,
  };
}

function serialize(order: Order): Order {
  return {
    ...order,
    orderDate: order.orderDate ? new Date(order.orderDate) : new Date(),
    paidTime: order.paidTime ? new Date(order.paidTime) : undefined,
    shippedTime: order.shippedTime ? new Date(order.shippedTime) : undefined,
    mustShipBefore: order.mustShipBefore ? new Date(order.mustShipBefore) : undefined,
    pickupTime: order.pickupTime ? new Date(order.pickupTime) : undefined,
  };
}

export async function loadOverviewOrders(): Promise<Order[]> {
  const db = await openDb();
  const rows = await requestToPromise(
    db.transaction(ORDERS_STORE, "readonly").objectStore(ORDERS_STORE).getAll()
  );
  db.close();
  return (rows as Order[]).map(hydrate);
}

export async function loadOverviewFiles(): Promise<UploadedFile[]> {
  const db = await openDb();
  const rows = await requestToPromise(
    db.transaction(FILES_STORE, "readonly").objectStore(FILES_STORE).getAll()
  );
  db.close();
  return (rows as UploadedFile[]).map((file) => ({
    ...file,
    uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : new Date(),
  }));
}

export async function upsertOverviewOrders(orders: Order[]): Promise<void> {
  if (orders.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(ORDERS_STORE, "readwrite");
  const store = tx.objectStore(ORDERS_STORE);
  for (const order of orders) {
    store.put(serialize(order));
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function replaceOverviewPlatforms(
  platforms: Platform[],
  orders: Order[]
): Promise<Order[]> {
  const existing = await loadOverviewOrders();
  const keep = existing.filter((order) => !platforms.includes(order.platform));
  const next = [...keep, ...orders];
  const db = await openDb();
  const tx = db.transaction(ORDERS_STORE, "readwrite");
  tx.objectStore(ORDERS_STORE).clear();
  for (const order of next) {
    tx.objectStore(ORDERS_STORE).put(serialize(order));
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return next;
}

export async function saveOverviewFile(file: UploadedFile): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(FILES_STORE, "readwrite");
  tx.objectStore(FILES_STORE).put({
    ...file,
    uploadedAt: file.uploadedAt instanceof Date ? file.uploadedAt.toISOString() : file.uploadedAt,
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearOverviewStore(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([ORDERS_STORE, FILES_STORE], "readwrite");
  tx.objectStore(ORDERS_STORE).clear();
  tx.objectStore(FILES_STORE).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
