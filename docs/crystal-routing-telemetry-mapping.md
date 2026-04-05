# Crystal routing — telemetry & dashboard mapping

Companion docs: [`crystal-routing-spec.md`](./crystal-routing-spec.md) (routing semantics), [`crystal-routing-rule-map.csv`](./tables/crystal-routing-rule-map.csv) (machine-readable rule ids). Ops: [`ops/crystal-routing-wording-playbook.md`](./ops/crystal-routing-wording-playbook.md), [`ops/crystal-dashboard-query-examples.md`](./ops/crystal-dashboard-query-examples.md).

## 1) Purpose

This document maps:

| Layer | Role |
|-------|------|
| **Rule table** | `crystalCategoryRouting.util.js` — `routingRuleId`, `routingStrategy`, cue order |
| **Inference trace** | `inferEnergyCategoryInferenceTrace()` — fields exposed to callers |
| **Report diagnostics** | `ReportPayload.diagnostics` — persisted / inspectable in QA |
| **Logs** | `REPORT_PAYLOAD_MAIN_ENERGY_INFERENCE`, `REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY`, `REPORT_PAYLOAD_BUILT`, `REPORT_PAYLOAD_DB_WORDING_HYDRATE`, … |

Use it when building dashboards, alerts, or log parsers so **`routingRuleId` is interpreted consistently** (telemetry contract, not an internal throwaway string).

## 2) Source-of-truth path

```
resolveEnergyTypeMetaForFamily(raw, objectFamily)   ← family-aware resolver (not duplicated here)
        ↓
buildCrystalRoutingInput(...) + flags (luck, money, spiritual)
        ↓
resolveCrystalCategoryRouting(input)   ← SSOT: categoryCode + routingRuleId + …
        ↓
inferEnergyCategoryFull()              ← crystal branch merges meta override (explicit luck word)
        ↓
inferEnergyCategoryInferenceTrace()    ← trace shape for builders
        ↓
buildReportPayloadFromScan()           ← copies trace → diagnostics + console JSON
```

**Thai / non-crystal** families do not call `resolveCrystalCategoryRouting`; they use the legacy switch in `energyCategoryResolve.util.js` (trace fields `crystal*` stay undefined).

## 3) Field mapping table

| field | source | meaning | example |
|-------|--------|---------|---------|
| `energyCategoryCode` | `inferEnergyCategoryFull().code` → summary / diagnostics | Final `energy_categories.code` for copy & UI | `confidence` |
| `energyCategoryInferenceBranch` | `inferEnergyCategoryInferenceTrace().inferenceBranch` | Label for which inference branch ran | `crystal_weak_protect_confidence` |
| `resolveEnergyTypeResult` | Resolver `meta.energyType` | Thai key from flex scan copy config after family-aware resolve | `เสริมพลัง` |
| `protectKeywordMatched` | Resolver | Keyword when `energyType === PROTECT` (strong) | `พลังปกป้อง` |
| `protectWeakKeywordMatched` | Resolver | Matched weak cue when crystal weak protect | `คุ้มครอง` |
| `protectSignalStrength` | Resolver | `strong` \| `weak` \| `none` | `weak` |
| `resolvedEnergyTypeBeforeCategoryMap` | Resolver | Same as resolver output used before category mapping | `เสริมพลัง` |
| `crystalWeakProtectOutcome` | Routing result | Category chosen on weak-protect BOOST path | `confidence` |
| `crystalNonProtectRoutingReason` | `crystalLegacyNonProtectRoutingReason()` | Compact legacy key (`weak_protect_*`, `generic_boost_*`, …) | `weak_protect_confidence` |
| `crystalPostResolverCategoryDecision` | Routing result `categoryCode` | Same as final category when crystal routing applied | mirrors `energyCategoryCode` for crystal |
| `crystalRoutingRuleId` | Routing result | **Stable telemetry id** — do not rename without migration | `crystal_rg_weak_protect_default` |
| `crystalRoutingReason` | Routing result | Rule-level reason string | `weak_protect_default_confidence` |
| `crystalRoutingStrategy` | Routing result | Coarse bucket | `weak_protect` |

### 3b) Visible wording decision (orthogonal to routing)

Populated by `resolveCrystalVisibleWordingPriority()` in `reportPayload.diagnostics` (`REPORT_PAYLOAD_VERSION` ≥ 1.2.8). See `src/utils/crystalVisibleWordingPriority.util.js`. Mismatch metrics (Phase 4) are in `routingWordingMetrics` (≥ 1.2.9).

