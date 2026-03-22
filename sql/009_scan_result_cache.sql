-- Persistent scan result cache: image hash + normalized birthdate + prompt_version → result_text.

create table if not exists public.scan_result_cache (
  id uuid primary key default gen_random_uuid(),
  image_hash text not null,
  birthdate text not null,
  prompt_version text not null default 'v1',
  result_text text not null,
  object_type text,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz,
  hit_count integer not null default 0
);

create unique index if not exists idx_scan_result_cache_lookup
  on public.scan_result_cache (image_hash, birthdate, prompt_version);

-- Optional: mark billing rows that reused cache (no OpenAI call for deep scan).
alter table public.scan_results
  add column if not exists from_cache boolean not null default false;
