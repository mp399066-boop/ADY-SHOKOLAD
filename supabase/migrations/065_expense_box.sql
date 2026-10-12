-- 065_expense_box.sql
-- ---------------------------------------------------------------------------
-- קופות הוצאות — a second "box" for expenses that belong to the courses.
--
-- Some expenses are paid by the business but really belong to the courses
-- (קורסים). The owner moves them to "קופת קורסים" so she can show that the
-- courses have expenses too. On /finance:
--   • 'עסק'    (default) — the regular business expenses, P&L and averages;
--   • 'קורסים' — listed in their own tab and left OUT of the business
--                expenses, the business profit & loss and the monthly average.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Requires migration 057 (הוצאות). Safe to run more than once.
-- ---------------------------------------------------------------------------

ALTER TABLE "הוצאות"
  ADD COLUMN IF NOT EXISTS "קופה" text NOT NULL DEFAULT 'עסק';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'הוצאות_קופה_check'
  ) THEN
    ALTER TABLE "הוצאות"
      ADD CONSTRAINT "הוצאות_קופה_check" CHECK ("קופה" IN ('עסק', 'קורסים'));
  END IF;
END $$;

-- Verify (read-only): should list the new column.
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'הוצאות' AND column_name = 'קופה';
