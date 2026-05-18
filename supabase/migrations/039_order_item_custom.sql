-- Migration 039: Custom/manual order line items
-- Adds שם_פריט_מותאם column to מוצרים_בהזמנה and extends the
-- סוג_שורה check constraint to allow 'מוצר_ידני' and 'תוספת_תשלום'.

-- 1. New column for the display name of manual / custom lines
ALTER TABLE "מוצרים_בהזמנה"
  ADD COLUMN IF NOT EXISTS "שם_פריט_מותאם" TEXT;

-- 2. Drop the old inline check constraint (Postgres auto-names it
--    {table}_{col}_check) and recreate with the two new values.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM   pg_constraint
  WHERE  conrelid = '"מוצרים_בהזמנה"'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) LIKE '%סוג_שורה%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "מוצרים_בהזמנה" DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE "מוצרים_בהזמנה"
  ADD CONSTRAINT "מוצרים_בהזמנה_סוג_שורה_check"
  CHECK ("סוג_שורה" IN ('מוצר', 'מארז', 'מוצר_ידני', 'תוספת_תשלום'));