| field | source | meaning | example |
|-------|--------|---------|---------|
| `visibleWordingDecisionSource` | Helper | `db_crystal` \| `db_family` \| `code_bank_crystal_first` \| `code_bank_family` | `code_bank_crystal_first` |
| `visibleWordingObjectFamilyUsed` | Helper | Normalized family driving template branch | `crystal` |
| `visibleWordingCrystalSpecific` | Helper | True if DB crystal rows or code crystal-first pools | `true` |
| `visibleWordingCategoryUsed` | Helper | Category used to pick templates for the visible surface | `protection` |
| `visibleWordingPresentationAngle` | DB headline slot or Flex meta | Angle id when known | `shield_stone` |
| `visibleWordingFallbackLevel` | DB diagnostics | Fallback level when DB path | `0` |
| `visibleWordingReason` | Helper | Short machine reason | `crystal_no_db_surface` |

### 3c) Log / event mapping — visible wording (Phase 3)

Wording is chosen **after** category inference. Do **not** expect visible wording fields on `REPORT_PAYLOAD_MAIN_ENERGY_INFERENCE` (that event fires before DB / code surface resolution).

| Event | When | Contents |
|-------|------|----------|
| **`REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY`** | Right after `resolveCrystalVisibleWordingPriority` | Nested **`visibleWordingDiagnostics`** (from `buildVisibleWordingTelemetryFields`), plus `energyCategoryCode`, `crystalRoutingRuleId`, `energyCategoryInferenceBranch`, `dbSurfaceOk`, `wordingPrimarySource`, correlation flags |
| **`REPORT_PAYLOAD_BUILT`** | End of payload build | Same telemetry blocks merged in (for one-line log queries) |
| `REPORT_PAYLOAD_DB_WORDING_HYDRATE` | DB hydrate success (unchanged) | Row ids / `rowSource`; correlate with `VISIBLE_WORDING_TELEMETRY` for full picture |

**Correlation fields (logs only, not replacing payload diagnostics):**

| Field | Meaning |
|-------|---------|
| `wordingCategoryMatchesRoutingCategory` | `energyCategoryCode === visibleWordingDiagnostics.visibleWordingCategoryUsed` |
| `crystalRoutingVsWordingCrystalFlagOk` | For `object_family === crystal` and `crystal_rg_*` rule: `true` iff `visibleWordingCrystalSpecific === true`; else `null` (N/A) |

**Example log shape (`REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY`):**

```json
{
  "event": "REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY",
  "scanResultIdPrefix": "00000000",
  "objectFamily": "crystal",
  "energyCategoryCode": "money_work",
  "crystalRoutingRuleId": "crystal_rg_money_work",
  "energyCategoryInferenceBranch": "crystal_money_work",
  "dbSurfaceOk": true,
  "wordingPrimarySource": "db",
  "visibleWordingDiagnostics": {
    "visibleWordingDecisionSource": "db_crystal",
    "visibleWordingObjectFamilyUsed": "crystal",
    "visibleWordingCrystalSpecific": true,
    "visibleWordingCategoryUsed": "money_work",
    "visibleWordingPresentationAngle": null,
    "visibleWordingFallbackLevel": 0,
    "visibleWordingReason": "db_crystal_only_rows"
  },
  "wordingCategoryMatchesRoutingCategory": true,
  "crystalRoutingVsWordingCrystalFlagOk": true,
  "routingWordingMetrics": {
    "routingWordingAlignmentStatus": "aligned",
    "routingWordingMismatchType": "none",
    "routingWordingDashboardGroup": "crystal_aligned",
    "dashboardMetricVersion": "1"
  }
}
```

**Dashboard / debug use**

- Filter `event:REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY` and group by `visibleWordingDiagnostics.visibleWordingDecisionSource` to see DB vs code fallback share.
- Alert when `crystalRoutingVsWordingCrystalFlagOk === false` (crystal routing id present but wording not flagged crystal-specific).
- Alert when `wordingCategoryMatchesRoutingCategory === false` (template category drift vs routing).
- Spike in `visibleWordingDiagnostics.visibleWordingFallbackLevel` (when DB path) or `code_bank_crystal_first` rate (missing DB).

**Helpers:** `src/utils/visibleWordingTelemetry.util.js` — `buildVisibleWordingTelemetryFields`, `buildVisibleWordingTelemetryCorrelation`.

### 3d) Routing vs visible wording mismatch metrics (Phase 4)

`REPORT_PAYLOAD_VERSION` ≥ **1.2.9** adds **`routingWordingMetrics`** (object) to the same events and to `ReportPayload.diagnostics`, produced by `buildCrystalRoutingWordingMetrics()` in `src/utils/crystalRoutingWordingMetrics.util.js`.

Full field list, taxonomy, examples, and alert ideas: **[`crystal-routing-wording-mismatch-metrics.md`](./crystal-routing-wording-mismatch-metrics.md)**.

## 4) Rule mapping table (`crystalRoutingRuleId`)

