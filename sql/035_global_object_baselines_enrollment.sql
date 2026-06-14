-- Phase 2E: multi-angle enrollment for global_object_baselines.
-- An object group ties multiple angle views of the SAME physical piece together. Each accepted
-- recognition appends a view; once a group reaches the lock threshold, its six-axis scores are
-- consolidated (averaged) and locked so every angle returns the identical graph.

alter table public.global_object_baselines
  add column if not exists object_group_id uuid;

alter table public.global_object_baselines
  add column if not exists is_enrolled boolean not null default false;

alter table public.global_object_baselines
  add column if not exists view_count integer not null default 1;

-- Locked, consolidated scores for the group (only meaningful on the group's canonical row).
alter table public.global_object_baselines
  add column if not exists locked_axis_scores_json jsonb;

-- Backfill: each existing baseline is its own single-view group.
update public.global_object_baselines
  set object_group_id = id
  where object_group_id is null;

create index if not exists idx_global_object_baselines_object_group
  on public.global_object_baselines (object_group_id);

comment on column public.global_object_baselines.object_group_id is
  'Groups multiple angle views of the same physical object (multi-angle enrollment).';
comment on column public.global_object_baselines.locked_axis_scores_json is
  'Consolidated six-axis scores locked once the group is enrolled (>= lock threshold views).';
