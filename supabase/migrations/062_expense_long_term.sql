-- 062_expense_long_term.sql
-- ---------------------------------------------------------------------------
-- השקעות לטווח ארוך (long-term / capital expenses).
--
-- Some expenses buy things that are not used up — fridges, ovens, tables,
-- machines. Counting them as a normal monthly expense distorts the monthly
-- average ("how much do I need to bring in every month"), so the owner marks
-- them as "השקעה לטווח ארוך". On /finance they are:
--   • still listed with all expenses (and in the reports);
--   • shown separately in profit & loss (own column + "after investments"
--     result);
--   • left OUT of the regular monthly expenses and the monthly average.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Requires migration 057 (הוצאות). Safe to run more than once.
-- ---------------------------------------------------------------------------

ALTER TABLE "הוצאות"
  ADD COLUMN IF NOT EXISTS "השקעה_לטווח_ארוך" boolean NOT NULL DEFAULT false;

-- Verify (read-only): should list the new column.
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'הוצאות' AND column_name = 'השקעה_לטווח_ארוך';
