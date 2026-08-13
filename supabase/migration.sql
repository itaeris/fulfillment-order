-- Run this in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  platform TEXT NOT NULL,
  customer_name TEXT,
  recipient_name TEXT,
  product_name TEXT,
  variation TEXT,
  sku TEXT,
  quantity INTEGER DEFAULT 1,
  original_price DOUBLE PRECISION,
  price DOUBLE PRECISION,
  total_amount DOUBLE PRECISION,
  status TEXT,
  order_date TIMESTAMPTZ,
  paid_time TIMESTAMPTZ,
  shipped_time TIMESTAMPTZ,
  must_ship_before TIMESTAMPTZ,
  shipping_address TEXT,
  city TEXT,
  province TEXT,
  tracking_number TEXT,
  shipping_option TEXT,
  courier TEXT,
  phone TEXT,
  notes TEXT,
  weight DOUBLE PRECISION,
  channel_name TEXT,
  store_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  order_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_orders_platform ON orders(platform);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);

-- Enable Row Level Security but allow all access (for anon key usage)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to orders" ON orders
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to uploaded_files" ON uploaded_files
  FOR ALL USING (true) WITH CHECK (true);
