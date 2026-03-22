-- Sample aggregates for dashboards (run in Supabase SQL editor).
-- Requires quality_analytics JSON on scan_results (012 migration).

-- Overall quality / improve stats
select
  avg(nullif(quality_analytics->>'delta', '')::double precision) as avg_delta,
  avg(nullif(quality_analytics->>'score_after', '')::double precision) as avg_score_after,
  avg(nullif(quality_analytics->>'score_before', '')::double precision) as avg_score_before,
  avg(nullif(quality_analytics->>'improve_gain_ratio', '')::double precision) as avg_improve_gain_ratio,
  count(*) filter (
    where (quality_analytics->>'improve_applied')::boolean is true
  ) as improve_applied_count,
  count(*) filter (where quality_analytics is not null) as rows_with_quality
from public.scan_results;

-- By quality_tier (after enrich v2)
select
  coalesce(quality_analytics->>'quality_tier', '(null)') as quality_tier,
  count(*) as n
from public.scan_results
where quality_analytics is not null
group by 1
order by n desc;
