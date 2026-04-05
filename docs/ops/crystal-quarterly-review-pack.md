# Crystal quarterly quality review pack

## Purpose

Offline **quarterly** artifact that rolls up **monthly scorecards / rollups** (Phase 10) and optional **structured anomaly events** from monthly digests. It is for:

- Quarterly ops review  
- Quarterly product / quality sync  
- Before large routing or wording refactors  
- Leadership updates (with the executive summary layer)

This layer **summarizes recurring patterns**; it does **not** replace monthly anomaly digests for incident narrative.

## Review aid — not production SLO

- Quarterly **template score** and **ops status** (`healthy` / `watch` / `investigate` / `escalate`) are **heuristics** for discussion — not paging policies or canonical SLOs.  
- Do **not** change routing, wording priority, or mismatch taxonomy — this pack only consumes existing metrics.  
- For semantics of monthly KPIs, see `docs/ops/crystal-monthly-scorecard.md` and `docs/ops/crystal-kpi-pack-definitions.md`.  
- Optional KPI-only detail: `docs/ops/crystal-quarterly-kpi-definitions.md`.

## Expected inputs

Single JSON object (or one-element array), e.g.:

| Field | Required | Description |
|--------|----------|-------------|
| `quarterWindowStart`, `quarterWindowEnd` | Yes | Quarter boundary (ISO strings) |
| `months` | Yes | Array of month slices (see below) |
| `generatedAt` | No | Defaults to “now” if omitted |

Each **month** entry may be:

1. A **monthly rollup** object (same shape as Phase 9/10 monthly rollup), or  
2. `{ "rollup": { ... }, "anomalyEvents": [ ... ] }`, or  
3. `{ "scorecard": { ... } }` — pre-built monthly scorecard (skips rebuilding from rollup).

### Structured anomaly events (optional)

`anomalyEvents` is an array of:

- `anomalyCode` (string, required)  
- `severity`: `low` | `medium` | `high` (optional)  
- `routingRuleId`, `decisionSource` (optional)  
- `likelyCause`, `suggestedNextAction` (optional, for digest tables)

Recurrence is computed by **same `anomalyCode` appearing in multiple months**.

## Generator script

```bash
node scripts/ops/generateCrystalQuarterlyReviewPack.mjs --input ./tmp/crystal-quarter.json --format markdown
node scripts/ops/generateCrystalQuarterlyReviewPack.mjs --input ./tmp/crystal-quarter.json --format json
```

## Output fields (summary)

| Field | Meaning |
|--------|---------|
| `reviewPackVersion` | Pack format version |
| `monthsIncluded` | Month window starts from each month |
| `quarterlyStatus` | `healthy` / `watch` / `investigate` / `escalate` (template heuristic) |
| `quarterScoreBand` | `excellent` / `good` / `watch` / `risk` from blended template score |
| `overallQuarterQualityScore` | Weighted average of monthly template scores (by crystal case count) |
| `quarterlyKpis` | Weighted quarterly rates + sums/maxes of counts |
| `monthlyStatusDistribution` / `monthlyScoreDistribution` | Counts across months |
| `topRecurringAnomalies` | Grouped digest rows with months affected |
| `topRecurringMismatchTypes` | Metric-based recurrence (e.g. elevated hard mismatch in multiple months) |
| `topRecurringRoutingRuleIds` / `topRecurringDecisionSources` | From anomaly events |
| `recurringRiskAreas`, `usageDropMonths` | Short codes for review |
| `executiveSummary` | Headline, body, top 3 wins/risks/actions + method note |
| `focusAreasNextQuarter` | Suggested focus list |
| `quarterlyKpiPack` | Headline/supporting/risk/trend/recurring/recommended |

## How to read quarterly ops status

Priority order in the heuristic (highest first):

1. **escalate** — Multiple risk months, repeated hard-mismatch cluster months, recurring critical anomaly codes, or repeated category / object-family cluster pressure.  
2. **investigate** — Repeated fallback-heavy / weak-protect pressure, repeated generic-fallback cluster months, or crystal-specific usage drop in multiple months.  
3. **watch** — Multiple watch months, generic fallback elevation across months, or soft drift across months.  
4. **healthy** — Default when escalation signals are absent.

Exact rules live in `src/utils/crystalQuarterlyReviewPack.util.js` and may be tuned to your baseline.

## How to read the executive summary

- **Headline** and **body** summarize blended KPIs and the ops status — generated only from inputs (no external facts).  
- **Top 3 wins / risks / next actions** are template bullets tied to distributions and thresholds — not automated root-cause analysis.  
- If the quarter is **escalate** or **investigate**, attach **monthly digests** and deploy history before acting.

## KPI definitions

- **Quarterly rates** are **weighted by `totalCrystalCases`** per month when available; otherwise unweighted averages.  
- Cluster **max** fields are the **maximum** of monthly cluster counts.  
- Recurring anomaly **counts** sum monthly `recurringAnomalyCount` fields (rollup semantics unchanged).

## Caveats / limitations

- No direct production DB/API — JSON in, JSON/Markdown out.  
- **Thai / non-crystal volume** (`notApplicableRowCount`) may trigger a recommendation when it dominates the export; crystal rates remain slice-specific.  
- Executive summary stays **conservative** — it does not invent incidents not evidenced by inputs.

## Suggested cadence

| When | Use |
|------|-----|
| Quarterly ops review | Full Markdown pack + digests |
| Product / quality sync | Executive summary + headline KPI pack |
| Before routing/wording refactor | Full pack + weekly trend exports |
| Leadership update | Executive summary section B + headline KPI table |
