-- 061_expense_external_id.sql
-- ---------------------------------------------------------------------------
-- Expenses synced from Morning (חשבונית ירוקה).
--
-- Supplier invoices are recorded in Morning's expenses module (scanned /
-- uploaded there; Morning reads the details). /finance pulls them into
-- "הוצאות" through the Morning API. Every synced row carries the Morning
-- expense id in "מזהה_חיצוני" ('morning:<id>'), and a unique index on it
-- makes the sync idempotent: syncing the same period again never adds an
-- expense twice.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Requires migration 057 (הוצאות). Safe to run more than once.
-- ---------------------------------------------------------------------------

ALTER TABLE "הוצאות"
  ADD COLUMN IF NOT EXISTS "מזהה_חיצוני" text;

CREATE UNIQUE INDEX IF NOT EXISTS "הוצאות_מזהה_חיצוני_uniq"
  ON "הוצאות" ("מזהה_חיצוני")
  WHERE "מזהה_חיצוני" IS NOT NULL;

-- Verify (read-only): should list the new column.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'הוצאות' AND column_name = 'מזהה_חיצוני';
