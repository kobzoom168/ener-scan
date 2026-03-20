-- Add paid entitlement columns to `public.app_users` if missing.
-- This is required by paid access + quota enforcement logic.

alter table public.app_users
  add column if not exists paid_remaining_scans integer not null default 0;

alter table public.app_users
  add column if not exists paid_until bigint;

alter table public.app_users
  add column if not exists paid_plan_code text;

