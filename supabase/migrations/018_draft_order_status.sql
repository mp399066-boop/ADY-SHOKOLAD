-- 018: Add 'טיוטה' (draft) to order status allowed values
-- Run this in Supabase SQL editor to allow draft orders.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = '"הזמנות"'::regclass AND c.contype = 'c'
    AND a.attname = 'סטטוס_הזמנה';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "הזמנות" DROP CONSTRAINT %I', v_conname);
  END IF;
END;
$$;

ALTER TABLE "הזמנות"
  ADD CONSTRAINT "הזמנות_סטטוס_check"
  CHECK ("סטטוס_הזמנה" IN ('חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה', 'הושלמה בהצלחה', 'בוטלה', 'טיוטה'));
