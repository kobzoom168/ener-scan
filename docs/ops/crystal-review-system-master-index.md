# Crystal review system — master index (Phase 18)

## Purpose

**Entry point** for the in-repo crystal quality review operating system: what exists, when to use it, how governance artifacts connect, and how to onboard. Descriptive only — no runtime behavior change.

## Builder

- `src/utils/crystalReviewSystemMasterIndex.util.js` — `buildCrystalReviewSystemMasterIndex(inputs?, options?)`
- `buildCrystalReviewSystemMasterIndexTable()` — slim JSON
- CLI: `scripts/ops/generateCrystalReviewSystemMasterIndex.mjs` (optional `--write-closeout` regenerates closeout doc)

## Key outputs

| Field | Role |
|-------|------|
| `masterIndexVersion` / `reviewPackVersion` | Index pack ids |
| `artifactIndex` | From manifest — categories, optional/external flags |
| `reviewLayerIndex` | Telemetry → rolling → annual/capability/OS → automation |
| `governanceIndex` | Phase 17.1–17.8 docs + table paths |
| `automationIndex` | Key `scripts/ops/generateCrystal*.mjs` |
| `ownershipIndex` | Pointers to ownership + handoff + runbook docs |
| `usageGuide` | Cadences, debug path, **onboarding read order** |
| `currentSystemStatus` / strengths / gaps | Honest readiness |
| `optionalArtifacts` | Weekly branches etc. |
| `nextNonCrystalWorkRecommendation` | Suggested focus after this arc |
| `closeoutSummary` | Arc summary string |

## Closeout document

- `docs/ops/crystal-review-system-closeout.md`

## Machine-readable table

- `docs/ops/tables/crystal-review-system-master-index.json`

```bash
node scripts/ops/generateCrystalReviewSystemMasterIndex.mjs --format json --write-table
node scripts/ops/generateCrystalReviewSystemMasterIndex.mjs --format json --write-table --write-closeout
```
