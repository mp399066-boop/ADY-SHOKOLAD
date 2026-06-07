-- מיזוג בטוח של חומר גלם כפול אל החומר הראשי — פעולה אטומית אחת (טרנזקציה).
-- נקראת מהשרת בלבד דרך RPC, אחרי אימות הרשאות.
--
-- מה הפונקציה עושה (לפי הסדר, הכל בטרנזקציה אחת):
--   1. בודקת ששני החומרים קיימים ושונים זה מזה.
--   2. בודקת שיחידת המלאי זהה. אם לא — עוצרת (MERGE_UNIT_MISMATCH), שום דבר לא משתנה.
--   3. במתכונים שבהם מופיעים גם הראשי וגם הכפול — בודקת שיחידת הרכיב זהה,
--      אחרת עוצרת (MERGE_RECIPE_UNIT_MISMATCH).
--   4. מאחדת רכיבי מתכון כפולים אל שורת הרכיב של הראשי (סכימת כמות נדרשת).
--   5. שאר רכיבי המתכון של הכפול — מפנה אל הראשי.
--   6. פריטי הזמנת רכש — מפנה אל הראשי.
--   7. שמות חלופיים (aliases) — מעביר אל הראשי + מוסיף את שם הכפול כשם חלופי.
--   8. שורות שהצביעו על הכפול כהורה — מפנה אל הראשי.
--   9. מוסיף את כמות המלאי של הכפול אל הראשי (היחידות כבר אומתו כזהות),
--      ומשלים מחיר/הערות אם חסרים בראשי.
--  10. מסמן את ההצעה approved ומוחק את שורת הכפול — רק אחרי שכל ההפניות הועברו.
--
-- הערה: תנועות_מלאי (היסטוריה) לא נוגעים בהן — הן שומרות snapshot של השם.

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
