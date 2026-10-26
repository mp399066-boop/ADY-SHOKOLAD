-- 074: a customer can ask for changes to a price quote from its link (/q/<token>).
--
-- New status 'בקשת שינוי' plus the customer's request text. The owner edits
-- the quote, which sends it back to 'נשלחה' on the same link.
--
-- Run manually in the Supabase SQL Editor. Safe to run more than once.

ALTER TABLE "הצעות_מחיר" ADD COLUMN IF NOT EXISTS "בקשת_שינוי"         text;
ALTER TABLE "הצעות_מחיר" ADD COLUMN IF NOT EXISTS "תאריך_בקשת_שינוי"   timestamptz;

DO $$
DECLARE c text;
BEGIN
  -- Drop the status CHECK from migration 066 (its name was generated).
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = '"הצעות_מחיר"'::regclass AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%נשלחה%'
  LOOP
    EXECUTE format('ALTER TABLE "הצעות_מחיר" DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE "הצעות_מחיר" ADD CONSTRAINT "הצעות_מחיר_סטטוס_check"
  CHECK ("סטטוס" IN ('טיוטה', 'נשלחה', 'בקשת שינוי', 'אושרה', 'נדחתה', 'הומרה להזמנה'));
