create extension if not exists "pgcrypto";

create table if not exists public.scan_results (
  id uuid primary key default gen_random_uuid(),
  scan_request_id uuid not null references public.scan_requests(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  result_text text not null,
  result_summary text,
  energy_score numeric,
  main_energy text,
  compatibility text,
  model_name text,
  prompt_version text,
  response_time_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_scan_results_user_id_created_at
  on public.scan_results(user_id, created_at desc);

create index if not exists idx_scan_results_request_id
  on public.scan_results(scan_request_id);

