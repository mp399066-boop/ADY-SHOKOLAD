-- ============================================================================
-- 031 — hide_from_deliveries flag on הזמנות
-- ============================================================================
-- The deliveries dashboard shows two kinds of rows:
--   (a) real משלוחים rows (status != 'נמסר')
--   (b) "synthetic" placeholder rows generated on-the-fly from orders that
--       LOOK like deliveries (address / fee / סוג_אספקה=משלוח) but have
--       no real משלוחים row yet
--
-- Deleting a synthetic row used to just remove it from the page state —
-- on refetch the placeholder query re-generated it from the same order
-- and the row reappeared. To make the dismissal stick, we mark the
-- ORDER as "the operator decided this isn't a delivery" so the placeholder
-- generator skips it forever.
--
-- This is a soft-delete style flag — never destroys data, never affects
-- the order page itself, only hides it from the deliveries dashboard's
-- placeholder branch. Real משלוחים rows are unaffected.
-- ============================================================================

ALTER TABLE "הזמנות"
  ADD COLUMN IF NOT EXISTS "hide_from_deliveries" boolean NOT NULL DEFAULT false;
