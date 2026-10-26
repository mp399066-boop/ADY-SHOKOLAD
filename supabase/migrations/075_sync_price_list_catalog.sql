-- 075: one-time catch-up so the price list (מחירון) and the catalog agree.
--
-- From now on the app keeps them in step on every edit (src/lib/price-sync.ts).
-- This brings the existing data to the same state:
--   1. package prices (מארזים.מחיר_מארז) ← the "מארז N" price-list row
--   2. product base prices (מוצרים_למכירה.מחיר) ← the product's regular retail row
--   3. price-list rows' product name / code ← the product's current name / code
-- The price list wins for prices because it is what orders already charge.
--
-- Run manually in the Supabase SQL Editor. Safe to run more than once.

-- 1. Packages
UPDATE "מארזים" m
SET "מחיר_מארז" = p."מחיר", "תאריך_עדכון" = now()
FROM "מחירון" p
WHERE p."מוצר_id" IS NULL
  AND p."פעיל" = true AND p.price_type = 'retail' AND p.min_quantity IS NULL
  AND p.product_name_snapshot ~ '^\s*מארז\s+[0-9]+\s*(פטיפורים)?\s*$'
  AND m."גודל_מארז" = substring(p.product_name_snapshot FROM '[0-9]+')::int
  AND m."מחיר_מארז" IS DISTINCT FROM p."מחיר";

-- 2. Product base prices
UPDATE "מוצרים_למכירה" pr
SET "מחיר" = p."מחיר", "תאריך_עדכון" = now()
FROM "מחירון" p
WHERE p."מוצר_id" = pr.id
  AND p."פעיל" = true AND p.price_type = 'retail' AND p.min_quantity IS NULL
  AND pr."מחיר" IS DISTINCT FROM p."מחיר";

-- 3. Names and codes on price-list rows (a product without a code keeps the row's code)
UPDATE "מחירון" p
SET product_name_snapshot = pr."שם_מוצר",
    sku = COALESCE(NULLIF(pr.sku, ''), p.sku)
FROM "מוצרים_למכירה" pr
WHERE p."מוצר_id" = pr.id
  AND pr."שם_מוצר" IS NOT NULL
  AND (p.product_name_snapshot IS DISTINCT FROM pr."שם_מוצר"
       OR (NULLIF(pr.sku, '') IS NOT NULL AND p.sku IS DISTINCT FROM pr.sku));

-- Check: package prices after the catch-up
-- SELECT "גודל_מארז", "מחיר_מארז" FROM "מארזים" ORDER BY "גודל_מארז";
