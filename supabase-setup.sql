-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Daily log entries table
CREATE TABLE IF NOT EXISTS fitlog_entries (
  date DATE PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI reviews table
CREATE TABLE IF NOT EXISTS fitlog_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  review_date DATE NOT NULL,
  range_type TEXT,
  review_text TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow anon key full access (personal single-user app)
ALTER TABLE fitlog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitlog_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access entries" ON fitlog_entries
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon full access reviews" ON fitlog_reviews
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER fitlog_entries_updated_at
  BEFORE UPDATE ON fitlog_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
