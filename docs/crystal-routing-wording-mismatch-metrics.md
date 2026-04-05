# Crystal routing vs visible wording — mismatch metrics (Phase 4)

**Purpose:** Dashboard-ready, **pure observability** — compares **routing truth** (crystal category routing + inference trace) with **visible wording truth** (what `resolveCrystalVisibleWordingPriority` recorded for the surface). Does **not** change routing or wording selection.

**Implementation:** `src/utils/crystalRoutingWordingMetrics.util.js` — `buildCrystalRoutingWordingMetrics()`.

**Wiring:** `reportPayload.builder.js` adds **`routingWordingMetrics`** to:

- `ReportPayload.diagnostics`
- `REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY`
- `REPORT_PAYLOAD_BUILT`

(`REPORT_PAYLOAD_VERSION` ≥ **1.2.9**.)

---

## Field definitions (stable for dashboards)

| Field | Type | Meaning |
|-------|------|---------|
| `routingWordingAlignmentStatus` | string | `aligned` \| `soft_mismatch` \| `hard_mismatch` \| `not_applicable` |
| `routingWordingMismatchType` | string | Taxonomy below; `none` when aligned; `not_applicable` when N/A |
| `routingWordingMismatchSeverity` | string | `none` \| `low` \| `medium` \| `high` |
| `routingWordingDashboardGroup` | string | Bucket for charts: `non_crystal`, `crystal_aligned`, `crystal_soft_mismatch`, `crystal_hard_mismatch`, `crystal_meta_gap`, `crystal_unclassified` (should be rare) |
| `routingCategoryCode` | string | Same as input `energyCategoryCode` (routing side) |
| `wordingCategoryCode` | string | Visible wording category used |
| `energyCategoryCode` | string | Alias of `routingCategoryCode` (log-friendly) |
| `visibleWordingCategoryUsed` | string | Alias of `wordingCategoryCode` |
| `routingObjectFamily` | string | Normalized `objectFamily` |
| `wordingObjectFamily` | string \| null | From visible wording diagnostics |
| `isCrystalRoutingCase` | boolean | Normalized family is `crystal` |
| `isCrystalWordingCase` | boolean | Wording family is `crystal` |
| `isCrystalSpecificSurface` | boolean | `visibleWordingCrystalSpecific` |
| `isGenericSurfaceFallback` | boolean | Code-bank generic pools (`code_bank_crystal_first` / `code_bank_family`) |
| `isCategoryMismatch` | boolean | Routing vs wording category differ when both present |
| `isObjectFamilyMismatch` | boolean | Routing crystal but wording family ≠ `crystal` |
| `isFallbackHeavy` | boolean | `visibleWordingFallbackLevel >= 2` when set |
| `crystalRoutingRuleId` | string \| null | Present when id looks like `crystal_rg_*` |
| `crystalRoutingStrategy` | string \| null | From inference trace |
| `crystalRoutingReason` | string \| null | From inference trace |
| `protectSignalStrength` | string | Resolver / routing guardrail signal |
| `visibleWordingDecisionSource` | string \| null | `db_crystal`, `code_bank_crystal_first`, etc. |
| `visibleWordingCrystalSpecific` | boolean | |
| `visibleWordingFallbackLevel` | number \| null | |
| `dashboardMetricVersion` | string | Schema version for dashboards (currently `1`) |

---

## Taxonomy

### Alignment status

| Value | When |
|-------|------|
| `aligned` | Crystal routing case; categories consistent; wording path is plausibly crystal-specific (e.g. `db_crystal`, or `code_bank_crystal_first` with crystal-specific flag). |
| `soft_mismatch` | Drift that is worth watching but not a blatant cross-family error (e.g. generic code path early, DB fallback depth, mild specificity gap). |
| `hard_mismatch` | Clear conflict: wrong object family vs routing, category clash, or missing wording metadata when routing expects it. |
| `not_applicable` | Non-crystal / Thai paths — **no forced mismatch noise** (routing vs this crystal wording lens does not apply). |

### Mismatch types

| Value | Meaning |
|-------|---------|
| `none` | Aligned (no mismatch). |
| `category_mismatch` | `energyCategoryCode` vs `visibleWordingCategoryUsed` disagree. |
| `object_family_mismatch` | Routing is crystal but wording family is not `crystal`. |
| `crystal_specificity_mismatch` | Categories align but crystal-specificity / source pairing is off. |
| `unexpected_generic_fallback` | Code crystal-first path without crystal-specific surface flag (simulated drift / future-proofing). |
| `routing_missing_wording_meta` | Crystal rule present but wording category or object-family metadata missing where expected. |
| `wording_missing_routing_meta` | Category present but no `crystal_rg_*` rule id (soft gap). |
| `fallback_overuse` | Heavy DB fallback level on DB wording path. |
| `not_applicable` | Non-crystal path. |

### Severity

| Value | Typical use |
|-------|-------------|
| `none` | Aligned or N/A. |
| `low` | Minor specificity / trace gaps. |
| `medium` | Meta gaps, generic fallback, fallback depth. |
| `high` | Wrong family or category. |

---

## Example rows

| Scenario | `routingWordingAlignmentStatus` | `routingWordingMismatchType` | `routingWordingDashboardGroup` |
|----------|----------------------------------|------------------------------|--------------------------------|
| Thai amulet scan | `not_applicable` | `not_applicable` | `non_crystal` |
| Crystal + `crystal_rg_*` + `db_crystal` + same category | `aligned` | `none` | `crystal_aligned` |
| Crystal + rule + `code_bank_crystal_first` + `crystalSpecific` true | `aligned` | `none` | `crystal_aligned` |
| Crystal + rule + `code_bank_crystal_first` + `crystalSpecific` false | `soft_mismatch` | `unexpected_generic_fallback` | `crystal_soft_mismatch` |
| Crystal + rule + wording family `thai_amulet` | `hard_mismatch` | `object_family_mismatch` | `crystal_hard_mismatch` |
| Crystal + rule + category `protection` vs wording `money_work` | `hard_mismatch` | `category_mismatch` | `crystal_hard_mismatch` |
| Crystal + rule + no `visibleWordingCategoryUsed` | `hard_mismatch` | `routing_missing_wording_meta` | `crystal_meta_gap` |

---

## Dashboard grouping suggestions

- **Primary slice:** `routingWordingDashboardGroup` or `routingWordingAlignmentStatus`.
- **Drill-down:** `crystalRoutingStrategy` × `routingWordingMismatchType`.
- **Ops lens:** `protectSignalStrength` × `routingWordingMismatchSeverity` (weak protect / generic boost vs what surfaced).

## Alert ideas

- Rate of `hard_mismatch` > baseline (especially `object_family_mismatch` / `category_mismatch`).
- Spike in `soft_mismatch` + `unexpected_generic_fallback` (code path without crystal-specific flag).
- `crystal_meta_gap` volume (missing category or family in wording diagnostics while `crystal_rg_*` present).
- `not_applicable` should dominate **non-crystal** traffic; sudden drop may indicate normalization bugs.

---

## Maintenance

- **Change classification rules** only in `crystalRoutingWordingMetrics.util.js` (single place).
- Bump `dashboardMetricVersion` when output shape or semantics change for downstream dashboards.
