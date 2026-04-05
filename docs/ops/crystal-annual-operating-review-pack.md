# Crystal annual quality operating review pack

## Purpose

Offline **annual (12-month)** artifact for **operating review, product planning, and leadership**. It composes:

- **Two half-year inputs** (each with two quarters, same shape as Phase 12), processed with `buildCrystalHalfYearBusinessReviewPack`, and  
- **Four quarterly** aggregates via `buildCrystalQuarterlyReviewPack`,

then blends **12 monthly** scorecards for weighted annual KPIs.

Does **not** change routing, wording priority, or mismatch taxonomy.

## Review aid — not production SLO

Template **annual score** and **annualStatus** (`healthy` / `watch` / `investigate` / `escalate`) are for planning and narrative only. Semantics align with monthly, quarterly, and half-year docs.

## Expected inputs

Single JSON object (or one-element array):

| Field | Required | Description |
|--------|----------|-------------|
| `yearWindowStart`, `yearWindowEnd` | Yes | Annual window (ISO) |
| `halfYears` | One of | **Two** objects: each has `halfYearWindowStart`, `halfYearWindowEnd`, `quarters[]` (each quarter: `quarterWindowStart`, `quarterWindowEnd`, `months[]`) |
| `months` | One of | **12** monthly slices; split into four quarters of three months and two half-years automatically |
| `generatedAt` | No | Defaults to now |
| `releaseSignals` | No | Optional metadata; operating summary does not infer release impact without it |

## Generator script

```bash
node scripts/ops/generateCrystalAnnualOperatingReviewPack.mjs --input ./tmp/crystal-annual.json --format markdown
node scripts/ops/generateCrystalAnnualOperatingReviewPack.mjs --input ./tmp/crystal-annual.json --format json
```

## Output fields (summary)

Includes: `reviewPackVersion`, `monthsIncluded`, `quartersIncluded`, `halfYearsIncluded`, `annualStatus`, `overallAnnualQualityScore`, `annualScoreBand`, `annualKpis`, monthly/quarterly/**half-year** status and score distributions, recurring tables, `topOperatingRiskAreas`, `usageDropMonths`, `multiPeriodFallbackHeavy`, `watchEscalateHalfYearPattern`, recaps, `executiveSummary`, **`operatingSummary`**, `focusAreasNextYear`, `recommendations`, **`annualKpiPack`** (includes **`operatingImpactSignals`**).

## How to read annual status

Combines half-year statuses, quarter statuses, and 12-month counts (e.g. risk months, clusters, anomaly recurrence across ≥6 months). Priority: **escalate → investigate → watch → healthy**. Exact logic: `src/utils/crystalAnnualOperatingReviewPack.util.js`.

## Executive vs operating summary

- **Executive** — short ops/leadership headline and top 3s from aggregates only.  
- **Operating** — capacity/investment framing; includes `topRecurringOperationalPatterns`, `topOperatingConcerns`, `topOperatingNextActions`. No revenue claims.

## KPI definitions

Annual rates are **weighted by crystal case volume** across 12 months. Distributions use the four quarterly packs and two half-year packs already built from the same inputs.

## Caveats

- No production DB/API.  
- **Release-to-drift** requires optional `releaseSignals` or external docs.  
- Thai/non-crystal volume may trigger recommendations; KPIs remain crystal-slice.

## Suggested cadence

| When | Use |
|------|-----|
| Annual ops review | Full Markdown + digests |
| Product/quality planning | Executive + operating sections |
| Pre–major routing/wording roadmap | Full pack + quarterly archive |
| Leadership review | Headline KPIs + operating summary |

See also: `docs/ops/crystal-operating-impact-signals.md`.
