-- 071_cost_row_materials.sql
-- ---------------------------------------------------------------------------
-- חומרי גלם ישירים למוצר בטבלת העלויות (/costs).
--
-- Some of a product's cost isn't a recipe at all: a carton box, a note card,
-- a ribbon. Until now the only way to count them was to build a "recipe" for
-- a box. This table links a cost row straight to raw materials:
--
--   כמות          = how much of the material ONE unit of the product uses
--   יחידת_מידה    = the unit that כמות is in (converted to the material's
--                    own unit, like recipe ingredients — e.g. גרם ↔ ק"ג)
--
-- The product's material cost = recipes (or the manual amount) + Σ these
-- lines at the material's current price before VAT.
--
-- Raw materials referenced here can't be deleted (ON DELETE RESTRICT — same
-- as recipe ingredients), and merge_raw_material() below now moves these
-- lines to the main material too, instead of losing them.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "חומרי_עלות" (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "עלות_id"        uuid          NOT NULL REFERENCES "עלויות_מוצרים"(id) ON DELETE CASCADE,
  "חומר_גלם_id"    uuid          NOT NULL REFERENCES "מלאי_חומרי_גלם"(id) ON DELETE RESTRICT,
  "כמות"           numeric(12,4) NOT NULL CHECK ("כמות" > 0),
  "יחידת_מידה"     text          NOT NULL,
  "סדר"            integer       NOT NULL DEFAULT 0,
  "תאריך_יצירה"    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT "uq_חומרי_עלות" UNIQUE ("עלות_id", "חומר_גלם_id")
);

CREATE INDEX IF NOT EXISTS "idx_חומרי_עלות_חומר" ON "חומרי_עלות" ("חומר_גלם_id");

-- RLS on, no policies ⇒ deny-all for browser keys; the server's
-- service_role client bypasses it (same posture as every business table).
ALTER TABLE "חומרי_עלות" ENABLE ROW LEVEL SECURITY;

