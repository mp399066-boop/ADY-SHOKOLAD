-- ============================================================================
-- Migration 022: Customer address fields for delivery autofill.
--
-- Adds three optional address columns to לקוחות so a delivery order can
-- prefill כתובת_מקבל_ההזמנה / עיר / הוראות_משלוח from the chosen customer.
--
-- All columns are nullable with no default — existing rows stay untouched and
-- "no saved address" remains representable as plain NULL.
--
-- Run manually in Supabase SQL Editor.
-- ============================================================================

ALTER TABLE "לקוחות"
  ADD COLUMN IF NOT EXISTS "כתובת"       TEXT,
  ADD COLUMN IF NOT EXISTS "עיר"         TEXT,
  ADD COLUMN IF NOT EXISTS "הערות_כתובת" TEXT;

-- Verify (read-only). Should list the three new columns.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'לקוחות'
   AND column_name IN ('כתובת', 'עיר', 'הערות_כתובת')
 ORDER BY column_name;
