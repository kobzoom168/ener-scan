-- Ener Scan V2: async scan pipeline (DB-backed queues, optional Redis in app layer)
-- Run on Supabase SQL editor or migration runner after prior migrations.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 3.1 scan_uploads
-- ---------------------------------------------------------------------------
create table if not exists public.scan_uploads (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  line_message_id text not null,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint,
  sha256 text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scan_uploads_line_user_created
  on public.scan_uploads(line_user_id, created_at desc);

create unique index if not exists uq_scan_uploads_line_message
  on public.scan_uploads(line_message_id);

-- ---------------------------------------------------------------------------
-- 3.2 scan_jobs
-- ---------------------------------------------------------------------------
create table if not exists public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  upload_id uuid not null references public.scan_uploads(id) on delete cascade,
  birthdate_snapshot text,
  access_source text not null check (access_source in ('paid','free','admin_comp')),
  status text not null check (
    status in (
      'queued',
      'processing',
      'completed',
      'delivery_queued',
      'delivered',
      'failed',
      'cancelled'
    )
  ) default 'queued',
  priority smallint not null default 100,
  attempt_count integer not null default 0,
  worker_id text,
  locked_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  result_id uuid,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scan_jobs_status_priority_created
  on public.scan_jobs(status, priority asc, created_at asc);

create index if not exists idx_scan_jobs_line_user_created
  on public.scan_jobs(line_user_id, created_at desc);

drop trigger if exists trg_scan_jobs_set_updated_at on public.scan_jobs;
create trigger trg_scan_jobs_set_updated_at
before update on public.scan_jobs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.3 scan_results_v2
-- ---------------------------------------------------------------------------
create table if not exists public.scan_results_v2 (
  id uuid primary key default gen_random_uuid(),
  scan_job_id uuid not null references public.scan_jobs(id) on delete cascade,
  line_user_id text not null,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  raw_text text,
  formatted_text text,
  flex_payload_json jsonb,
  report_payload_json jsonb,
  report_url text,
  html_public_token text,
  quality_tier text,
  validation_reason text,
  from_cache boolean not null default false,
  model_name text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_scan_results_v2_job
  on public.scan_results_v2(scan_job_id);

-- scan_jobs.result_id points to scan_results_v2.id (no FK: avoids circular ref with scan_results_v2.scan_job_id)

-- ---------------------------------------------------------------------------
-- 3.4 outbound_messages
-- ---------------------------------------------------------------------------
create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  kind text not null check (
    kind in (
      'pre_scan_ack',
      'scan_result',
      'approve_notify',
      'reject_notify',
      'payment_qr',
      'pending_intro',
      'slip_received'
    )
  ),
  priority smallint not null default 100,
  related_job_id uuid references public.scan_jobs(id) on delete set null,
  related_payment_id uuid references public.payments(id) on delete set null,
  payload_json jsonb not null,
  status text not null check (
    status in ('queued','sending','sent','retry_wait','failed','dead')
  ) default 'queued',
  attempt_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  next_retry_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outbound_messages_ready
  on public.outbound_messages(status, priority asc, next_retry_at asc nulls first, created_at asc);

create index if not exists idx_outbound_messages_line_user_created
  on public.outbound_messages(line_user_id, created_at desc);

drop trigger if exists trg_outbound_messages_set_updated_at on public.outbound_messages;
create trigger trg_outbound_messages_set_updated_at
before update on public.outbound_messages
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.5 conversation_state
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_state (
  line_user_id text primary key,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  flow_state text,
  payment_state text,
  pending_upload_id uuid references public.scan_uploads(id) on delete set null,
  selected_package_key text,
  birthdate_change_state text,
  reply_token_spent boolean not null default false,
  pending_approved_intro_compensation jsonb,
  last_inbound_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_conversation_state_set_updated_at on public.conversation_state;
create trigger trg_conversation_state_set_updated_at
before update on public.conversation_state
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.6 payment_notifications
-- ---------------------------------------------------------------------------
create table if not exists public.payment_notifications (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  line_user_id text not null,
  notify_status text not null check (
    notify_status in ('queued','sending','sent','retry_wait','failed')
  ) default 'queued',
  pending_intro_queued boolean not null default false,
  last_attempt_at timestamptz,
  attempt_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_payment_notifications_set_updated_at on public.payment_notifications;
create trigger trg_payment_notifications_set_updated_at
before update on public.payment_notifications
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: atomic claim scan job (worker-scan)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- RPC: atomic claim outbound message (worker-delivery)
-- ---------------------------------------------------------------------------
create or replace function public.claim_next_outbound_message(p_worker_id text)
returns public.outbound_messages
language plpgsql
as $$
declare
  r public.outbound_messages;
  updated_count int;
begin
  update public.outbound_messages m
  set
    status = 'sending',
    attempt_count = m.attempt_count + 1,
    updated_at = now()
  from (
    select id
    from public.outbound_messages
    where status in ('queued', 'retry_wait')
      and (next_retry_at is null or next_retry_at <= now())
    order by priority asc, created_at asc
    limit 1
    for update skip locked
  ) picked
  where m.id = picked.id
  returning m.* into r;

  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    return null;
  end if;
  return r;
end;
$$;

grant execute on function public.claim_next_scan_job(text) to service_role;
grant execute on function public.claim_next_outbound_message(text) to service_role;
