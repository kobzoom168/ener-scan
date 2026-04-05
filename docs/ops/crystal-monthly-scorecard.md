# Crystal monthly quality scorecard

## Purpose

Provide a **lightweight, offline** monthly snapshot of crystal routing + visible wording health using the **monthly rollup JSON** as the primary input. The scorecard and KPI pack are meant for:

- Monthly ops review
- Monthly product / quality sync
- Release follow-up
- Routing and wording tuning discussions

They **summarize and package** rollup fields; the **monthly anomaly digest** remains the authoritative narrative for incident-level detail.

## Review aid — not production SLO

- The **overall quality score** is a **template heuristic** (0–100), calibrated for review conversations — **not** a canonical production SLO or error budget.
- Always read the **anomaly digest** when the score drops or the band is `watch` / `risk`.
- KPI definitions here align with rollup semantics; they do **not** change routing, wording priority, or mismatch taxonomy.

## Expected inputs

Primary input: one **monthly rollup** object (JSON). Minimum fields used by the scorecard:

| Field | Role |
|--------|------|
| `monthWindowStart`, `monthWindowEnd` | Month window (ISO strings) |
| `totalCrystalCases` | Denominator for crystal-slice rates |
| `alignedRate`, `softMismatchRate`, `hardMismatchRate` | Mismatch mix |
| `crystalSpecificSurfaceRate` | Crystal-specific surface share |
| `genericFallbackRate`, `fallbackHeavyRate`, `weakProtectDefaultRate` | Fallback / protect signals |
| `recurringAnomalyCount` | Digest-linked recurrence |
| `hardMismatchClusterCount`, `genericFallbackClusterCount`, `objectFamilyMismatchClusterCount`, `categoryMismatchClusterCount` | Cluster counts |
| `crystalSpecificUsageDropFlag` | Optional rollup/digest flag |
| `trendStableWeeks`, `trendWatchWeeks`, `trendInvestigateWeeks`, `trendEscalateWeeks` | Optional weekly trend mix |
| `notApplicableRowCount` | Optional; Thai / non-crystal row count for export context |
| `topRoutingRuleShare`, `topWordingSourceShare` | Optional 0..1 shares for KPI pack |

See `docs/ops/crystal-kpi-pack-definitions.md` for KPI pack section semantics.

## Outputs

### Generator script

```bash
node scripts/ops/generateCrystalMonthlyScorecard.mjs --input ./tmp/crystal-month-rollup.json --format markdown
node scripts/ops/generateCrystalMonthlyScorecard.mjs --input ./tmp/crystal-month-rollup.json --format json
```

### Scorecard object (JSON)

At minimum:

- `scorecardVersion` — format version string
- `monthWindowStart`, `monthWindowEnd`, `generatedAt`
- `monthlyStatus` — e.g. `excellent_month`, `good_month`, `watch_month`, `risk_month`
- `overallQualityScore` — template 0–100
- `scoreBand` — `excellent` \| `good` \| `watch` \| `risk`
- `kpis` — rates, counts, flags (mirror rollup)
- `strengths`, `risks`, `topSignals`, `topAnomalies`, `recommendations`
- `scoreDriversPositive`, `scoreDriversNegative`, `scoreMethodNote`
- `rollupSnapshot` — copy of input rollup
- `kpiPack` — from `buildCrystalMonthlyKpiPack` (headline / supporting / risk / trend / recommended focus)

### Markdown

Sections **A–F**: header, executive KPIs, strengths, risks, recommended focus areas (monitor / investigate / escalate / wait), KPI pack appendix with tables and template score driver breakdown.

## Score heuristic overview

- Starts at **100**.
- **Subtracts** weighted penalties for: hard/soft mismatch rates, generic fallback, fallback-heavy, weak-protect-default, crystal-specific surface gap, recurring anomalies, cluster counts (hard mismatch, generic fallback, object-family, category), crystal-specific usage drop flag, and adverse weekly trend mix.
- **Adds** small bonuses for high aligned rate and stable trend weeks.
- Result is **rounded** and **clamped** to 0–100.

Exact weights are implementation details in `src/utils/crystalMonthlyScorecard.util.js`; treat them as a **starting template** and recalibrate against your baseline if needed.

## Score bands

| Band | Approx. score | Meaning in review |
|------|----------------|-------------------|
| `excellent` | ≥ 82 | Crystal slice looks healthy; routine monthly review. |
| `good` | 68–81 | Acceptable; watch soft drift and fallback trends. |
| `watch` | 52–67 | Pair with digest + weekly trends; plan targeted triage. |
| `risk` | &lt; 52 | Strong signal to investigate routing, wording, DB coverage, telemetry. |

Bands are **review labels**, not alerts wired to paging.

## KPI definitions

KPIs mirror the rollup: **aligned** / **soft-hard mismatch** / **crystal-specific surface** / **generic fallback** / **fallback-heavy** / **weak-protect-default**, plus anomaly and cluster counts. Optional shares (`topRoutingRuleShare`, `topWordingSourceShare`) surface in the **supporting** KPI table when present.

Full KPI pack layout: `docs/ops/crystal-kpi-pack-definitions.md`.

## How to use in monthly review

1. Paste **headline KPIs** (or the markdown header block) into the review doc.
2. Scan **score band** and **recommended focus areas** (section E).
3. Open **anomaly digest** for any `watch`/`risk` month or triggered risk indicators.
4. Use **supporting KPIs** and **trend indicators** for week-over-week context when weekly rollups exist.

## Caveats / limitations

- **No live data source** in this layer: input is static JSON from your pipeline.
- **Non-crystal / Thai-heavy** exports may set `notApplicableRowCount` high; crystal rates apply only to the crystal slice — the scorecard may add a recommendation when non-crystal volume dominates.
- **Do not** interpret the template score as precision; it is intentionally conservative and explainable.

## Suggested cadence

| Cadence | Use |
|---------|-----|
| Monthly ops review | Full markdown or JSON scorecard + digest |
| Monthly product sync | KPI pack headline + risk indicators |
| Before major routing/wording tuning | Scorecard + weekly trend comparison + digest |
