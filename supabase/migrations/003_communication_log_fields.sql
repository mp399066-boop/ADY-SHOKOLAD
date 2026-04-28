-- Extend תיעוד_תקשורת with full email metadata
-- Run in: Supabase Dashboard > SQL Editor
ALTER TABLE תיעוד_תקשורת
  ADD COLUMN IF NOT EXISTS הזמנה_id     UUID         REFERENCES הזמנות(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS כיוון        VARCHAR(10)  DEFAULT 'יוצא',
  ADD COLUMN IF NOT EXISTS נושא         TEXT,
  ADD COLUMN IF NOT EXISTS אל           TEXT,
  ADD COLUMN IF NOT EXISTS מ            TEXT,
  ADD COLUMN IF NOT EXISTS סטטוס        VARCHAR(20)  DEFAULT 'נשלח',
  ADD COLUMN IF NOT EXISTS מזהה_הודעה   TEXT,
  ADD COLUMN IF NOT EXISTS הודעת_שגיאה  TEXT;
