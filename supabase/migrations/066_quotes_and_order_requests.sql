-- 066_quotes_and_order_requests.sql
-- ---------------------------------------------------------------------------
-- כלי מכירות — two new tables behind the /sales page.
--
--   הצעות_מחיר   — price quotes for (mostly business) customers. The owner
--                  builds a quote, sends the customer a private link
--                  (/q/<token>), the customer approves it there, and one
--                  click turns it into a draft order (טיוטה) she finalizes
--                  on the regular new-order screen.
--
--   בקשות_הזמנה  — requests sent from the public order form
--                  (/order-form/<token>). Nothing is written to לקוחות or
--                  הזמנות until the owner approves a request; approving it
--                  finds/creates the customer and opens a draft order.
--
-- The public order-form link token lives in system_config
-- ('order_form_token'); empty = the form is closed.
--
-- RLS on, no policies — same posture as every business table (migration
-- 011): only the server (service_role) reads and writes these tables.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "הצעות_מחיר" (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "מספר_הצעה"             text          NOT NULL UNIQUE,
  "לקוח_id"               uuid          NOT NULL REFERENCES "לקוחות"(id) ON DELETE CASCADE,
  "סטטוס"                 text          NOT NULL DEFAULT 'טיוטה'
                                        CHECK ("סטטוס" IN ('טיוטה', 'נשלחה', 'אושרה', 'נדחתה', 'הומרה להזמנה')),
  "פריטים"                jsonb         NOT NULL DEFAULT '[]'::jsonb,
  "סוג_הנחה"              text          NOT NULL DEFAULT 'ללא' CHECK ("סוג_הנחה" IN ('ללא', 'אחוז', 'סכום')),
  "ערך_הנחה"              numeric(10,2) NOT NULL DEFAULT 0 CHECK ("ערך_הנחה" >= 0),
  "דמי_משלוח"             numeric(10,2) NOT NULL DEFAULT 0 CHECK ("דמי_משלוח" >= 0),
  "סכום_לפני_הנחה"        numeric(10,2) NOT NULL DEFAULT 0,
  "סכום_הנחה"             numeric(10,2) NOT NULL DEFAULT 0,
  "סך_הכל"                numeric(10,2) NOT NULL DEFAULT 0,
  "תוקף_עד"               date,
  "תאריך_אספקה_מבוקש"     date,
  "הערות_ללקוח"           text,
  "הערות_פנימיות"         text,
  "טוקן"                  text          NOT NULL UNIQUE,
  "תאריך_שליחה"           timestamptz,
  "תאריך_אישור"           timestamptz,
  "שם_המאשר"              text,
  "הזמנה_id"              uuid          REFERENCES "הזמנות"(id) ON DELETE SET NULL,
  "נוצר_על_ידי"           text,
  "תאריך_יצירה"           timestamptz   NOT NULL DEFAULT now(),
  "תאריך_עדכון"           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_הצעות_מחיר_לקוח" ON "הצעות_מחיר" ("לקוח_id");
CREATE INDEX IF NOT EXISTS "idx_הצעות_מחיר_סטטוס" ON "הצעות_מחיר" ("סטטוס");
ALTER TABLE "הצעות_מחיר" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "בקשות_הזמנה" (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "סטטוס"                 text          NOT NULL DEFAULT 'חדשה'
                                        CHECK ("סטטוס" IN ('חדשה', 'הומרה להזמנה', 'נדחתה')),
  "שם_מלא"                text          NOT NULL,
  "טלפון"                 text          NOT NULL,
  "אימייל"                text,
  "פריטים"                jsonb         NOT NULL DEFAULT '[]'::jsonb,
  "סכום_משוער"            numeric(10,2) NOT NULL DEFAULT 0,
  "סוג_אספקה"             text          NOT NULL DEFAULT 'איסוף עצמי' CHECK ("סוג_אספקה" IN ('משלוח', 'איסוף עצמי')),
  "תאריך_אספקה"           date,
  "שם_מקבל"               text,
  "טלפון_מקבל"            text,
  "כתובת"                 text,
  "עיר"                   text,
  "ברכה"                  text,
  "הערות"                 text,
  "הזמנה_id"              uuid          REFERENCES "הזמנות"(id) ON DELETE SET NULL,
  "לקוח_id"               uuid          REFERENCES "לקוחות"(id) ON DELETE SET NULL,
  "טופל_על_ידי"           text,
  "תאריך_טיפול"           timestamptz,
  "תאריך_יצירה"           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_בקשות_הזמנה_סטטוס" ON "בקשות_הזמנה" ("סטטוס", "תאריך_יצירה" DESC);
CREATE INDEX IF NOT EXISTS "idx_בקשות_הזמנה_טלפון" ON "בקשות_הזמנה" ("טלפון", "תאריך_יצירה" DESC);
ALTER TABLE "בקשות_הזמנה" ENABLE ROW LEVEL SECURITY;

-- The public order form starts closed — the owner opens it on /sales.
INSERT INTO public.system_config (key, value)
VALUES ('order_form_token', '')
ON CONFLICT (key) DO NOTHING;

-- Verify (read-only): both tables exist with RLS on.
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('הצעות_מחיר', 'בקשות_הזמנה');
