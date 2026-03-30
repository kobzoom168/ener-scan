-- Public HTML report rows: token-based access, payload mirrors app ReportPayload shape.
-- Run on Supabase after deploy. Server uses service role to read/write.

create table if not exists public.scan_public_reports (
  id uuid primary key default gen_random_uuid(),
  scan_result_id uuid not null references public.scan_results (id) on delete cascade,
  public_token text not null,
  report_payload jsonb not null,
  report_version text not null,
  created_at timestamptz not null default now(),
  constraint scan_public_reports_scan_result_id_key unique (scan_result_id),
  constraint scan_public_reports_public_token_key unique (public_token)
);

create index if not exists idx_scan_public_reports_public_token
  on public.scan_public_reports (public_token);

comment on table public.scan_public_reports is 'LINE scan result: public token + JSON payload for /r/:token HTML report';
