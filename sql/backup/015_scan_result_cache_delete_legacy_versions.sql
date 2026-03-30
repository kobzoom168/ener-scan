-- Optional: remove cached scan rows from older prompt/format versions so they are never served again.
-- Safe to run anytime; only affects `scan_result_cache`, not user-facing `scan_results`.
--
-- Current app version uses keys like `v6-fmt1` (see `getScanCacheVersion()` in scanResultCache.db.js).
-- Adjust the WHERE clause if you only want to drop specific legacy strings.

-- Example: delete all rows not matching the current composite key (edit version string, then run):
-- delete from public.scan_result_cache
--   where prompt_version is distinct from 'v6-fmt1';

-- Example: delete only the previous single-token version (uncomment after deploy):
-- delete from public.scan_result_cache
--   where prompt_version = 'v5';
