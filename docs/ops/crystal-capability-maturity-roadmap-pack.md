# Crystal capability maturity + operating roadmap pack

## Purpose

Offline **capability maturity assessment** and **operating roadmap** packaging for ops, product, and leadership. It **reuses** outputs from the annual operating review pack (`buildCrystalAnnualOperatingReviewPack`) and/or a minimal **`evidenceSnapshot`** — it does **not** query production data.

Does **not** change routing, wording priority, or mismatch taxonomy.

## Review aid — not certification

- Maturity **L1–L4** and bands (**fragile / emerging / stable / scalable**) are **template heuristics** for planning — not formal certification or SLOs.
- See `docs/ops/crystal-capability-maturity-definitions.md` for level semantics.

## Expected inputs

| Field | Role |
|--------|------|
| `assessmentWindowStart`, `assessmentWindowEnd` | Assessment window (often same as fiscal year) |
| `annualOperatingReviewPack` | **Preferred:** full JSON from `buildCrystalAnnualOperatingReviewPack` |
| `halfYears` / `months` / `yearWindowStart` / `yearWindowEnd` | If `annualOperatingReviewPack` is omitted, an annual pack is **built** the same way as Phase 13 |
| `evidenceSnapshot` | Optional minimal KPI/status fields if no annual JSON is available |
| `releaseSignals` | Passed through when building annual from raw periods |
| `multiYearHistoryPack` | Optional future hook — stored as `multiYearHistoryPackReference` only |

## Generator script

```bash
node scripts/ops/generateCrystalCapabilityMaturityRoadmapPack.mjs --input ./tmp/crystal-capability.json --format markdown
node scripts/ops/generateCrystalCapabilityMaturityRoadmapPack.mjs --input ./tmp/crystal-capability.json --format json
```

## Output fields (summary)

`reviewPackVersion`, `overallMaturityLevel`, `overallMaturityBand`, `domainAssessments` (six domains), `strengths`, `gaps`, `evidenceBackedRisks`, `operatingRoadmap` (four buckets), `roadmapPriorities`, `quickWins`, `foundationInvestments`, `scaleUpInvestments`, `executiveSummary`, `operatingSummary`, `roadmapSummary`, `recommendations`, `evidenceSourceNote`, `multiYearHistoryPackReference`, `methodNote`.

## How to read maturity

Each domain gets a level from **submitted metrics and status distributions** — not from live dashboards. Overall maturity is the **rounded average** of domain levels.

## How to read the roadmap

Items are **templated** from domain gaps and annual status: **maintain_now**, **stabilize_next**, **invest_next_quarter**, **defer_for_now**. Each item includes category, priority, horizon, evidence string, and confidence — all **bounded** by input JSON.

## Caveats

- Without `annualOperatingReviewPack`, telemetry domain may score lower (no `hasAnnualPack` evidence).
- Thai-heavy exports are called out when non-crystal row counts dominate — crystal KPI semantics unchanged.

## Suggested cadence

| When | Use |
|------|-----|
| Half-year roadmap review | Full Markdown + annual pack |
| Annual operating planning | Executive + roadmap summary blocks |
| Pre–major routing/wording reset | Domain table + invest_next_quarter bucket |
