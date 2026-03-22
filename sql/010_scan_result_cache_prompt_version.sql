-- If 009 was applied before prompt_version existed: add column + replace unique index.

alter table public.scan_result_cache
  add column if not exists prompt_version text not null default 'v1';

drop index if exists public.idx_scan_result_cache_hash_birthdate;

create unique index if not exists idx_scan_result_cache_lookup
  on public.scan_result_cache (image_hash, birthdate, prompt_version);
