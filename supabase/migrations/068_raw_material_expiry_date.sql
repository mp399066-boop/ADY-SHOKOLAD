-- 068_raw_material_expiry_date.sql
-- ---------------------------------------------------------------------------
-- תאריך תפוגה לחומרי גלם.
--
-- The column was only in the old root migration.sql (section A), which was
-- never run on this database — so the edit window on /costs (and anywhere
-- else it opens) failed on every save with "השדה תאריך_תפוגה עדיין לא קיים".
-- The window no longer sends the field when the column is missing; running
-- this adds the column so the expiry date can actually be saved.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

ALTER TABLE "מלאי_חומרי_גלם"
  ADD COLUMN IF NOT EXISTS "תאריך_תפוגה" date;

-- Verify (read-only): should list the new column.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'מלאי_חומרי_גלם' AND column_name = 'תאריך_תפוגה';
