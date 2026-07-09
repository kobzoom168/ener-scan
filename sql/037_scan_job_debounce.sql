-- 1 ชิ้นต่อ 1 รูป (phase 2): debounce window — the first image's scan job is
-- held for N seconds (process_after); images arriving in that window attach to
-- the same job (extra_upload_ids, audit + future multi-angle) instead of
-- creating new jobs/scores. Worker claims only jobs past process_after.

alter table public.scan_jobs
  add column if not exists process_after timestamptz,
  add column if not exists extra_upload_ids jsonb not null default '[]'::jsonb;

create index if not exists idx_scan_jobs_queued_process_after
  on public.scan_jobs (status, process_after);

create or replace function public.claim_next_scan_job(p_worker_id text)
returns public.scan_jobs
language plpgsql
as $$
declare
  r public.scan_jobs;
begin
  update public.scan_jobs j
  set
    status = 'processing',
    worker_id = p_worker_id,
    locked_at = now(),
    started_at = coalesce(j.started_at, now()),
    attempt_count = j.attempt_count + 1,
    updated_at = now()
  from (
    select id
    from public.scan_jobs
    where status = 'queued'
      and (process_after is null or process_after <= now())
    order by priority asc, created_at asc
    limit 1
    for update skip locked
  ) picked
  where j.id = picked.id
  returning j.* into r;

  if not found then
    return null;
  end if;
  return r;
end;
$$;

grant execute on function public.claim_next_scan_job(text) to service_role;