See **[`tables/crystal-routing-rule-map.csv`](./tables/crystal-routing-rule-map.csv)** for the full list. Summary:

| routingRuleId | routingStrategy | finalCategoryCode | routingReason (typical) | phase | notes |
|---------------|-----------------|---------------------|-------------------------|-------|-------|
| `crystal_rg_spiritual_growth` | early_exit | spiritual_growth | spiritual_growth_signals | early | Moldavite / chakra / strict quartz signals |
| `crystal_rg_money_work` | early_exit | money_work | early_money_work | early | Money/work words, no luck substring |
| `crystal_rg_explicit_luck_word` | early_exit | luck_fortune | early_luck_word | early | `โชค` / `โชคลาภ` in raw text |
| `crystal_rg_resolver_protect` | resolver_direct | protection | resolver_protect | resolver | Strong PROTECT from resolver |
| `crystal_rg_resolver_power_balance` | resolver_direct | confidence | resolver_power_balance | resolver | POWER or BALANCE |
| `crystal_rg_resolver_kindness_attract` | resolver_direct | charm | resolver_kindness_attract | resolver | KINDNESS or ATTRACT |
| `crystal_rg_resolver_luck` | resolver_direct | luck_fortune | resolver_luck | resolver | LUCK from resolver |
| `crystal_rg_weak_protect_charm_social` | weak_protect | charm | weak_protect_charm_cues | weak cue | First matching weak cue row |
| `crystal_rg_weak_protect_charm_metta` | weak_protect | charm | weak_protect_charm_metta | weak cue | |
| `crystal_rg_weak_protect_luck` | weak_protect | luck_fortune | weak_protect_luck_cues | weak cue | |
| `crystal_rg_weak_protect_confidence_boundary` | weak_protect | confidence | weak_protect_confidence_cues | weak cue | |
| `crystal_rg_weak_protect_default` | weak_protect | confidence | weak_protect_default_confidence | weak default | No cue matched |
| `crystal_rg_generic_boost_*` | generic_boost | * | per row | generic cue | Empty / luck / charm / confidence / energy |
| `crystal_rg_default_confidence` | fallback | confidence | crystal_default_confidence | fallback | BOOST, no weak, no generic cue |
| `crystal_rg_fallback_confidence` | fallback | confidence | crystal_default_confidence | fallback | Unknown resolver type |

## 5) Dashboard grouping guidance

**Recommended dimensions**

- **`crystalRoutingStrategy`** — funnel: early_exit vs resolver_direct vs weak_protect vs generic_boost vs fallback.
- **`crystalRoutingRuleId`** — granular slice (top-N charts).
- **`energyCategoryCode`** — product category distribution.
- **`protectSignalStrength`** — weak vs strong vs none (guardrail for protect wording).
- **`objectFamily`** — crystal vs thai_amulet (from diagnostics / payload).
- **`crystalMode`** (`general` / `spiritual_growth`) — orthogonal to category; use for spiritual copy retries.

**Useful KPI / debug views**

- Top 10 `crystalRoutingRuleId` (volume).
- Weak-protect outcome distribution (`crystalWeakProtectOutcome`).
- Share: `crystal_rg_explicit_luck_word` vs `crystal_rg_resolver_luck` (explicit substring vs resolver LUCK).
- Rate of `crystal_rg_default_confidence` + `crystal_rg_fallback_confidence` (confidence fallback).
- **Mismatch watch:** `energyCategoryCode` vs visible copy category / bank (separate wording diagnostics).

## 6) Alert / anomaly suggestions

- **Fallback rate spike** — `routingStrategy === fallback` or `crystal_rg_default_confidence` fraction jumps.
- **`crystal_rg_weak_protect_default` high** — many weak “คุ้มครอง” lines with no cue match (review regex).
- **`protectSignalStrength === strong` but `energyCategoryCode === protection` while `crystalRoutingRuleId` missing** — possible non-crystal path or trace bug.
- **New `routingRuleId` in logs** not listed in CSV/doc — contract drift; update docs + fixtures.
- **Unknown `crystalRoutingStrategy`** — enum mismatch (version skew).

## 7) Maintenance rules

1. **Add / remove / rename `routingRuleId`** → update **this doc**, **`docs/tables/crystal-routing-rule-map.csv`**, **`docs/crystal-routing-spec.md`**, **`tests/fixtures/crystalRoutingCases.fixture.js`**, and any dashboard allowlists **in the same PR**.
2. **Add trace or diagnostics fields** → update **field mapping table** here, **`reportPayload.types.js`**, **builder**, **staging mirror** (`crystalMainEnergyInferenceMirror.mjs`), and **tests**.
3. **`routingRuleId` is a telemetry contract** — treat renames like API changes.
