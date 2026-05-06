-- 017: Add retail_quantity price tier + קטגוריית_מוצר product field

-- 1. Expand price_type CHECK on מחירון to include retail_quantity
--    The column-level CHECK created in 012 gets an auto-generated name;
--    find it by table OID + column name and drop it before re-creating.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
  FROM   pg_constraint c
  JOIN   pg_attribute  a ON a.attrelid = c.conrelid
                        AND a.attnum   = ANY(c.conkey)
  WHERE  c.conrelid = '"מחירון"'::regclass
    AND  c.contype  = 'c'
    AND  a.attname  = 'price_type';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "מחירון" DROP CONSTRAINT %I', v_conname);
  END IF;
END;
$$;

ALTER TABLE "מחירון"
  ADD CONSTRAINT "מחירון_price_type_check"
  CHECK (price_type IN ('retail', 'business_quantity', 'business_fixed', 'retail_quantity'));

-- 2. Add קטגוריית_מוצר to מוצרים_למכירה (idempotent)
ALTER TABLE "מוצרים_למכירה"
  ADD COLUMN IF NOT EXISTS "קטגוריית_מוצר" TEXT NOT NULL DEFAULT 'אחר';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid = '"מוצרים_למכירה"'::regclass
      AND  conname  = 'מוצרים_קטגוריה_check'
  ) THEN
    ALTER TABLE "מוצרים_למכירה"
      ADD CONSTRAINT "מוצרים_קטגוריה_check"
      CHECK ("קטגוריית_מוצר" IN ('עוגה', 'פטיפורים', 'קינוחים', 'מארז', 'אחר'));
  END IF;
END;
$$;
