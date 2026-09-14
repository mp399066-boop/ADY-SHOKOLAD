-- 053_order_multi_recipients.sql
-- ---------------------------------------------------------------------------
-- הזמנה אחת — כמה נמענים (multi-recipient orders).
--
-- Use case: one paying customer orders gifts for N people. Each recipient has
-- their own name / phone / address / greeting, and may receive different items
-- (or all the same items). The ORDER stays a single financial unit — one
-- customer, one total, one invoice, one payment — only the *fulfilment* side
-- fans out per recipient.
--
-- What this adds:
--   1. נמעני_הזמנה  — the recipients of an order.
--   2. מוצרים_בהזמנה.נמען_id — which recipient a line belongs to.
--                              NULL = "for the whole order" (legacy + shared
--                              lines such as delivery fees / discounts).
--   3. משלוחים.נמען_id — one delivery row per recipient.
--   4. הזמנות.מרובה_נמענים — flag so the UI/API know to fan out.
--
-- The UNIQUE(הזמנה_id) constraint from migration 030 is replaced by two
-- partial unique indexes that keep the exact same invariant for classic
-- single-recipient orders while allowing one row per recipient:
--     * at most ONE order-level delivery row (נמען_id IS NULL)
--     * at most ONE delivery row per (order, recipient)
-- NULLs are distinct in a plain UNIQUE index, so a partial index is required
-- for the first rule — a plain UNIQUE(הזמנה_id, נמען_id) would NOT stop two
-- order-level rows.
--
-- Safe to run more than once. The app keeps working before it is applied:
-- every code path treats the recipients list as optional/empty.
-- ---------------------------------------------------------------------------

-- ── 1. Recipients ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "נמעני_הזמנה" (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  "הזמנה_id"     uuid        NOT NULL REFERENCES "הזמנות"(id) ON DELETE CASCADE,
  "שם_נמען"      text        NOT NULL,
  "טלפון_נמען"   text,
  "כתובת"         text,
  "עיר"           text,
  "הוראות_משלוח" text,
  "ברכה_טקסט"    text,
  "הערות"         text,
  "סדר_תצוגה"    integer     NOT NULL DEFAULT 1,
  "תאריך_יצירה"  timestamptz NOT NULL DEFAULT now(),
  "תאריך_עדכון"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_נמעני_הזמנה_הזמנה"
  ON "נמעני_הזמנה" ("הזמנה_id", "סדר_תצוגה");

-- ── 2. Order lines belong to a recipient (NULL = order-wide) ───────────────
ALTER TABLE "מוצרים_בהזמנה"
  ADD COLUMN IF NOT EXISTS "נמען_id" uuid
  REFERENCES "נמעני_הזמנה"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_מוצרים_בהזמנה_נמען"
  ON "מוצרים_בהזמנה" ("נמען_id");

-- ── 3. One delivery per recipient ──────────────────────────────────────────
ALTER TABLE "משלוחים"
  ADD COLUMN IF NOT EXISTS "נמען_id" uuid
  REFERENCES "נמעני_הזמנה"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_משלוחים_נמען"
  ON "משלוחים" ("נמען_id");

ALTER TABLE "משלוחים" DROP CONSTRAINT IF EXISTS "משלוחים_הזמנה_id_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "משלוחים_הזמנה_ללא_נמען_uniq"
  ON "משלוחים" ("הזמנה_id")
  WHERE "נמען_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "משלוחים_הזמנה_נמען_uniq"
  ON "משלוחים" ("הזמנה_id", "נמען_id")
  WHERE "נמען_id" IS NOT NULL;

-- ── 4. Order-level flag ────────────────────────────────────────────────────
ALTER TABLE "הזמנות"
  ADD COLUMN IF NOT EXISTS "מרובה_נמענים" boolean NOT NULL DEFAULT false;

-- ── 5. RLS — same posture as every other business table (migration 011):
--    RLS on, no policies ⇒ deny-all for anon/authenticated; the server's
--    service_role client bypasses it.
ALTER TABLE "נמעני_הזמנה" ENABLE ROW LEVEL SECURITY;
