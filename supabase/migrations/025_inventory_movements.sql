-- ============================================================================
-- Migration 025: Inventory movements ledger.
--
-- Adds תנועות_מלאי — a single append-only log of every stock change across
-- raw materials (מלאי_חומרי_גלם), finished products (מוצרים_למכירה), and
-- petit-fours (סוגי_פטיפורים). The existing tables keep their כמות_במלאי
-- column unchanged; this table records who/what/why for each delta so the
-- "תנועות מלאי" tab can show a real history instead of a placeholder.
--
-- Sign convention: כמות is always a positive magnitude. Direction is carried
-- by סוג_תנועה ('כניסה' = added, 'יציאה' = consumed, 'התאמה' = manual fix
-- where before == after is also allowed e.g. when only the threshold changed).
--
-- Source linkage: סוג_מקור + מזהה_מקור lets the UI deep-link from a movement
-- back to the order/recipe/etc that caused it.
--
-- Run manually in Supabase SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "תנועות_מלאי" (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  תאריך_יצירה    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  סוג_פריט       TEXT         NOT NULL CHECK (סוג_פריט IN ('חומר_גלם', 'מוצר', 'פטיפור')),
  מזהה_פריט      UUID         NOT NULL,
  שם_פריט        TEXT         NOT NULL,   -- snapshot at the moment of movement
  סוג_תנועה      TEXT         NOT NULL CHECK (סוג_תנועה IN ('כניסה', 'יציאה', 'התאמה')),
  כמות           NUMERIC(10,3) NOT NULL,  -- positive magnitude; sign in סוג_תנועה
  כמות_לפני      NUMERIC(10,3) NOT NULL,
  כמות_אחרי      NUMERIC(10,3) NOT NULL,
  סוג_מקור       TEXT         NOT NULL CHECK (סוג_מקור IN ('הזמנה', 'ידני', 'מערכת')),
  מזהה_מקור      UUID,                     -- e.g. order id when סוג_מקור='הזמנה'
  הערות          TEXT,
  נוצר_על_ידי   TEXT
);

-- Per-item history lookup (most common UI query).
CREATE INDEX IF NOT EXISTS "תנועות_מלאי_פריט_idx"
  ON "תנועות_מלאי" (סוג_פריט, מזהה_פריט, תאריך_יצירה DESC);

-- Source lookup — "show all movements caused by order X".
CREATE INDEX IF NOT EXISTS "תנועות_מלאי_מקור_idx"
  ON "תנועות_מלאי" (סוג_מקור, מזהה_מקור)
  WHERE מזהה_מקור IS NOT NULL;

-- Recent activity feed.
CREATE INDEX IF NOT EXISTS "תנועות_מלאי_תאריך_idx"
  ON "תנועות_מלאי" (תאריך_יצירה DESC);

-- Match the project-wide RLS pattern (migration 011): enabled, no policies.
-- Server code uses the service_role key which bypasses RLS automatically.
ALTER TABLE "תנועות_מלאי" ENABLE ROW LEVEL SECURITY;

-- Verify.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'תנועות_מלאי'
 ORDER BY ordinal_position;
