-- Hybrid LINE + Web: publication lifecycle (additive). Does not replace scan_public_reports.
-- Requires: public.scan_results_v2 (V2 async queue), public.set_updated_at().

create extension if not exists "pgcrypto";

create table if not exists public.report_publications (
  id uuid primary key default gen_random_uuid(),
  scan_result_id uuid not null references public.scan_results_v2 (id) on delete cascade,
  status text not null
    check (status in ('pending', 'rendering', 'published', 'failed', 'expired')),
  public_token text not null,
  report_url text,
  rendered_html_path text,
  expires_at timestamptz,
  published_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_publications_public_token_key unique (public_token),
  constraint report_publications_scan_result_id_key unique (scan_result_id)
);

create index if not exists idx_report_publications_status_created
  on public.report_publications (status, created_at desc);

create index if not exists idx_report_publications_expires_at
  on public.report_publications (expires_at);

-- Lookup by scan_result_id: covered by unique constraint report_publications_scan_result_id_key.

comment on table public.report_publications is
  'Web-primary result surface: publication state independent of LINE outbound delivery.';

comment on column public.report_publications.scan_result_id is
  'FK to scan_results_v2.id — canonical row for V2 async worker output per scan_jobs.';

drop trigger if exists trg_report_publications_set_updated_at on public.report_publications;
create trigger trg_report_publications_set_updated_at
before update on public.report_publications
for each row execute function public.set_updated_at();
