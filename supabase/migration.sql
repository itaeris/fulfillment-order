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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read profiles') THEN
    CREATE POLICY "Allow read profiles" ON profiles FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

-- Auto-create profile when a new auth user is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'warehouse')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
