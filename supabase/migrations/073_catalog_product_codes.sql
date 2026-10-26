-- 073: product codes from the owner's catalog ("קטלוג - פטיפורים וקינוחי בוטיק", Oct 2026).
--
-- Sets מוצרים_למכירה.sku to the catalog code for every product whose name
-- clearly matches a catalog item, replacing the auto-generated PRD-codes.
-- Matching is by exact (trimmed) product name, so re-running is harmless.
-- Catalog items with no product in the system (or an uncertain match) are
-- listed at the bottom and left untouched.
--
-- Run manually in the Supabase SQL Editor.

UPDATE "מוצרים_למכירה" AS p
SET    "sku" = c.code, "תאריך_עדכון" = now()
FROM (VALUES
  -- פטיפורי שוקולד
  ('פטיפור אודם',   'PT001'),
  ('פטיפור ברקת',   'PT002'),
  ('פטיפור יהלום',  'PT003'),
  ('פטיפור ישפה',   'PT004'),
  ('פטיפור לשם',    'PT005'),
  ('פטיפור נופך',   'PT006'),
  ('פטיפור ספיר',   'PT007'),
  ('פטיפור שבו',    'PT009'),
  ('פטיפור שוהם',   'PT010'),
  -- טארטלטים
  ('טארטלט שוקולד', 'TA01'),
  ('טארטלט פיצוחים', 'TA02'),
  ('טארטלים לימון', 'TA03'),
  ('טארטלט בוטנים', 'TA04'),
  -- קינוחי בוטיק
  ('טריו שיש',      'BT006')
) AS c(name, code)
WHERE trim(p."שם_מוצר") = c.name
  AND p."sku" IS DISTINCT FROM c.code;

-- Not set — no matching product in the system, or the match is uncertain:
--   PT008 פטדה                 — exists only as a petit-four type, not as a product
--   TA05  טארטלט חלווה ושקדים  — no product
--   BT001 אופרה טעמי           — maybe "אופרה"?
--   BT002 אופרה תות            — no product
--   BT003 מיני קייק מוס        — no product
--   BT004 ספלת קפה ופקאן קראנצי — no product
--   BT005 ספירלת מוקה ופרלינה  — no product
--   BT007 קפסולת מוס קטיפה     — maybe "מיני קפסולה"?
--   BT008 כרית מוס קטיפה       — maybe "מיני כרית"?
--   BT009 מדליון מוס           — no product
--   BB01–BB06 (קרימקוקי, רול קוקוס, חטיף אצבע, פופקייק, חטיף תחרה, טעמי מרנג) — no products
--   "טארטלים לימון חלבי"       — got no code (TA03 went to "טארטלים לימון"; a code can belong to one product only)

-- Check:
-- SELECT "שם_מוצר", "sku" FROM "מוצרים_למכירה" WHERE "sku" ~ '^(PT|TA|BT|BB)' ORDER BY "sku";
