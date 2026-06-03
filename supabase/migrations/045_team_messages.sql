-- צ'אט צוות פנימי — הודעות קצרות בין עובדי המטבח לעדי/הנהלה
create table if not exists team_messages (
  id          uuid        primary key default gen_random_uuid(),
  sender_name text,
  message     text        not null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists team_messages_created_at_idx
  on team_messages (created_at desc);

-- RLS: גישה ישירה חסומה. רק ה-service_role (השרת, דרך ה-API routes
-- שמאומתים מול authorized_users) יכול לקרוא/לכתוב. אין policy ל-anon/authenticated.
alter table team_messages enable row level security;
