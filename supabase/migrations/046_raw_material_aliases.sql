-- שמות חלופיים + זיהוי כפילויות לחומרי גלם
-- שתי טבלאות עזר בלבד. לא נוגעות בשורות המלאי הקיימות, בכמויות או במתכונים.

-- שמות חלופיים (aliases) לחומר גלם קיים
create table if not exists raw_material_aliases (
  id              uuid        primary key default gen_random_uuid(),
  raw_material_id uuid        not null references מלאי_חומרי_גלם(id) on delete cascade,
  alias           text        not null,
  created_at      timestamptz not null default now()
);

-- אותו שם חלופי לא יישמר פעמיים לאותו חומר גלם
create unique index if not exists raw_material_aliases_unique
  on raw_material_aliases (raw_material_id, lower(btrim(alias)));

create index if not exists raw_material_aliases_material_idx
  on raw_material_aliases (raw_material_id);

-- הצעות כפילות שנוצרות מסריקה. status: pending / approved / rejected
create table if not exists raw_material_duplicate_suggestions (
  id                        uuid        primary key default gen_random_uuid(),
  primary_raw_material_id   uuid        not null references מלאי_חומרי_גלם(id) on delete cascade,
  duplicate_raw_material_id uuid        not null references מלאי_חומרי_גלם(id) on delete cascade,
  reason                    text,
  status                    text        not null default 'pending'
                              check (status in ('pending', 'approved', 'rejected')),
  created_at                timestamptz not null default now()
);

-- מונע הצעות כפולות עבור אותו זוג חומרי גלם (ללא תלות בכיוון)
create unique index if not exists rm_dup_suggestions_pair_unique
  on raw_material_duplicate_suggestions (
    least(primary_raw_material_id, duplicate_raw_material_id),
    greatest(primary_raw_material_id, duplicate_raw_material_id)
  );

-- RLS: גישה ישירה חסומה. רק ה-service_role (השרת דרך ה-API המאומת) ניגש.
alter table raw_material_aliases enable row level security;
alter table raw_material_duplicate_suggestions enable row level security;
