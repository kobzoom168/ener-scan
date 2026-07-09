-- LIFF onboarding profiles (registration data from the in-LINE mini app).
-- Mirrors the table hand-created on staging; needed on pro for the LIFF launch
-- and for the admin "จัดการ User" page which now joins these fields.
create table if not exists liff_profiles (
  line_user_id text primary key,
  display_name text,
  nickname text,
  phone text,
  birthdate date,
  birth_time text,
  gender text,
  interest text,
  channel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on liff_profiles to service_role;
grant select on liff_profiles to web_anon;
