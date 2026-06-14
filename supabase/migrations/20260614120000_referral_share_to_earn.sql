-- Share-to-earn referral: bonus scan credits + referral linkage.
-- Additive and idempotent. Existing rows/behavior unaffected until ENABLE_REFERRAL=true.

alter table public.app_users
  add column if not exists referral_code text,
  add column if not exists referred_by_app_user_id uuid references public.app_users (id),
  add column if not exists bonus_scan_credits integer not null default 0,
  add column if not exists referral_reward_granted_at timestamptz;

-- Each referral code is unique (partial index allows many NULLs before lazy assignment).
create unique index if not exists uq_app_users_referral_code
  on public.app_users (referral_code)
  where referral_code is not null;

create index if not exists idx_app_users_referred_by
  on public.app_users (referred_by_app_user_id);

-- Allow 'bonus' as a scan_jobs access source so bonus-credit scans can be
-- consumed post-delivery (mirrors the 'paid' decrement path).
alter table public.scan_jobs
  drop constraint if exists scan_jobs_access_source_check;
alter table public.scan_jobs
  add constraint scan_jobs_access_source_check
  check (access_source in ('paid', 'free', 'admin_comp', 'bonus'));
