# Crystal weekly quality review — input row contract

**Purpose:** Define the **minimum** fields for offline weekly exports (JSON lines, NDJSON, or array JSON) consumed by `buildCrystalWeeklyQualityReview()` and `scripts/ops/generateCrystalWeeklyQualityReview.mjs`.

**Semantics:** Field meanings match existing telemetry — see `docs/crystal-routing-telemetry-mapping.md`, `docs/crystal-routing-wording-mismatch-metrics.md`, and `routingWordingMetrics` on `REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY` / `REPORT_PAYLOAD_BUILT`. **Do not invent new taxonomy values**; use the same strings as production metrics.

---

## Required / recommended columns

| Field | Required | Notes |
|-------|------------|------|
| `timestamp` | Recommended | ISO 8601; for windowing and audit; ignored by aggregation math today |
| `objectFamily` | Recommended | Raw or normalized; used if `isCrystalRoutingCase` omitted |
| `energyCategoryCode` | Optional | Routing category |
| `crystalRoutingRuleId` | Recommended | `crystal_rg_*` when present |
| `crystalRoutingStrategy` | Optional | e.g. `weak_protect`, `early_exit` |
| `protectSignalStrength` | Optional | `strong` \| `weak` \| `none` |
| `visibleWordingDecisionSource` | Recommended | `db_crystal`, `code_bank_crystal_first`, etc. |
| `visibleWordingCrystalSpecific` | Recommended | boolean |
| `visibleWordingCategoryUsed` | Optional | Wording category |
| `visibleWordingFallbackLevel` | Optional | number; `>=2` implies fallback-heavy in aggregators |
| `routingWordingAlignmentStatus` | **Required** for quality | `aligned` \| `soft_mismatch` \| `hard_mismatch` \| `not_applicable` |
| `routingWordingMismatchType` | **Required** for mismatch breakdown | Taxonomy from mismatch metrics helper |
| `routingWordingMismatchSeverity` | Optional | `none` \| `low` \| `medium` \| `high` |
| `routingWordingDashboardGroup` | Optional | e.g. `crystal_aligned` |
| `isCrystalRoutingCase` | Recommended | If omitted, inferred from `objectFamily` / `routingObjectFamily` via `normalizeObjectFamilyForEnergyCopy` |

**Aliases:** `routingObjectFamily` may be used instead of `objectFamily` (same as dashboard row helper).

---

## Non-crystal rows

Exports may include **Thai / non-crystal** rows (`isCrystalRoutingCase: false` or `routingWordingAlignmentStatus: not_applicable`). They are **excluded** from crystal denominators and rates; only `notApplicableRowCount` is surfaced in the report.

---

## Wrapper JSON (CLI)

The generator accepts either:

- A **JSON array** of rows, or  
- An **object** `{ "rows": [...], "windowStart": "...", "windowEnd": "...", "generatedAt": "...", "baselineAggregate": { ... } }`

`baselineAggregate` is optional; shape matches `aggregateCrystalRoutingDashboardSummary` output when comparing week-over-week.

---

## Related

- **`docs/ops/crystal-weekly-quality-review.md`** — how to run the report and read output  
- **`src/utils/crystalWeeklyQualityReview.util.js`**
