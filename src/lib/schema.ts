import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getMysql } from "./sql";

async function run(sql: string, params: unknown[] = []) {
  const [rows] = await getMysql().query(sql, params);
  return rows as Record<string, unknown>[];
}

const TABLES = [
  `CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(191) PRIMARY KEY,
    order_number VARCHAR(191) NOT NULL,
    platform VARCHAR(64) NOT NULL,
    customer_name TEXT,
    recipient_name TEXT,
    product_name TEXT,
    variation TEXT,
    sku VARCHAR(191),
    quantity INT DEFAULT 1,
    original_price DOUBLE,
    price DOUBLE,
    total_amount DOUBLE,
    status VARCHAR(64),
    order_date DATETIME,
    paid_time DATETIME,
    shipped_time DATETIME,
    must_ship_before DATETIME,
    shipping_address TEXT,
    city VARCHAR(191),
    province VARCHAR(191),
    tracking_number VARCHAR(191),
    shipping_option VARCHAR(191),
    courier VARCHAR(191),
    phone VARCHAR(64),
    notes TEXT,
    weight DOUBLE,
    channel_name VARCHAR(191),
    store_name VARCHAR(191),
    ref_no VARCHAR(191),
    pickup_time DATETIME,
    order_type VARCHAR(64),
    is_preorder TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_orders_platform (platform),
    INDEX idx_orders_status (status),
    INDEX idx_orders_order_date (order_date)
  )`,
  `CREATE TABLE IF NOT EXISTS uploaded_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL UNIQUE,
    platform VARCHAR(64) NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    order_count INT DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS overview_orders (
    id VARCHAR(191) PRIMARY KEY,
    order_number VARCHAR(191) NOT NULL,
    platform VARCHAR(64) NOT NULL,
    customer_name TEXT,
    recipient_name TEXT,
    product_name TEXT,
    variation TEXT,
    sku VARCHAR(191),
    quantity INT DEFAULT 1,
    original_price DOUBLE,
    price DOUBLE,
    total_amount DOUBLE,
    status VARCHAR(64),
    order_date DATETIME,
    paid_time DATETIME,
    shipped_time DATETIME,
    must_ship_before DATETIME,
    shipping_address TEXT,
    city VARCHAR(191),
    province VARCHAR(191),
    tracking_number VARCHAR(191),
    shipping_option VARCHAR(191),
    courier VARCHAR(191),
    phone VARCHAR(64),
    notes TEXT,
    weight DOUBLE,
    channel_name VARCHAR(191),
    store_name VARCHAR(191),
    ref_no VARCHAR(191),
    pickup_time DATETIME,
    order_type VARCHAR(64),
    is_preorder TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_overview_orders_platform (platform),
    INDEX idx_overview_orders_status (status),
    INDEX idx_overview_orders_order_number (order_number)
  )`,
  `CREATE TABLE IF NOT EXISTS overview_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL UNIQUE,
    platform VARCHAR(64) NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    order_count INT DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS live_order_status (
    order_number VARCHAR(191) NOT NULL,
    platform VARCHAR(64) NOT NULL,
    status VARCHAR(64),
    tracking_number VARCHAR(191),
    courier VARCHAR(191),
    shipping_option VARCHAR(191),
    shipped_time DATETIME,
    must_ship_before DATETIME,
    pickup_time DATETIME,
    ref_no VARCHAR(191),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_number, platform),
    INDEX idx_live_order_status_updated (updated_at)
  )`,
  `CREATE TABLE IF NOT EXISTS overdue_scans (
    id VARCHAR(191) PRIMARY KEY,
    scanned_code VARCHAR(191) NOT NULL,
    order_id VARCHAR(191),
    order_number VARCHAR(191),
    platform VARCHAR(64),
    matched TINYINT(1) NOT NULL DEFAULT 0,
    result VARCHAR(64),
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    scanned_by VARCHAR(191),
    scan_date DATE NOT NULL,
    INDEX idx_overdue_scans_date (scan_date, scanned_at),
    INDEX idx_overdue_scans_order (scan_date, order_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cancel_alerts (
    id VARCHAR(191) PRIMARY KEY,
    order_number VARCHAR(191) NOT NULL,
    platform VARCHAR(64),
    source VARCHAR(64) NOT NULL DEFAULT 'live',
    reason TEXT,
    reason_code VARCHAR(191),
    match_key VARCHAR(191) NOT NULL,
    scan_date DATE NOT NULL,
    cancelled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dismissed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_cancel_alerts_unique_day (scan_date, match_key),
    INDEX idx_cancel_alerts_date (scan_date, cancelled_at)
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(191) PRIMARY KEY,
    username VARCHAR(191) NOT NULL UNIQUE,
    name VARCHAR(191) NOT NULL,
    email VARCHAR(191) NOT NULL UNIQUE,
    password_hash VARCHAR(191) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'warehouse',
    approved TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tiktok_tokens (
    id VARCHAR(64) PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token_expire_at DATETIME,
    refresh_token_expire_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS shopee_tokens (
    id VARCHAR(64) PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    shop_id BIGINT,
    merchant_id BIGINT,
    main_account_id BIGINT,
    access_token_expire_at DATETIME,
    refresh_token_expire_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS jubelio_tokens (
    id VARCHAR(64) PRIMARY KEY,
    access_token TEXT NOT NULL,
    access_token_expire_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
];

const ALTERS = [
  "ALTER TABLE orders ADD COLUMN pickup_time DATETIME",
  "ALTER TABLE orders ADD COLUMN order_type VARCHAR(64)",
  "ALTER TABLE orders ADD COLUMN is_preorder TINYINT(1) DEFAULT 0",
  "ALTER TABLE overdue_scans ADD COLUMN result VARCHAR(64)",
];

let ready: Promise<void> | null = null;

export async function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      for (const sql of TABLES) {
        await run(sql);
      }
      for (const sql of ALTERS) {
        try {
          await run(sql);
        } catch {
          /* kolom / index sudah ada — bukan error */
        }
      }
      const rows = await run("SELECT COUNT(*) AS n FROM users");
      if (Number(rows[0]?.n || 0) === 0) {
        await run(
          `INSERT INTO users (id, username, name, email, password_hash, role, approved)
           VALUES (?, ?, ?, ?, ?, 'admin', 1)`,
          [
            randomUUID(),
            "itaeris",
            "IT Aeris",
            "it@aerisbeaute.com",
            await bcrypt.hash("@Aerisbeaute123!", 10),
          ]
        );
      }
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
