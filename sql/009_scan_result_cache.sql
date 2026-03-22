-- Persistent scan result cache: same image hash + birthdate → reuse result_text (skip OpenAI deep scan).

create table if not exists public.scan_result_cache (
  id uuid primary key default gen_random_uuid(),
  image_hash text not null,
  birthdate text not null,
  result_text text not null,
  object_type text,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz,
  hit_count integer not null default 0
);

create unique index if not exists idx_scan_result_cache_hash_birthdate
  on public.scan_result_cache (image_hash, birthdate);

-- Optional: mark billing rows that reused cache (no OpenAI call for deep scan).
alter table public.scan_results
  add column if not exists from_cache boolean not null default false;
