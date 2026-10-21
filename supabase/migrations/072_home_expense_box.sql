-- 072_home_expense_box.sql
-- ---------------------------------------------------------------------------
-- קופת בית — a third expense box, for home expenses paid by the business.
--
-- Same idea as קופת קורסים (065): expenses moved to 'בית' are listed in their
-- own tab on /finance and left OUT of the business expenses, the business
-- profit & loss and the monthly average.
--
-- Only the CHECK constraint changes — it now allows 'בית' too.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Requires migration 065 (column קופה). Safe to run more than once.
-- ---------------------------------------------------------------------------

ALTER TABLE "הוצאות" DROP CONSTRAINT IF EXISTS "הוצאות_קופה_check";
ALTER TABLE "הוצאות"
  ADD CONSTRAINT "הוצאות_קופה_check" CHECK ("קופה" IN ('עסק', 'קורסים', 'בית'));

-- Verify (read-only): should show the constraint with 'בית'.
SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conname = 'הוצאות_קופה_check';
