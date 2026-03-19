create extension if not exists "pgcrypto";

create table if not exists public.scan_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  request_status text not null default 'pending',
  flow_version integer,
  scan_job_id text,
  birthdate_used text,
  used_saved_birthdate boolean not null default false,
  request_source text not null default 'line',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scan_requests_user_id_created_at
  on public.scan_requests(user_id, created_at desc);

create index if not exists idx_scan_requests_status
  on public.scan_requests(request_status);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_scan_requests_set_updated_at on public.scan_requests;
create trigger trg_scan_requests_set_updated_at
before update on public.scan_requests
for each row execute function public.set_updated_at();

