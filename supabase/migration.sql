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
  ref_no TEXT,
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to orders') THEN
    CREATE POLICY "Allow all access to orders" ON orders FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to uploaded_files') THEN
    CREATE POLICY "Allow all access to uploaded_files" ON uploaded_files FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Run this if your table already exists (adds the pickup_time column):
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_time TIMESTAMPTZ;

-- ── Auth: profiles table ──
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'warehouse',
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Run this if profiles table already exists:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;
-- Set existing users as approved:
UPDATE profiles SET approved = true WHERE approved = false;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read profiles') THEN
    CREATE POLICY "Allow read profiles" ON profiles FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin can update any profile') THEN
    CREATE POLICY "Admin can update any profile" ON profiles FOR UPDATE USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin can delete profiles') THEN
    CREATE POLICY "Admin can delete profiles" ON profiles FOR DELETE USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
END $$;

-- Auto-create profile when a new auth user is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, name, email, role, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'warehouse'),
    COALESCE((NEW.raw_user_meta_data->>'approved')::boolean, false)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── TikTok Shop token (auto-refresh access_token) ──
CREATE TABLE IF NOT EXISTS tiktok_tokens (
  id TEXT PRIMARY KEY DEFAULT 'default',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expire_at TIMESTAMPTZ,
  refresh_token_expire_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tiktok_tokens ENABLE ROW LEVEL SECURITY;

-- ── Jubelio token (login, berlaku 12 jam, di-refresh otomatis) ──
CREATE TABLE IF NOT EXISTS jubelio_tokens (
  id TEXT PRIMARY KEY DEFAULT 'default',
  access_token TEXT NOT NULL,
  access_token_expire_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE jubelio_tokens ENABLE ROW LEVEL SECURITY;

-- Status live dari webhook TikTok / Jubelio, dipakai dashboard + Kirim hari ini
CREATE TABLE IF NOT EXISTS live_order_status (
  order_number TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT,
  tracking_number TEXT,
  courier TEXT,
  shipping_option TEXT,
  shipped_time TIMESTAMPTZ,
  must_ship_before TIMESTAMPTZ,
  pickup_time TIMESTAMPTZ,
  ref_no TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (order_number, platform)
);

CREATE INDEX IF NOT EXISTS idx_live_order_status_updated ON live_order_status(updated_at DESC);

ALTER TABLE live_order_status ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to live_order_status') THEN
    CREATE POLICY "Allow all access to live_order_status" ON live_order_status FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Kirim hari ini (/overview-duedate) — terpisah dari tabel orders ──
CREATE TABLE IF NOT EXISTS overview_orders (
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
  ref_no TEXT,
  pickup_time TIMESTAMPTZ,
  order_type TEXT,
  is_preorder BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS overview_files (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  order_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_overview_orders_platform ON overview_orders(platform);
CREATE INDEX IF NOT EXISTS idx_overview_orders_status ON overview_orders(status);
CREATE INDEX IF NOT EXISTS idx_overview_orders_order_number ON overview_orders(order_number);

ALTER TABLE overview_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE overview_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to overview_orders') THEN
    CREATE POLICY "Allow all access to overview_orders" ON overview_orders FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to overview_files') THEN
    CREATE POLICY "Allow all access to overview_files" ON overview_files FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
