-- Closed-loop quality metrics for learning / dashboards (optional column; safe if missing).
alter table public.scan_results
  add column if not exists quality_analytics jsonb;

comment on column public.scan_results.quality_analytics is
  'Ener deep-scan quality snapshot: score_before/after, delta, improve flags, skip reason, latency_ms (see deepScanQualityAnalytics.service.js)';

create index if not exists idx_scan_results_quality_analytics_gin
  on public.scan_results using gin (quality_analytics jsonb_path_ops);
