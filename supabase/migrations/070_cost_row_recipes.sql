-- 070_cost_row_recipes.sql
-- ---------------------------------------------------------------------------
-- תתי-מתכונים למוצר בטבלת העלויות (/costs).
--
-- A product is usually built from several recipes, each with its own yield:
-- e.g. פטיפור נופך = עוגיות (100 יח׳ לאצווה) + קרמו (120) + דיסקית שוקולד
-- (250) + ריסוס + אבני מרנג. Until now a cost row could point at ONE recipe
-- only (עלויות_מוצרים.מתכון_id), so the per-unit material cost was wrong.
--
-- This table links a cost row to any number of sub-recipes. For each link,
-- "יחידות_מהמתכון" = how many units of THIS product one batch of the recipe
-- is enough for (defaults to the recipe's own כמות_תוצר in the app, but can
-- differ per product — the same cream may cover 120 small petit-fours or 60
-- large ones).
--
--   עלות חומרים ליחידה = Σ (עלות אצווה של המתכון ÷ יחידות_מהמתכון)
--
-- עלויות_מוצרים.מתכון_id stays (first linked recipe) for older screens.
-- Existing single-recipe links are copied over with the recipe's yield, so
-- every current cost stays exactly the same after running this.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "מתכוני_עלות" (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "עלות_id"          uuid          NOT NULL REFERENCES "עלויות_מוצרים"(id) ON DELETE CASCADE,
  "מתכון_id"         uuid          NOT NULL REFERENCES "מתכונים"(id) ON DELETE CASCADE,
  "יחידות_מהמתכון"   numeric(10,2) NOT NULL CHECK ("יחידות_מהמתכון" > 0),
  "סדר"              integer       NOT NULL DEFAULT 0,
  "תאריך_יצירה"      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT "uq_מתכוני_עלות" UNIQUE ("עלות_id", "מתכון_id")
);

CREATE INDEX IF NOT EXISTS "idx_מתכוני_עלות_מתכון" ON "מתכוני_עלות" ("מתכון_id");

-- RLS on, no policies ⇒ deny-all for browser keys; the server's
-- service_role client bypasses it (same posture as every business table).
ALTER TABLE "מתכוני_עלות" ENABLE ROW LEVEL SECURITY;

-- Copy existing single-recipe links (keeps today's numbers unchanged).
INSERT INTO "מתכוני_עלות" ("עלות_id", "מתכון_id", "יחידות_מהמתכון", "סדר")
SELECT c.id, c."מתכון_id", GREATEST(coalesce(r."כמות_תוצר", 1), 0.01), 0
  FROM "עלויות_מוצרים" c
  JOIN "מתכונים" r ON r.id = c."מתכון_id"
 WHERE c."מתכון_id" IS NOT NULL
ON CONFLICT ("עלות_id", "מתכון_id") DO NOTHING;

-- Verify (read-only): number of links copied.
SELECT count(*) AS "קישורים" FROM "מתכוני_עלות";
