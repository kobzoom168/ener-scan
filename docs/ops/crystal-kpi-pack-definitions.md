# Crystal monthly KPI pack — definitions

This document describes the **`buildCrystalMonthlyKpiPack(scorecard)`** structure produced alongside the monthly scorecard. The KPI pack is a **review aid** for quick snapshots in notes, slides, or chat — **not** a canonical production SLO set.

When scores fall or risk indicators fire, **always** read the **monthly anomaly digest** and weekly quality artifacts for narrative detail.

## Sections

### `headlineKpis`

Short list for dashboards and meeting headers. Typically includes:

- Overall quality score (template, 0–100)
- Aligned rate
- Hard mismatch rate
- Crystal-specific surface rate
- Generic fallback rate

Values are formatted for humans (percent strings where applicable).

### `supportingKpis`

Secondary metrics for drill-down:

- Soft mismatch rate
- Fallback-heavy rate
- Weak-protect-default rate
- Total crystal cases
- Recurring anomaly count
- Top routing rule share (when rollup provides `topRoutingRuleShare`)
- Top wording source share (when rollup provides `topWordingSourceShare`)

Missing optional shares render as `—`.

### `riskIndicators`

Flags aligned with digest-style signals. Each row has `label`, `value`, and optional `triggered` (boolean) for quick scanning. Examples:

- Recurring anomalies (threshold in implementation)
- Hard mismatch / generic fallback / object-family / category cluster counts
- Crystal-specific usage drop (from rollup flag)

**Triggered** does not page anyone — it only highlights rows for the review.

### `trendIndicators`

Optional counts from weekly trend rollups embedded in the monthly rollup:

- Stable / watch / investigate / escalate week counts

If absent, values are `0`.

### `recommendedFocusAreas`

Four strings aligned to monthly review prompts:

1. What to **monitor**
2. What to **investigate**
3. What to **escalate**
4. What can **wait**

They are **templates**; replace with team-specific actions when needed.

## Relationship to scorecard

The scorecard’s `kpiPack` field is built from the same `kpis` object as the rest of the scorecard. Re-running `buildCrystalMonthlyKpiPack` on a completed scorecard should yield the same pack (deterministic).
