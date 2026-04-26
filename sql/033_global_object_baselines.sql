-- Cross-account object baseline (Phase 1A: persist only; no read/reuse path yet).
-- Requires: public.set_updated_at(), extension pgcrypto (gen_random_uuid).

create extension if not exists "pgcrypto";

create table if not exists public.global_object_baselines (
  id uuid primary key default gen_random_uuid(),

  image_sha256 text,
  image_phash text,
  stable_feature_seed text,

  lane text not null,
  object_family text not null,

  baseline_schema_version integer not null default 1,
  prompt_version text,
  scoring_version text,

  object_baseline_json jsonb not null,
  axis_scores_json jsonb,
  peak_power_key text,

  thumbnail_path text,

  source_scan_result_v2_id uuid references public.scan_results_v2 (id) on delete set null,
  source_upload_id uuid references public.scan_uploads (id) on delete set null,

  confidence numeric default 1,
  reuse_count integer not null default 0,
  last_reused_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint global_object_baselines_image_sha256_key unique (image_sha256)
);

create index if not exists idx_global_object_baselines_image_phash
  on public.global_object_baselines (image_phash);

create index if not exists idx_global_object_baselines_lane_family
  on public.global_object_baselines (lane, object_family);

create index if not exists idx_global_object_baselines_stable_seed
  on public.global_object_baselines (stable_feature_seed);

comment on table public.global_object_baselines is
  'Object-only scan baseline for reuse across LINE accounts (allowlist JSON). No owner overlay / tokens.';

drop trigger if exists trg_global_object_baselines_set_updated_at on public.global_object_baselines;
create trigger trg_global_object_baselines_set_updated_at
  before update on public.global_object_baselines
  for each row execute function public.set_updated_at();
