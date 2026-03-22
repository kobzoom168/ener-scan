-- Fix billing/free-count: createScanResult requires this column (Supabase schema cache).
-- Safe to run even if already added by 009.

alter table public.scan_results
  add column if not exists from_cache boolean not null default false;
