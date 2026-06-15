-- Run this in Supabase SQL Editor after creating your project

-- Daily log entries table
CREATE TABLE IF NOT EXISTS fitlog_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- AI reviews table
CREATE TABLE IF NOT EXISTS fitlog_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  range_type TEXT,
  review_text TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (each user sees only their own data)
ALTER TABLE fitlog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitlog_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their entries" ON fitlog_entries
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their reviews" ON fitlog_reviews
  FOR ALL USING (auth.uid() = user_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER fitlog_entries_updated_at
  BEFORE UPDATE ON fitlog_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