-- merge_raw_material (048) — same function, plus step 5b for חומרי_עלות.
create or replace function merge_raw_material(p_main uuid, p_duplicate uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_main      record;
  v_dup       record;
  v_added_qty numeric := 0;
begin
  if p_main = p_duplicate then
    raise exception 'MERGE_SAME';
  end if;

  select * into v_main from מלאי_חומרי_גלם where id = p_main;
  if not found then raise exception 'MERGE_NOT_FOUND'; end if;
  select * into v_dup  from מלאי_חומרי_גלם where id = p_duplicate;
  if not found then raise exception 'MERGE_NOT_FOUND'; end if;

  -- 2. יחידת מלאי חייבת להיות זהה.
  if btrim(coalesce(v_main.יחידת_מידה, '')) <> btrim(coalesce(v_dup.יחידת_מידה, '')) then
    raise exception 'MERGE_UNIT_MISMATCH';
  end if;

  -- 3. מתכונים שבהם מופיעים שניהם — יחידת הרכיב חייבת להיות זהה.
  if exists (
    select 1
    from רכיבי_מתכון a
    join רכיבי_מתכון b on a.מתכון_id = b.מתכון_id
    where a.חומר_גלם_id = p_main
      and b.חומר_גלם_id = p_duplicate
      and btrim(coalesce(a.יחידת_מידה, '')) <> btrim(coalesce(b.יחידת_מידה, ''))
  ) then
    raise exception 'MERGE_RECIPE_UNIT_MISMATCH';
  end if;

  -- 3b. אותו דבר לחומרי גלם ישירים בעלויות מוצרים.
  if exists (
    select 1
    from חומרי_עלות a
    join חומרי_עלות b on a.עלות_id = b.עלות_id
    where a.חומר_גלם_id = p_main
      and b.חומר_גלם_id = p_duplicate
      and btrim(a.יחידת_מידה) <> btrim(b.יחידת_מידה)
  ) then
    raise exception 'MERGE_RECIPE_UNIT_MISMATCH';
  end if;

  -- 4. איחוד כמויות במתכונים שבהם מופיעים שניהם (אל שורת הראשי).
  update רכיבי_מתכון a
  set כמות_נדרשת = a.כמות_נדרשת + b.qty
  from (
    select מתכון_id, sum(כמות_נדרשת) as qty
    from רכיבי_מתכון
    where חומר_גלם_id = p_duplicate
    group by מתכון_id
  ) b
  where a.חומר_גלם_id = p_main and a.מתכון_id = b.מתכון_id;

  -- מחיקת שורות הרכיב של הכפול במתכונים שכבר יש בהם את הראשי (אוחדו למעלה).
  delete from רכיבי_מתכון
  where חומר_גלם_id = p_duplicate
    and מתכון_id in (select מתכון_id from רכיבי_מתכון where חומר_גלם_id = p_main);

  -- 5. שאר רכיבי המתכון של הכפול (מתכונים בלי הראשי) — מפנים אל הראשי.
  update רכיבי_מתכון set חומר_גלם_id = p_main where חומר_גלם_id = p_duplicate;

  -- 5b. חומרי גלם ישירים בעלויות מוצרים — איחוד כמויות, ואז הפניה אל הראשי.
  update חומרי_עלות a
  set כמות = a.כמות + b.כמות
  from חומרי_עלות b
  where a.חומר_גלם_id = p_main and b.חומר_גלם_id = p_duplicate and a.עלות_id = b.עלות_id;
  delete from חומרי_עלות
  where חומר_גלם_id = p_duplicate
    and עלות_id in (select עלות_id from חומרי_עלות where חומר_גלם_id = p_main);
  update חומרי_עלות set חומר_גלם_id = p_main where חומר_גלם_id = p_duplicate;

  -- 6. פריטי הזמנת רכש — מפנים אל הראשי.
  update פריטי_הזמנת_רכש set חומר_גלם_id = p_main where חומר_גלם_id = p_duplicate;

  -- 7. שמות חלופיים — מוחקים כפילויות שיתנגשו, מעבירים את השאר, ומוסיפים את שם הכפול.
  delete from raw_material_aliases d
  where d.raw_material_id = p_duplicate
    and exists (
      select 1 from raw_material_aliases m
      where m.raw_material_id = p_main
        and lower(btrim(m.alias)) = lower(btrim(d.alias))
    );
  update raw_material_aliases set raw_material_id = p_main where raw_material_id = p_duplicate;
  insert into raw_material_aliases (raw_material_id, alias)
  values (p_main, btrim(v_dup.שם_חומר_גלם))
  on conflict do nothing;

  -- 8. שורות שהצביעו על הכפול כהורה — מפנים אל הראשי.
  update מלאי_חומרי_גלם set parent_raw_material_id = p_main where parent_raw_material_id = p_duplicate;

  -- 9. הוספת כמות המלאי של הכפול אל הראשי + השלמת מחיר/הערות אם חסרים.
  v_added_qty := coalesce(v_dup.כמות_במלאי, 0);
  update מלאי_חומרי_גלם
  set כמות_במלאי   = coalesce(כמות_במלאי, 0) + v_added_qty,
      מחיר_ליחידה = coalesce(מחיר_ליחידה, v_dup.מחיר_ליחידה),
      הערות        = case
                       when coalesce(btrim(הערות), '')        = '' then v_dup.הערות
                       when coalesce(btrim(v_dup.הערות), '')  = '' then הערות
                       when הערות = v_dup.הערות                     then הערות
                       else הערות || ' | ' || v_dup.הערות
                     end,
      תאריך_עדכון = now()
  where id = p_main;

  -- 10. סימון ההצעה כמאושרת ומחיקת שורת הכפול (כל ההפניות כבר הועברו).
  update raw_material_duplicate_suggestions
  set status = 'approved'
  where (primary_raw_material_id = p_main      and duplicate_raw_material_id = p_duplicate)
     or (primary_raw_material_id = p_duplicate and duplicate_raw_material_id = p_main);

  delete from מלאי_חומרי_גלם where id = p_duplicate;

  return jsonb_build_object(
    'merged',         true,
    'main_id',        p_main,
    'duplicate_id',   p_duplicate,
    'added_quantity', v_added_qty,
    'unit',           v_main.יחידת_מידה
  );
end;
$$;

-- Server-only, as in 064.
revoke execute on function merge_raw_material(uuid, uuid) from public, anon, authenticated;
grant  execute on function merge_raw_material(uuid, uuid) to service_role;

-- Verify (read-only): the new table exists and is empty-or-filled.
SELECT count(*) AS "חומרי_גלם_ישירים" FROM "חומרי_עלות";
