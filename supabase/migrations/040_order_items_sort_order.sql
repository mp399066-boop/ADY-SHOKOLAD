-- Add display sort order to order items so the user-defined insertion sequence
-- is preserved across all views. Default 0 keeps existing rows valid; the
-- backfill below assigns sequential integers within each order based on
-- creation timestamp (best available proxy for insertion order).

ALTER TABLE מוצרים_בהזמנה
  ADD COLUMN IF NOT EXISTS סדר_תצוגה INTEGER NOT NULL DEFAULT 0;

-- Backfill: within each order, assign 1, 2, 3... ordered by תאריך_יצירה then id
-- (id is a UUID so it breaks ties without semantic meaning, but it's stable).
UPDATE מוצרים_בהזמנה AS t
SET סדר_תצוגה = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY הזמנה_id
           ORDER BY תאריך_יצירה, id
         ) AS rn
  FROM מוצרים_בהזמנה
) AS sub
WHERE t.id = sub.id;
