-- Kitchen workers + attendance.
-- Server routes use the service_role client; RLS is enabled with no public
-- policies, matching the rest of the CRM tables.

create table if not exists "עובדות_מטבח" (
  id uuid primary key default gen_random_uuid(),
  "שם_עובדת" text not null,
  "טלפון" text,
  "תפקיד" text,
  "פעילה" boolean not null default true,
  "הערות" text,
  "תאריך_יצירה" timestamptz not null default now(),
  "תאריך_עדכון" timestamptz not null default now()
);

create table if not exists "נוכחות_עובדות" (
  id uuid primary key default gen_random_uuid(),
  "עובדת_id" uuid not null references "עובדות_מטבח"(id) on delete restrict,
  "תאריך" date not null,
  "שעת_כניסה" time not null,
  "שעת_יציאה" time,
  "סהכ_שעות" numeric(6,2),
  "סטטוס" text not null default 'פתוח' check ("סטטוס" in ('פתוח', 'הושלם', 'חסרה יציאה')),
  "הערות" text,
  "תאריך_יצירה" timestamptz not null default now(),
  "תאריך_עדכון" timestamptz not null default now()
);

create index if not exists idx_עובדות_מטבח_פעילה on "עובדות_מטבח" ("פעילה", "שם_עובדת");
create index if not exists idx_נוכחות_עובדות_תאריך on "נוכחות_עובדות" ("תאריך" desc);
create index if not exists idx_נוכחות_עובדות_עובדת_תאריך on "נוכחות_עובדות" ("עובדת_id", "תאריך" desc);
create index if not exists idx_נוכחות_עובדות_פתוח on "נוכחות_עובדות" ("עובדת_id") where "סטטוס" = 'פתוח';

alter table "עובדות_מטבח" enable row level security;
alter table "נוכחות_עובדות" enable row level security;
