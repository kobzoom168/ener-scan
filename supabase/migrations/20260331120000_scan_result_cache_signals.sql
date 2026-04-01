-- Deterministic scan signals (not from LLM prose). Safe to run on existing DBs (nullable columns).
ALTER TABLE scan_result_cache
  ADD COLUMN IF NOT EXISTS object_category text,
  ADD COLUMN IF NOT EXISTS object_category_source text,
  ADD COLUMN IF NOT EXISTS dominant_color text,
  ADD COLUMN IF NOT EXISTS dominant_color_source text;

COMMENT ON COLUMN scan_result_cache.object_category IS 'Thai label from classifyObjectCategory (fresh or cache_classify heal)';
COMMENT ON COLUMN scan_result_cache.object_category_source IS 'deep_scan | cache_classify';
COMMENT ON COLUMN scan_result_cache.dominant_color IS 'Slug from reportPipelineDominantColor v1; omit unknown';
COMMENT ON COLUMN scan_result_cache.dominant_color_source IS 'vision_v1 when persisted from pixel pipeline';
