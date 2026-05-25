-- ─────────────────────────────────────────────────────────────────────────
-- 044_recipe_production_target.sql
-- Adds polymorphic production target to מתכונים so each recipe can
-- declare whether it produces a sale product (default, existing
-- behavior) OR a petit-four type. Existing מוצר_id stays for backward
-- compatibility and is backfilled into the new columns.
--
-- Smallest possible move: two columns. We did NOT collapse into a
-- single JSONB or a separate join table because (a) cardinality is
-- 1-to-1 per recipe (one recipe → one target), (b) the production
-- route needs a cheap WHERE clause on the type, and (c) keeping it in
-- מתכונים lets the existing recipes UI render the link inline without
-- an extra join.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Discriminator: which table production targets. Default keeps
--    existing recipes behaving exactly as before (sale_product).
ALTER TABLE מתכונים
  ADD COLUMN IF NOT EXISTS production_target_type TEXT
    NOT NULL
    DEFAULT 'sale_product'
    CHECK (production_target_type IN ('sale_product', 'petit_four'));

-- 2. Target id. Nullable — a recipe with no link blocks production
--    (matches the existing מוצר_id IS NULL → blocked semantics). No FK
--    because the id may reference either מוצרים_למכירה(id) or
--    סוגי_פטיפורים(id); the API enforces this at write time.
ALTER TABLE מתכונים
  ADD COLUMN IF NOT EXISTS production_target_id UUID;

-- 3. Backfill existing rows: any recipe with a non-null מוצר_id is a
--    sale-product recipe — copy the id over. Recipes without a link
--    stay unlinked (production_target_id stays NULL → still blocked
--    by the production route's existing gate).
UPDATE מתכונים
   SET production_target_type = 'sale_product',
       production_target_id   = מוצר_id
 WHERE מוצר_id IS NOT NULL
   AND production_target_id IS NULL;

-- 4. Helpful index for the production route's join-by-id query.
CREATE INDEX IF NOT EXISTS idx_מתכונים_production_target
  ON מתכונים(production_target_type, production_target_id);

COMMENT ON COLUMN מתכונים.production_target_type IS
  'Production destination table: ''sale_product'' → מוצרים_למכירה, ''petit_four'' → סוגי_פטיפורים. Default sale_product (legacy behavior).';
COMMENT ON COLUMN מתכונים.production_target_id IS
  'Row id in the table named by production_target_type. NULL = recipe unlinked → production blocked.';
