-- 076: stock changes that can't overwrite each other + no duplicate orders on double-submit.
--
-- 1. adjust_stock(kind, id, delta): changes כמות_במלאי in ONE statement
--    (כמות = כמות + delta) and returns the value before/after. Two orders that
--    touch the same item at the same moment no longer lose one of the changes.
-- 2. הזמנות.client_request_id + a UNIQUE index: the order screen sends a
--    request id with every "create order"; a second copy of the same request
--    (double click, retry) now gets the first order back instead of a new one.
--
-- The app keeps working before this is run (it falls back to the old way).
-- Run manually in the Supabase SQL Editor. Safe to run more than once.

-- 1. Atomic stock change
CREATE OR REPLACE FUNCTION adjust_stock(p_kind text, p_id uuid, p_delta numeric)
RETURNS TABLE(before_qty numeric, after_qty numeric, item_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kind = 'מוצר' THEN
    RETURN QUERY
      WITH u AS (
        UPDATE "מוצרים_למכירה"
        SET "כמות_במלאי" = COALESCE("כמות_במלאי", 0) + p_delta
        WHERE id = p_id
        RETURNING "כמות_במלאי"::numeric AS q, "שם_מוצר"::text AS n
      )
      SELECT u.q - p_delta, u.q, u.n FROM u;
  ELSIF p_kind = 'פטיפור' THEN
    RETURN QUERY
      WITH u AS (
        UPDATE "סוגי_פטיפורים"
        SET "כמות_במלאי" = COALESCE("כמות_במלאי", 0) + p_delta
        WHERE id = p_id
        RETURNING "כמות_במלאי"::numeric AS q, "שם_פטיפור"::text AS n
      )
      SELECT u.q - p_delta, u.q, u.n FROM u;
  ELSIF p_kind = 'חומר_גלם' THEN
    RETURN QUERY
      WITH u AS (
        UPDATE "מלאי_חומרי_גלם"
        SET "כמות_במלאי" = COALESCE("כמות_במלאי", 0) + p_delta
        WHERE id = p_id
        RETURNING "כמות_במלאי"::numeric AS q, "שם_חומר_גלם"::text AS n
      )
      SELECT u.q - p_delta, u.q, u.n FROM u;
  ELSE
    RAISE EXCEPTION 'adjust_stock: unknown kind %', p_kind;
  END IF;
END;
$$;

-- Server only (the app calls it with the service key) — never from a browser.
REVOKE ALL ON FUNCTION adjust_stock(text, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION adjust_stock(text, uuid, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION adjust_stock(text, uuid, numeric) TO service_role;

-- 2. Order double-submit guard
ALTER TABLE "הזמנות" ADD COLUMN IF NOT EXISTS client_request_id text;
CREATE UNIQUE INDEX IF NOT EXISTS "הזמנות_client_request_id_key"
  ON "הזמנות" (client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Tell the API about the new function/column right away.
NOTIFY pgrst, 'reload schema';
