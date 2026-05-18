-- Migration 038: Employees and Work Tasks
-- עובדים — staff directory
-- משימות_עובדים — daily work assignments, optionally linked to an order

CREATE TABLE IF NOT EXISTS "עובדים" (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "שם_עובד"          TEXT        NOT NULL,
  "טלפון"            TEXT,
  "אימייל"           TEXT,
  "תפקיד"            TEXT,
  "פעיל"             BOOLEAN     NOT NULL DEFAULT true,
  "תאריך_יצירה"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "תאריך_עדכון"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "עובדים" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "משימות_עובדים" (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "שם_משימה"         TEXT        NOT NULL,
  "פירוט"            TEXT,
  "הזמנה_id"         UUID        REFERENCES "הזמנות"(id) ON DELETE SET NULL,
  "עובד_id"          UUID        REFERENCES "עובדים"(id) ON DELETE SET NULL,
  "תאריך_יעד"        DATE,
  "שעת_יעד"          TEXT,
  "סטטוס"            TEXT        NOT NULL DEFAULT 'ממתין'
    CHECK ("סטטוס" IN ('ממתין', 'בעבודה', 'הושלם', 'בוטל')),
  "עדיפות"           TEXT        NOT NULL DEFAULT 'רגיל'
    CHECK ("עדיפות" IN ('רגיל', 'דחוף')),
  "הערות"            TEXT,
  "נוצר_על_ידי"      TEXT,
  "תאריך_יצירה"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "תאריך_עדכון"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "משימות_עובדים" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_משימות_עובדים_עובד_id"    ON "משימות_עובדים"("עובד_id");
CREATE INDEX IF NOT EXISTS "idx_משימות_עובדים_הזמנה_id"  ON "משימות_עובדים"("הזמנה_id");
CREATE INDEX IF NOT EXISTS "idx_משימות_עובדים_סטטוס"     ON "משימות_עובדים"("סטטוס");
CREATE INDEX IF NOT EXISTS "idx_משימות_עובדים_תאריך_יעד" ON "משימות_עובדים"("תאריך_יעד");
