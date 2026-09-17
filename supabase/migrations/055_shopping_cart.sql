-- 055_shopping_cart.sql
-- ---------------------------------------------------------------------------
-- סל קניות (purchasing cart).
--
-- Replaces the automatic "רשימת קניות" (every raw material whose stock fell
-- below its minimum) with a cart the user fills by hand: she adds a product,
-- gives it a quantity, and the item lands automatically under the supplier
-- assigned to that raw material (מלאי_חומרי_גלם.ספק_מועדף_id).
--
-- Inside the cart an item can be moved from one supplier to another — when a
-- supplier is out of something the line is "carried over" to a supplier that
-- has it. A manual move sets הועבר_ידנית = true so nothing later re-snaps the
-- line back to the preferred supplier.
--
-- One row per raw material (partial unique index): adding the same product
-- twice adds to its quantity instead of creating a duplicate line. Free-text
-- lines (חומר_גלם_id IS NULL) are allowed and are not de-duplicated.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "סל_קניות" (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "חומר_גלם_id"    uuid          REFERENCES "מלאי_חומרי_גלם"(id) ON DELETE CASCADE,
  "שם_פריט"        text          NOT NULL,
  "כמות"            numeric(10,3) NOT NULL DEFAULT 1 CHECK ("כמות" > 0),
  "יחידה"           text,
  "ספק_id"         uuid          REFERENCES "ספקים"(id) ON DELETE SET NULL,
  "הערה"            text,
  -- true = the supplier on this line was chosen by hand in the cart
  "הועבר_ידנית"    boolean       NOT NULL DEFAULT false,
  "נוצר_על_ידי"    text,
  "תאריך_יצירה"    timestamptz   NOT NULL DEFAULT now(),
  "תאריך_עדכון"    timestamptz   NOT NULL DEFAULT now()
);

-- One line per raw material; free-text lines (NULL) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS "סל_קניות_חומר_גלם_uniq"
  ON "סל_קניות" ("חומר_גלם_id")
  WHERE "חומר_גלם_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_סל_קניות_ספק"
  ON "סל_קניות" ("ספק_id");

-- RLS — same posture as every other business table (migration 011):
-- RLS on, no policies ⇒ deny-all for anon/authenticated; the server's
-- service_role client bypasses it.
ALTER TABLE "סל_קניות" ENABLE ROW LEVEL SECURITY;
