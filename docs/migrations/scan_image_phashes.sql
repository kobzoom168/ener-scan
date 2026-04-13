-- Migration: create scan_image_phashes table for perceptual image deduplication
-- Run once in Supabase SQL editor

create table if not exists scan_image_phashes (
  id              uuid primary key default gen_random_uuid(),
  image_phash     text        not null,
  scan_result_id  uuid        not null references scan_results_v2(id) on delete cascade,
  report_url      text,
  line_user_id    text        not null,
  created_at      timestamptz not null default now()
);

-- Index for per-user lookups (the most common query pattern)
create index if not exists idx_scan_image_phashes_user_created
  on scan_image_phashes (line_user_id, created_at desc);

-- Optional: auto-expire old hashes after 90 days (avoids unbounded growth)
-- Requires pg_cron or manual cleanup job. Comment out if not using pg_cron.
-- select cron.schedule('delete-old-phashes', '0 3 * * *',
--   $$delete from scan_image_phashes where created_at < now() - interval '90 days'$$);
