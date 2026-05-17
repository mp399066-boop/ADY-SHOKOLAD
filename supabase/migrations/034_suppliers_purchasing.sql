-- Suppliers / Purchasing module.
-- Creates ספקים table, purchase-order tables, and adds purchasing fields
-- to מלאי_חומרי_גלם so the system can track preferred supplier,
-- minimum stock, and reorder quantity per raw material.

-- ── Suppliers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ספקים" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "שם_ספק"          TEXT NOT NULL,
  "טלפון"           TEXT,
  "אימייל"          TEXT,
  "איש_קשר"         TEXT,
  "הערות"           TEXT,
  "פעיל"            BOOLEAN NOT NULL DEFAULT true,
  "תאריך_יצירה"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "תאריך_עדכון"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "ספקים" ENABLE ROW LEVEL SECURITY;

-- ── Purchase orders (header) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "הזמנות_רכש" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ספק_id"          UUID REFERENCES "ספקים"(id) ON DELETE SET NULL,
  "תאריך_הזמנה"     DATE NOT NULL DEFAULT CURRENT_DATE,
  "סטטוס"           TEXT NOT NULL DEFAULT 'נשלח',
  "הערות"           TEXT,
  "נוצר_על_ידי"     TEXT,
  "תאריך_יצירה"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "הזמנות_רכש" ENABLE ROW LEVEL SECURITY;

-- ── Purchase order line items ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "פריטי_הזמנת_רכש" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "הזמנת_רכש_id"     UUID NOT NULL REFERENCES "הזמנות_רכש"(id) ON DELETE CASCADE,
  "חומר_גלם_id"       UUID REFERENCES "מלאי_חומרי_גלם"(id) ON DELETE SET NULL,
  "שם_פריט"           TEXT NOT NULL,
  "כמות"              NUMERIC(10,3) NOT NULL,
  "יחידה"             TEXT,
  "תאריך_יצירה"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "פריטי_הזמנת_רכש" ENABLE ROW LEVEL SECURITY;

-- ── Purchasing fields on raw materials ───────────────────────────────────
ALTER TABLE "מלאי_חומרי_גלם"
  ADD COLUMN IF NOT EXISTS "ספק_מועדף_id"          UUID REFERENCES "ספקים"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "שם_מוצר_אצל_הספק"      TEXT,
  ADD COLUMN IF NOT EXISTS "מקט_ספק"                TEXT,
  ADD COLUMN IF NOT EXISTS "כמות_מינימום"            NUMERIC(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "כמות_להזמנה"             NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS "יחידת_קניה"              TEXT,
  ADD COLUMN IF NOT EXISTS "הערות_רכש"               TEXT;
