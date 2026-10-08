-- 058_product_costs.sql
-- ---------------------------------------------------------------------------
-- עלויות מוצרים — the product cost sheet behind the /costs page.
--
-- Replaces the owner's Excel "עלות בסיסי.xlsx": one row per product with
--   עלות חומרים  — either computed live from a recipe (raw-material prices ×
--                  ingredient quantities ÷ recipe yield) when
--                  "חומרים_לפי_מתכון" = TRUE, or a manual amount.
--   עלות עבודה   — production time × the hourly labor rate
--                  (system_config key 'labor_hourly_rate'). Time is entered
--                  per batch: "זמן_עבודה_דקות" minutes for
--                  "יחידות_בזמן_עבודה" units. Until a time is entered, the
--                  manual amount "עלות_עבודה_ידנית" (from the Excel) is used.
--   עלות ליחידה = עלות חומרים + עלות עבודה.
--
-- A row may link to a catalog item (sale product or petit-four type) — used
-- to show the sale price and margin — and to a recipe. Rows that are not in
-- the catalog (catering items etc.) are allowed.
--
-- Seeds every row of the Excel, auto-linking catalog items / recipes whose
-- names clearly match. Re-running skips rows that already exist
-- (same name + size), so edits made in the app are never overwritten.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "עלויות_מוצרים" (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "שם"                   text          NOT NULL,
  "גודל"                 text,
  "סוג_יעד"              text          CHECK ("סוג_יעד" IN ('sale_product', 'petit_four')),
  "יעד_id"               uuid,
  "מתכון_id"             uuid          REFERENCES "מתכונים"(id) ON DELETE SET NULL,
  "חומרים_לפי_מתכון"     boolean       NOT NULL DEFAULT false,
  "עלות_חומרים_ידנית"    numeric(10,2) CHECK ("עלות_חומרים_ידנית" >= 0),
  "זמן_עבודה_דקות"       numeric(10,2) CHECK ("זמן_עבודה_דקות" >= 0),
  "יחידות_בזמן_עבודה"    numeric(10,2) NOT NULL DEFAULT 1 CHECK ("יחידות_בזמן_עבודה" > 0),
  "עלות_עבודה_ידנית"     numeric(10,2) CHECK ("עלות_עבודה_ידנית" >= 0),
  "הערות"                text,
  "סדר"                  integer       NOT NULL DEFAULT 0,
  "עודכן_על_ידי"         text,
  "תאריך_יצירה"          timestamptz   NOT NULL DEFAULT now(),
  "תאריך_עדכון"          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT "עלויות_מוצרים_יעד_שלם" CHECK (("סוג_יעד" IS NULL) = ("יעד_id" IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_עלויות_מוצרים_שם_גודל"
  ON "עלויות_מוצרים" ("שם", coalesce("גודל", ''));

-- RLS — same posture as every other business table (migration 011):
-- RLS on, no policies ⇒ deny-all for anon/authenticated; the server's
-- service_role client bypasses it.
ALTER TABLE "עלויות_מוצרים" ENABLE ROW LEVEL SECURITY;

-- Hourly labor rate — empty until the owner sets it on the /costs page.
INSERT INTO public.system_config (key, value)
VALUES ('labor_hourly_rate', '')
ON CONFLICT (key) DO NOTHING;

-- ── Seed from "עלות בסיסי.xlsx" ────────────────────────────────────────────
-- Names are matched ignoring spaces and quote marks (' ׳ " ״), so
-- "מגנום קראנץ'" finds "מגנום קראנצ׳" either way.
WITH seed(ord, name, size, materials, labor, notes, ttype, tname, rname) AS (
  VALUES
    ( 1, 'עוגת ויטרינה',                     'קוטר 24',         80.2,  106,  NULL, 'sale_product', 'עוגת ויטרינה',               'עוגות ויטרינה פרוה'),
    ( 2, 'עוגת לוג',                          '8*30',            52,    40,   NULL, 'sale_product', 'לוג',                        NULL),
    ( 3, 'עוגה מעוצבת (עיטוף בגלידן)',        'קוטר כ 20',       40,    110,  NULL, 'sale_product', 'עוגה מעוצבת',                NULL),
    ( 4, 'פאי שוקולד',                        NULL,              47.5,  15,   NULL, 'sale_product', 'פאי שוקולד',                 NULL),
    ( 5, 'פאי פקאן',                          NULL,              NULL,  NULL, NULL, 'sale_product', 'פאי פקאן',                   NULL),
    ( 6, 'פאי לימון',                         NULL,              35,    15,   NULL, 'sale_product', 'פאי לימון',                  NULL),
    ( 7, 'אודם',                              NULL,              2.02,  2.5,  NULL, 'petit_four',   'אודם',                       'אודם - תבנית ירח'),
    ( 8, 'שבו',                               NULL,              2.36,  2.3,  NULL, 'petit_four',   'שבו',                        'שבו - תבנית עגולה חדשה'),
    ( 9, 'יהלום',                             NULL,              2.3,   4.5,  NULL, 'petit_four',   'יהלום',                      'יהלום - תבנית כדור'),
    (10, 'נופך',                              NULL,              1.6,   3.5,  NULL, 'petit_four',   'נופך',                       'נופך - תבנית שחורה קנל'),
    (11, 'ישפה',                              NULL,              1.68,  2.5,  NULL, 'petit_four',   'ישפה',                       'ישפה - תבנית להבה'),
    (12, 'שוהם',                              NULL,              1.7,   2.5,  NULL, 'petit_four',   'שוהם',                       'שוהם - כריות לוטוס'),
    (13, 'ספיר',                              NULL,              1.5,   1.9,  NULL, 'petit_four',   'ספיר',                       'ספיר - תבניות אבנים'),
    (14, 'פטדה',                              NULL,              1.53,  3,    NULL, 'petit_four',   'פטדה',                       'פטדה - תבנית עגולה'),
    (15, 'לשם',                               NULL,              2.23,  2.5,  NULL, 'petit_four',   'לשם',                        'לשם - תבנית שחורה חדשה'),
    (16, 'ברקת',                              NULL,              1.8,   2.5,  NULL, 'petit_four',   'ברקת',                       'ברקת - תבנית אליפסה'),
    (17, 'מגנום קראנץ''',                     NULL,              NULL,  NULL, NULL, 'sale_product', 'מגנום קראנצ''',              NULL),
    (18, 'מגנום שיש',                         '6.5*3',           2.2,   2,    NULL, 'sale_product', 'מגנוםם שיש',                 NULL),
    (19, 'מיני מגנום דובאי',                  NULL,              1.2,   1.8,  NULL, 'sale_product', 'מיני מגנום דובאי - פרווה',   'מיני מגנום דובאי'),
    (20, 'כוס מוס דובאי',                     NULL,              3.5,   3,    NULL, 'sale_product', 'כוס מוס דובאי',              'מוס שוקולד דובאי'),
    (21, 'מוס תות וניל',                      NULL,              2.8,   3.2,  NULL, NULL,           NULL,                         'מוס תות וניל'),
    (22, 'מוס מנגו',                          NULL,              4.8,   3,    NULL, 'sale_product', 'מוס מנגו',                   NULL),
    (23, 'טארטלט שוקולד',                     NULL,              NULL,  NULL, NULL, 'sale_product', 'טארטלט שוקולד',              'טארטלים שוקולד'),
    (24, 'טארטלט פיצוחים',                    NULL,              NULL,  NULL, NULL, 'sale_product', 'טארטלט פיצוחים',             'טארטלים פיצוחים'),
    (25, 'טארטלים לימון',                     NULL,              1.8,   1,    NULL, 'sale_product', 'טארטלים לימון',              NULL),
    (26, 'עוגת שמנת',                         NULL,              49,    81,   NULL, 'sale_product', 'עוגת שמנת - צ''יז',          'עוגות גבינה/שמנת'),
    (27, 'לוג נואר',                          '8*25',            39.5,  20.5, NULL, 'sale_product', 'לוג נואר - חלבי',            NULL),
    (28, 'טארטלים לימון חלבי',                NULL,              NULL,  1,    NULL, 'sale_product', 'טארטלים לימון חלבי',         NULL),
    (29, 'כוס דובאי חלבי',                    NULL,              5.6,   2,    NULL, 'sale_product', 'כוס דובאי חלבי',             NULL),
    (30, 'כוס טריקולד חלבי',                  NULL,              4.5,   2.4,  NULL, 'sale_product', 'כוס טריקולד חלבי',           NULL),
    (31, 'מגנום קראנץ'' - ריבת חלב',          NULL,              1.3,   2,    NULL, 'sale_product', 'מגנום ריבת חלב - חלבי',      'מגנום ריבת חלב'),
    (32, 'מגנום דובאי - חלבי',                NULL,              2.3,   2.5,  NULL, 'sale_product', 'מגנום דובאי - חלבי',         NULL),
    (33, 'תכשיט סופט כרית לקייטרינג',         '6*6',             2,     1.6,  NULL, NULL,           NULL,                         NULL),
    (34, 'תכשיט סופט לונג מרוסס',             '8*4',             1.7,   1.3,  'עלות החומרים כוללת קרטון ותחתית', NULL, NULL, NULL),
    (35, 'תכשיט סופט לונג גלסז',              '8*5',             2,     1.6,  NULL, NULL,           NULL,                         NULL),
    (36, 'רינג מרוסס',                        'קוטר 8',          1.8,   1,    'עלות החומרים כוללת קרטון ובסיס; עלות העבודה כוללת אריזה', NULL, NULL, NULL),
    (37, 'סלוג שוקולד קראנץ'' - לקייטרינג',   '6.5*3',           2.4,   1.6,  NULL, 'sale_product', 'סלוג שוקולד קראנץ''',        NULL),
    (38, 'אופרה',                             '8*2.5',           1.2,   2,    'עלות העבודה תרד כשיעשו כמות גדולה', 'sale_product', 'אופרה', NULL),
    (39, 'עוגת שמנת - אישית מלבן',            '10*15',           49,    81,   NULL, NULL,           NULL,                         NULL),
    (40, 'לוג נואר',                          '10*15',           39.5,  20.5, NULL, NULL,           NULL,                         NULL),
    (41, 'עגול',                              'קוטר 4, גובה 2',  0.23,  1,    NULL, NULL,           NULL,                         NULL),
    (42, 'מיני כרית',                         '4*4',             0.43,  1.3,  NULL, NULL,           NULL,                         NULL),
    (43, 'מיני קפסולה',                       '5.5*2.5',         0.38,  1.3,  NULL, NULL,           NULL,                         NULL),
    (44, 'קראנץ'' (קורנפלקס)',                NULL,              1,     0.5,  NULL, NULL,           NULL,                         NULL),
    (45, 'סנדוויץ עגול',                      NULL,              0.59,  0.5,  NULL, NULL,           NULL,                         NULL),
    (46, 'חיתוכיות טעמי',                     NULL,              0.58,  0.8,  NULL, NULL,           NULL,                         NULL),
    (47, 'חיתוכיות בייגלה',                   NULL,              0.48,  0.8,  NULL, NULL,           NULL,                         NULL),
    (48, 'קוקילידה',                          NULL,              0.8,   0.7,  NULL, NULL,           NULL,                         NULL),
    (49, 'ללי',                               NULL,              0.45,  0.9,  NULL, NULL,           NULL,                         NULL),
    (50, 'עוגת טורט שיש פיסטוק',              NULL,              0.61,  1,    NULL, NULL,           NULL,                         NULL),
    (51, 'טארטלט שקדים מעוטר',                NULL,              NULL,  NULL, NULL, NULL,           NULL,                         NULL),
    (52, 'מוס כיפה - פינטרסט',                NULL,              NULL,  NULL, NULL, NULL,           NULL,                         NULL),
    (53, 'טארטלט בוטנים עם דיסקית',           NULL,              NULL,  NULL, NULL, NULL,           NULL,                         NULL),
    (54, 'כיפת שוקולד, קפה ודיסקית קראנצית',  NULL,              NULL,  NULL, NULL, NULL,           NULL,                         NULL)
),
resolved AS (
  SELECT s.*,
    CASE s.ttype
      WHEN 'sale_product' THEN (
        SELECT p.id FROM "מוצרים_למכירה" p
         WHERE regexp_replace(p."שם_מוצר", '[\s''׳"״]', '', 'g') = regexp_replace(s.tname, '[\s''׳"״]', '', 'g')
         ORDER BY p."פעיל" DESC NULLS LAST LIMIT 1)
      WHEN 'petit_four' THEN (
        SELECT f.id FROM "סוגי_פטיפורים" f
         WHERE regexp_replace(f."שם_פטיפור", '[\s''׳"״]', '', 'g') = regexp_replace(s.tname, '[\s''׳"״]', '', 'g')
         ORDER BY f."פעיל" DESC NULLS LAST LIMIT 1)
    END AS target_id,
    (SELECT r.id FROM "מתכונים" r
      WHERE s.rname IS NOT NULL
        AND regexp_replace(r."שם_מתכון", '[\s''׳"״]', '', 'g') = regexp_replace(s.rname, '[\s''׳"״]', '', 'g')
      LIMIT 1) AS recipe_id
  FROM seed s
)
INSERT INTO "עלויות_מוצרים"
  ("שם", "גודל", "סוג_יעד", "יעד_id", "מתכון_id", "חומרים_לפי_מתכון",
   "עלות_חומרים_ידנית", "עלות_עבודה_ידנית", "הערות", "סדר", "עודכן_על_ידי")
SELECT r.name, r.size,
       CASE WHEN r.target_id IS NULL THEN NULL ELSE r.ttype END,
       r.target_id,
       r.recipe_id,
       -- No Excel figure but a recipe exists → start from the recipe.
       (r.materials IS NULL AND r.recipe_id IS NOT NULL),
       r.materials, r.labor, r.notes, r.ord, 'ייבוא מאקסל עלות בסיסי'
  FROM resolved r
 WHERE NOT EXISTS (
   SELECT 1 FROM "עלויות_מוצרים" c
    WHERE c."שם" = r.name AND coalesce(c."גודל", '') = coalesce(r.size, '')
 );

-- Verify (read-only, last so its result is the one the SQL Editor shows):
-- total rows, how many got linked to the catalog, and to a recipe.
SELECT count(*)                      AS "שורות",
       count("יעד_id")               AS "מקושרות_לקטלוג",
       count("מתכון_id")             AS "מקושרות_למתכון"
  FROM "עלויות_מוצרים";
