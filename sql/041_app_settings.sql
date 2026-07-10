-- Generic runtime settings (key → jsonb) editable from admin pages without a
-- container restart. First consumer: voice_note (เสียงอาจารย์ท้าย report).
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on app_settings to service_role;
-- แอปต่อ PostgREST ด้วย anon key (role web_anon) — ต้องเขียนได้ด้วย
grant select, insert, update, delete on app_settings to web_anon;
