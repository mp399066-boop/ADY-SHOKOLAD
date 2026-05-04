-- טבלת משתמשים מורשים — שכבת הרשאות מעל Supabase Auth
create table if not exists authorized_users (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null unique,
  role       text        not null default 'staff',
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);

-- RLS: מפעיל אבטחה ברמת שורה — אנונימי/authenticated לא יכולים לגשת ישירות
alter table authorized_users enable row level security;

-- service_role key עוקף RLS אוטומטית — זה מה שהשרת ישתמש בו
-- authenticated users יכולים לקרוא רק את השורה שלהם (לשימוש עתידי)
create policy "users can read own record"
  on authorized_users
  for select
  to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- רשומת אדמין ראשונית
insert into authorized_users (email, role, is_active)
values ('mp399066@gmail.com', 'admin', true)
on conflict (email) do nothing;
