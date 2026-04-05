# Crystal half-year quality business review pack

## Purpose

Offline **half-year (6-month)** artifact for **ops, product, and business / leadership** reviews. It aggregates:

- **Two quarterly review inputs** (each built like Phase 11 — monthly rollups + optional anomaly events), via `buildCrystalQuarterlyReviewPack`, or  
- A flat **`months`** array (e.g. six months), split automatically into two synthetic quarters for quarterly sub-aggregation.

This layer **does not** change routing, wording priority, or mismatch taxonomy; it only consumes existing rollup and pack semantics.

## Review aid — not production SLO

- Template **half-year score** and **ops status** are heuristics for planning and narrative — **not** paging or canonical SLOs.  
- KPI semantics match **monthly** and **quarterly** docs:  
  - `docs/ops/crystal-monthly-scorecard.md`  
  - `docs/ops/crystal-quarterly-review-pack.md`  
- Optional: `docs/ops/crystal-business-impact-signals.md` for `businessImpactSignals` rows.

## Expected inputs

Single JSON object (or one-element array):

| Field | Required | Description |
|--------|----------|-------------|
| `halfYearWindowStart`, `halfYearWindowEnd` | Yes | Half-year window (ISO) |
| `quarters` | One of | **Two** objects: `quarterWindowStart`, `quarterWindowEnd`, `months[]` (same month shapes as quarterly pack) |
| `months` | One of | **Six** monthly slices (rollup / `{rollup, anomalyEvents}` / `{scorecard}`); split 50/50 into two synthetic quarters |
| `generatedAt` | No | Default now |
| `releaseSignals` | No | Optional array of `{ windowLabel?, note? }` — if omitted, business layer states that release-to-drift is not inferred |

## Generator script

```bash
node scripts/ops/generateCrystalHalfYearBusinessReviewPack.mjs --input ./tmp/crystal-halfyear.json --format markdown
node scripts/ops/generateCrystalHalfYearBusinessReviewPack.mjs --input ./tmp/crystal-halfyear.json --format json
```

## Output fields (summary)

| Field | Meaning |
|--------|---------|
| `reviewPackVersion` | Pack format version |
| `monthsIncluded`, `quartersIncluded` | Period labels |
| `halfYearStatus` | `healthy` / `watch` / `investigate` / `escalate` (template) |
| `halfYearScoreBand` | `excellent` / `good` / `watch` / `risk` (from blended monthly template scores) |
| `overallHalfYearQualityScore` | Weighted average of monthly scores |
| `halfYearKpis` | Weighted rates + sums/maxes |
| `monthlyStatusDistribution`, `monthlyScoreDistribution` | Across all months |
| `quarterlyStatusDistribution`, `quarterlyScoreDistribution` | From the two quarterly packs |
| `topRecurringAnomalies`, `topRecurringMismatchTypes`, routing/source tables | Same semantics as quarterly, wider window |
| `topBusinessRiskAreas` | Short codes for stakeholder discussion |
| `executiveSummary` | Ops-style headline + top 3s |
| `businessSummary` | Product/business headline + top 3s |
| `focusAreasNextHalf` | Strategic bullets |
| `halfYearKpiPack` | Headline/supporting/risk/trend/recurring/**businessImpactSignals**/recommended |

## How to read half-year status

Heuristic combines **both quarterly** `quarterlyStatus` values and **six-month** counts (risk months, cluster months, anomaly recurrence across ≥3 months, etc.). Priority: **escalate** → **investigate** → **watch** → **healthy**. Exact rules: `src/utils/crystalHalfYearBusinessReviewPack.util.js`.

## How to read executive summary

Template text uses only **aggregated KPIs and statuses** from the JSON. Top-3 lists are padded with neutral lines when signals are thin.

## How to read business summary

Uses the same metrics with **business-facing phrasing**; explicitly **does not** infer revenue. Release impact is mentioned only if `releaseSignals` is present in input.

## KPI definitions

Half-year rates are **weighted by `totalCrystalCases`** across all months. Quarterly distributions come from **two** `buildCrystalQuarterlyReviewPack` outputs.

## Caveats / limitations

- No live DB/API.  
- **Release-to-drift** narrative requires optional `releaseSignals` (or external docs).  
- Thai / non-crystal volume may trigger recommendations; crystal KPIs remain slice-specific.

## Suggested cadence

| When | Use |
|------|-----|
| Half-year ops review | Full Markdown + digests |
| Product / quality sync | Executive + business summary blocks |
| Pre–major routing/wording roadmap | Full pack + quarterly archives |
| Leadership / business review | Headline KPIs + business summary |
