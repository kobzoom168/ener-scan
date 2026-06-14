-- Phase 2D: semantic embedding nearest-neighbor reuse for global_object_baselines.
-- Adds an angle-robust image embedding so the same object photographed from different
-- angles can be recognized (cosine distance), beyond exact SHA / pHash matching.
--
-- Requires the pgvector extension. Embedding dim defaults to 1536 (text-embedding-3-small).
-- If you switch OBJECT_EMBEDDING_MODEL to a different dim, recreate the column to match.

create extension if not exists vector;

alter table public.global_object_baselines
  add column if not exists image_embedding vector(1536);

alter table public.global_object_baselines
  add column if not exists embedding_model text;

alter table public.global_object_baselines
  add column if not exists embedding_version text;

alter table public.global_object_baselines
  add column if not exists embedding_descriptor text;

-- Approximate NN index (cosine). ivfflat needs ANALYZE + data to be effective; lists tuned for
-- a small/medium table. For large tables prefer hnsw: using vector_cosine_ops.
create index if not exists idx_global_object_baselines_embedding
  on public.global_object_baselines
  using ivfflat (image_embedding vector_cosine_ops)
  with (lists = 100);

comment on column public.global_object_baselines.image_embedding is
  'Angle-robust semantic fingerprint (descriptor -> text embedding). Used for same-object NN reuse.';

-- Nearest-neighbor match RPC. Returns baselines within (1 - min_similarity) cosine distance,
-- filtered by lane/family, ordered by closest first. SECURITY: object-only allowlist row,
-- no owner data exposed (mirrors existing reuse columns).
create or replace function public.match_global_object_baselines(
  query_embedding vector(1536),
  match_lane text default null,
  match_family text default null,
  min_similarity double precision default 0.92,
  match_count integer default 5
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
    1 - (b.image_embedding <=> query_embedding) as similarity
  from public.global_object_baselines b
  where b.image_embedding is not null
    and (match_lane is null or b.lane = match_lane)
    and (match_family is null or b.object_family = match_family)
    and (1 - (b.image_embedding <=> query_embedding)) >= min_similarity
  order by b.image_embedding <=> query_embedding asc
  limit greatest(1, least(50, match_count));
$$;
