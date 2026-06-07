-- קישור חומר גלם כפול אל החומר הראשי (לארגון/תצוגה/חיפוש בלבד).
-- לא מוחק שורות, לא ממזג כמויות, לא נוגע במתכונים.

-- עמודת הורה: חומר כפול מצביע אל החומר הראשי שלו
alter table מלאי_חומרי_גלם
  add column if not exists parent_raw_material_id uuid
  references מלאי_חומרי_גלם(id);

create index if not exists raw_materials_parent_idx
  on מלאי_חומרי_גלם (parent_raw_material_id);

-- Backfill: הצעות כפילות שכבר אושרו לפני התיקון — נחבר אותן עכשיו.
-- רק קישור. אין שינוי כמויות, אין מחיקה.
update מלאי_חומרי_גלם m
set parent_raw_material_id = s.primary_raw_material_id
from raw_material_duplicate_suggestions s
where s.status = 'approved'
  and s.duplicate_raw_material_id = m.id
  and s.primary_raw_material_id <> m.id
  and m.parent_raw_material_id is null;
