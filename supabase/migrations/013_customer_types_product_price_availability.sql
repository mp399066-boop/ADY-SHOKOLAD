-- Migration 013: expand customer types + add price_availability to products

-- 1. Remove old CHECK constraint on סוג_לקוח (name varies by Supabase version)
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class cl ON c.conrelid = cl.oid
  WHERE cl.relname = 'לקוחות'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%סוג_לקוח%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "לקוחות" DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END;
$$;

-- 2. Add new CHECK constraint allowing all five customer types
ALTER TABLE "לקוחות"
  ADD CONSTRAINT "לקוחות_סוג_לקוח_check"
  CHECK ("סוג_לקוח" IN ('פרטי', 'חוזר', 'עסקי', 'עסקי - קבוע', 'עסקי - כמות'));

-- 3. Add price_availability column to products
ALTER TABLE "מוצרים_למכירה"
  ADD COLUMN IF NOT EXISTS "price_availability" TEXT
  CHECK ("price_availability" IN ('retail', 'business_fixed', 'business_quantity'));

-- 4. Backfill from existing לקוחות_עסקיים_בלבד boolean
UPDATE "מוצרים_למכירה"
SET "price_availability" = CASE
  WHEN "לקוחות_עסקיים_בלבד" = TRUE THEN 'business_fixed'
  ELSE 'retail'
END
WHERE "price_availability" IS NULL;
