-- Compare quality metrics: style-reference used vs not (requires quality_analytics JSON).
-- style_reference_used = pack applied; rewrite_with_style = augmentation on rewrite API call.

with q as (
  select
    quality_analytics,
    coalesce((quality_analytics->>'rewrite_with_style')::boolean, false) as rewrite_with_style,
    coalesce((quality_analytics->>'style_reference_used')::boolean, false) as style_reference_used,
    nullif(quality_analytics->>'score_after', '')::double precision as score_after,
    nullif(quality_analytics->>'delta', '')::double precision as delta,
    coalesce((quality_analytics->>'improve_applied')::boolean, false) as improve_applied,
    nullif(quality_analytics->>'quality_tier', '') as quality_tier
  from public.scan_results
  where quality_analytics is not null
)
select
  case
    when style_reference_used then 'style_used'
    else 'style_not_used'
  end as cohort,
  count(*) as n,
  avg(score_after) as avg_score_after,
  avg(delta) as avg_delta,
  avg(case when improve_applied then 1.0 else 0.0 end) as improve_applied_rate
from q
group by 1
order by 1;

-- quality_tier distribution by cohort
with q as (
  select
    coalesce((quality_analytics->>'style_reference_used')::boolean, false) as style_reference_used,
    coalesce(quality_analytics->>'quality_tier', '(null)') as quality_tier
  from public.scan_results
  where quality_analytics is not null
)
select
  case when style_reference_used then 'style_used' else 'style_not_used' end as cohort,
  quality_tier,
  count(*) as n
from q
group by 1, 2
order by 1, 3 desc;
