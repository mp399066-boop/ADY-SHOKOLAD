-- 059_expense_salaries.sql
-- ---------------------------------------------------------------------------
-- תלושי משכורת (payslips) as expenses.
--
-- The owner records each employee's GROSS monthly salary (ברוטו, from the
-- payslip) so salaries appear in expenses and in profit & loss. A payslip is
-- stored as a normal "הוצאות" row (category "משכורות ועובדים", no VAT) that
-- carries two extra fields:
--   "עובד_id"   → the employee (עובדים) the salary belongs to;
--   "חודש_שכר"  → the pay month, 'YYYY-MM' (the month the work was done).
--
-- One payslip per employee per month: re-saving the same month updates the
-- existing row instead of adding a second one (partial unique index).
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Requires migration 057 (הוצאות). Safe to run more than once.
-- ---------------------------------------------------------------------------

ALTER TABLE "הוצאות"
  ADD COLUMN IF NOT EXISTS "עובד_id"  uuid REFERENCES "עובדים"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "חודש_שכר" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'הוצאות_חודש_שכר_פורמט'
  ) THEN
    ALTER TABLE "הוצאות"
      ADD CONSTRAINT "הוצאות_חודש_שכר_פורמט" CHECK ("חודש_שכר" IS NULL OR "חודש_שכר" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "הוצאות_תלוש_לעובד_לחודש_uniq"
  ON "הוצאות" ("עובד_id", "חודש_שכר")
  WHERE "עובד_id" IS NOT NULL AND "חודש_שכר" IS NOT NULL;

-- Verify (read-only): both columns should be listed.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'הוצאות' AND column_name IN ('עובד_id', 'חודש_שכר');
