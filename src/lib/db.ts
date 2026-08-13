import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "orders.db");

// Ensure data directory exists
import fs from "fs";
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    orderNumber TEXT NOT NULL,
    platform TEXT NOT NULL,
    customerName TEXT,
    recipientName TEXT,
    productName TEXT,
    variation TEXT,
    sku TEXT,
    quantity INTEGER DEFAULT 1,
    originalPrice REAL,
    price REAL,
    totalAmount REAL,
    status TEXT,
    orderDate TEXT,
    paidTime TEXT,
    shippedTime TEXT,
    mustShipBefore TEXT,
    shippingAddress TEXT,
    city TEXT,
    province TEXT,
    trackingNumber TEXT,
    shippingOption TEXT,
    courier TEXT,
    phone TEXT,
    notes TEXT,
    weight REAL,
    channelName TEXT,
    storeName TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS uploaded_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    platform TEXT NOT NULL,
    uploadedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    orderCount INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_orders_platform ON orders(platform);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_orderDate ON orders(orderDate);
`);

// Migrate: add new columns if they don't exist yet
try {
  db.exec(`ALTER TABLE orders ADD COLUMN channelName TEXT`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE orders ADD COLUMN storeName TEXT`);
} catch { /* column already exists */ }

export default db;

// Order operations
export function getAllOrders() {
  const stmt = db.prepare("SELECT * FROM orders ORDER BY orderDate DESC");
  return stmt.all();
}

export function getOrdersByPlatform(platform: string) {
  const stmt = db.prepare("SELECT * FROM orders WHERE platform = ? ORDER BY orderDate DESC");
  return stmt.all(platform);
}

export function insertOrder(order: {
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
}) {
  // Normalize undefined values to null for SQLite
  const normalizedOrder = {
    id: order.id,
    orderNumber: order.orderNumber,
    platform: order.platform,
    customerName: order.customerName ?? null,
    recipientName: order.recipientName ?? null,
    productName: order.productName ?? null,
    variation: order.variation ?? null,
    sku: order.sku ?? null,
    quantity: order.quantity ?? 1,
    originalPrice: order.originalPrice ?? null,
    price: order.price ?? null,
    totalAmount: order.totalAmount ?? null,
    status: order.status ?? null,
    orderDate: order.orderDate ?? null,
    paidTime: order.paidTime ?? null,
    shippedTime: order.shippedTime ?? null,
    mustShipBefore: order.mustShipBefore ?? null,
    shippingAddress: order.shippingAddress ?? null,
    city: order.city ?? null,
    province: order.province ?? null,
    trackingNumber: order.trackingNumber ?? null,
    shippingOption: order.shippingOption ?? null,
    courier: order.courier ?? null,
    phone: order.phone ?? null,
    notes: order.notes ?? null,
    weight: order.weight ?? null,
    channelName: order.channelName ?? null,
    storeName: order.storeName ?? null,
  };

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO orders (
      id, orderNumber, platform, customerName, recipientName, productName,
      variation, sku, quantity, originalPrice, price, totalAmount, status,
      orderDate, paidTime, shippedTime, mustShipBefore, shippingAddress,
      city, province, trackingNumber, shippingOption, courier, phone, notes, weight,
      channelName, storeName
    ) VALUES (
      @id, @orderNumber, @platform, @customerName, @recipientName, @productName,
      @variation, @sku, @quantity, @originalPrice, @price, @totalAmount, @status,
      @orderDate, @paidTime, @shippedTime, @mustShipBefore, @shippingAddress,
      @city, @province, @trackingNumber, @shippingOption, @courier, @phone, @notes, @weight,
      @channelName, @storeName
    )
  `);
  return stmt.run(normalizedOrder);
}

export function insertOrders(orders: Parameters<typeof insertOrder>[0][]) {
  const insertMany = db.transaction((orders) => {
    for (const order of orders) {
      insertOrder(order);
    }
  });
  return insertMany(orders);
}

export function deleteOrdersByPlatform(platform: string) {
  const stmt = db.prepare("DELETE FROM orders WHERE platform = ?");
  return stmt.run(platform);
}

export function deleteAllOrders() {
  const stmt = db.prepare("DELETE FROM orders");
  return stmt.run();
}

export function deleteOrdersByFile(fileName: string, platform: string) {
  // We'll delete orders that were imported from this file
  // Since we don't track file per order, we'll delete by platform
  const stmt = db.prepare("DELETE FROM orders WHERE platform = ?");
  return stmt.run(platform);
}

// Uploaded files operations
export function getAllUploadedFiles() {
  const stmt = db.prepare("SELECT * FROM uploaded_files ORDER BY uploadedAt DESC");
  return stmt.all();
}

export function insertUploadedFile(file: { name: string; platform: string; orderCount: number }) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO uploaded_files (name, platform, orderCount, uploadedAt)
    VALUES (@name, @platform, @orderCount, datetime('now'))
  `);
  return stmt.run(file);
}

export function deleteUploadedFile(name: string) {
  const stmt = db.prepare("DELETE FROM uploaded_files WHERE name = ?");
  return stmt.run(name);
}

export function deleteAllUploadedFiles() {
  const stmt = db.prepare("DELETE FROM uploaded_files");
  return stmt.run();
}
