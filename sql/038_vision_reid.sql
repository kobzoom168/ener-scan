-- Phase 2G: TRUE image-embedding re-identification (DINOv2 ViT-S/14, 384-d)
-- alongside the legacy text-descriptor embedding (1536-d, kept for 2D fallback).
-- Retrieval = visual_embedding NN (loose recall) → LightGlue geometric verify.

create extension if not exists vector;

alter table public.global_object_baselines
  add column if not exists visual_embedding vector(384),
  add column if not exists visual_embedding_model text;

create index if not exists idx_global_object_baselines_visual_embedding
  on public.global_object_baselines
  using ivfflat (visual_embedding vector_cosine_ops)
  with (lists = 20);

comment on column public.global_object_baselines.visual_embedding is
  'DINOv2 ViT-S/14 image embedding of the rembg-cropped object (L2-normalized). Recall filter for LightGlue re-id.';

create or replace function public.match_global_object_baselines_visual(
  query_embedding vector(384),
  match_lane text default null,
  match_family text default null,
  min_similarity double precision default 0.60,
  match_count integer default 6
)
returns table (
  id uuid,
  image_sha256 text,
  image_phash text,
  stable_feature_seed text,
  lane text,
  object_family text,
  baseline_schema_version integer,
  prompt_version text,
  scoring_version text,
  object_baseline_json jsonb,
  axis_scores_json jsonb,
  peak_power_key text,
  thumbnail_path text,
  source_scan_result_v2_id uuid,
  source_upload_id uuid,
  confidence numeric,
  reuse_count integer,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    b.id,
    b.image_sha256,
    b.image_phash,
    b.stable_feature_seed,
    b.lane,
    b.object_family,
    b.baseline_schema_version,
    b.prompt_version,
    b.scoring_version,
    b.object_baseline_json,
    b.axis_scores_json,
    b.peak_power_key,
    b.thumbnail_path,
    b.source_scan_result_v2_id,
    b.source_upload_id,
    b.confidence,
    b.reuse_count,
    b.created_at,
    1 - (b.visual_embedding <=> query_embedding) as similarity
  from public.global_object_baselines b
  where b.visual_embedding is not null
    and (match_lane is null or b.lane = match_lane)
    and (match_family is null or b.object_family = match_family)
    and (1 - (b.visual_embedding <=> query_embedding)) >= min_similarity
  order by b.visual_embedding <=> query_embedding asc
  limit greatest(1, least(50, match_count));
$$;

grant execute on function public.match_global_object_baselines_visual(vector, text, text, double precision, integer) to service_role;
grant execute on function public.match_global_object_baselines_visual(vector, text, text, double precision, integer) to web_anon;
