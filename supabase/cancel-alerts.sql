-- Run this in Supabase Dashboard > SQL Editor
-- Notifikasi cancel scanner (persist + alasan batal)

CREATE TABLE IF NOT EXISTS cancel_alerts (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  platform TEXT,
  source TEXT NOT NULL DEFAULT 'live',
  reason TEXT,
  reason_code TEXT,
  match_key TEXT NOT NULL,
  scan_date DATE NOT NULL,
  cancelled_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancel_alerts_date ON cancel_alerts(scan_date DESC, cancelled_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cancel_alerts_unique_day
  ON cancel_alerts (scan_date, match_key);

ALTER TABLE cancel_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to cancel_alerts') THEN
    CREATE POLICY "Allow all access to cancel_alerts" ON cancel_alerts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cancel_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cancel_alerts;
  END IF;
END $$;
