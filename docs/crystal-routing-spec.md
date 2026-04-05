# Crystal category routing spec

## Purpose

`src/utils/crystalCategoryRouting.util.js` is the **single structured decision layer** for mapping crystal main-energy text → `energy_categories.code` (sync, no DB). Family-aware keyword priority lives in `resolveEnergyTypeMetaForFamily` (scan copy utils); this module **consumes** resolver output and applies crystal-specific **early exits** and **BOOST** cue tables.

Truth for category selection is intended to flow **payload / code** (this module + resolver), not ad-hoc wording surfaces.

## Single source of truth

The object returned by `resolveCrystalCategoryRouting()` / the crystal branch of `inferEnergyCategoryFull()` is the canonical source for:

1. **Category inference** — `categoryCode` (via `inferEnergyCategoryCodeFromMainEnergy` for `object_family = crystal`)
2. **Inference trace** — `inferEnergyCategoryInferenceTrace()` (crystal fields populated from the same routing result)
3. **Telemetry / diagnostics** — `reportPayload` diagnostics and `REPORT_PAYLOAD_MAIN_ENERGY_INFERENCE` logs (fields copied from trace)

If you add a field to the structured result, update **this doc**, **trace typing** (`reportPayload.types.js`), **builder logging**, and **tests** in the same change.

## Input contract (`CrystalRoutingInput`)

Built with `buildCrystalRoutingInput(mainEnergyRaw, meta, flags)`:

| Field | Meaning |
|--------|---------|
| `mainEnergyRaw` | Normalized single-line main energy string |
| `resolvedEnergyType` | `meta.energyType` — Thai key from resolver (`ENERGY_TYPES`) |
| `protectSignalStrength` | `"strong"` \| `"weak"` \| `"none"` |
| `protectKeywordMatched` | When resolver selected PROTECT (strong) |
| `protectWeakKeywordMatched` | When weak protect keyword matched (BOOST + weak) |
| `resolvedEnergyTypeBeforeCategoryMap` | Telemetry mirror of resolver energy type |
| `hasSpiritualGrowthSignal` | From `matchesCrystalSpiritualGrowthSignals` (caller) |
| `hasLuckWord` | Substring `โชค` / `โชคลาภ` (caller) |
| `hasMoneyWorkWord` | Money/work regex, caller-computed (caller) |

`objectFamilyRaw` is **not** passed into the router; only crystal paths invoke it.

## Output contract (`CrystalRoutingResult`)

| Field | Semantics |
|--------|-----------|
| `categoryCode` | Target `energy_categories.code`: `protection`, `confidence`, `charm`, `luck_fortune`, `money_work`, `spiritual_growth`, etc. |
| `routingRuleId` | **Stable telemetry/debug id** (e.g. `crystal_rg_weak_protect_charm_social`). Do not rename without a migration note and consumer update. |
| `routingReason` | Short machine-readable reason for logs (finer than legacy `crystalNonProtectRoutingReason` in some paths). |
| `routingStrategy` | Behavioral grouping: `early_exit`, `resolver_direct`, `weak_protect`, `generic_boost`, `fallback`. |
| `crystalWeakProtectOutcome` | When `routingStrategy === weak_protect`, the category code chosen for that path; otherwise `null`. |
| `inferenceBranchSuffix` | Suffix after `crystal_` in `energyCategoryInferenceTrace.inferenceBranch` (backward compatible). |
| `needsLuckWordMetaOverride` | If `true`, caller must override trace meta to LUCK-shaped fields for explicit luck-word early exit. |

Legacy compact diagnostics: `crystalLegacyNonProtectRoutingReason()` maps the result to strings like `weak_protect_confidence`, `generic_boost_luck_fortune`, etc.

## Evaluation order (freeze)

1. **`CRYSTAL_ROUTING_RULES`** (early exit) — spiritual growth → money/work (no luck) → explicit luck word  
2. Resolver-direct branches — PROTECT, POWER/BALANCE, KINDNESS/ATTRACT, LUCK  
3. **`CRYSTAL_WEAK_PROTECT_CUE_RULES`** — only when `energyType === BOOST` and `protectSignalStrength === weak`  
4. **`CRYSTAL_GENERIC_BOOST_CUE_RULES`** — when BOOST and not weak  
5. Fallback — `crystal_rg_default_confidence`

Order inside each cue array **matters** (first match wins).

## Thai / non-crystal

Thai amulet / talisman paths **do not** call `resolveCrystalCategoryRouting`. They use the existing switch in `energyCategoryResolve.util.js`. This spec applies to **crystal** only unless noted.

## Regression fixtures

Frozen cases live in `tests/fixtures/crystalRoutingCases.fixture.js`. Changing rule order or regexes should update expectations deliberately and run the full test suite.

## Related docs

- **[crystal-routing-telemetry-mapping.md](./crystal-routing-telemetry-mapping.md)** — `routingRuleId` / trace / diagnostics / dashboard mapping.
- **`src/utils/crystalVisibleWordingPriority.util.js`** — traceable crystal-first **wording** source (DB vs code), orthogonal to category routing.
