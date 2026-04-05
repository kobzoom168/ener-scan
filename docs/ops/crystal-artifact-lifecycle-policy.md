# Crystal artifact lifecycle policy (Phase 17.5 — repo reality)

## Purpose

Describes **lifecycle states**, **promote / freeze / deprecate / retire** discipline, and **where deprecation is communicated** for the crystal artifact stack. It does **not**:

- Change generator behavior, routing, visible wording, or mismatch taxonomy semantics
- Replace the artifact manifest, compatibility matrix, contract linter, or CI spec — it **references** them

## Builder

- `src/utils/crystalArtifactLifecyclePolicy.util.js` — `buildCrystalArtifactLifecyclePolicy(inputs?, options?)`
- `buildCrystalArtifactLifecyclePolicyTable()` — slim JSON for committed table export
- CLI: `scripts/ops/generateCrystalArtifactLifecyclePolicy.mjs`

## Key outputs

| Field | Role |
|-------|------|
| `lifecyclePolicyVersion` / `reviewPackVersion` | Policy pack ids |
| `artifactLifecycleStates` | Definitions for `active` / `legacy` / `transitional` / `deprecated` / `retired` |
| `artifactLifecycleRows` | Per-artifact state, reasons, deps, consumers, criteria |
| `promotionRules` | e.g. transitional → active when consumers + matrix are clear |
| `freezeRules` | Contract freeze when manifest + linter consumers exist |
| `deprecationRules` | Deprecate only with replacement + communication |
| `retirementRules` | Retire when no critical consumers |
| `backwardCompatibilityRules` | Additive fields + version communication |
| `deprecationSignals` | JSDoc, docs/ops, matrix, manifest gaps |
| `retirementReadinessStatus` / `retirementReadinessSummary` | Roll-up from manifest + linter + matrix + CI spec |
| `recommendedLifecycleActions` | Stable checklist (`RECOMMENDED_LIFECYCLE_ACTIONS`) |

## Repo-honest notes

- **`multi_year_history_external`** is **not governed in-repo** (no generator util) — `transitional` / external stance.
- **Phase 17 meta** (`artifact_ci_spec`, `artifact_compatibility_matrix`, `artifact_lifecycle_policy`) are **`transitional`** until CI adoption is uniform.
- **`operating_system_pack.layers_field`** documents **real** `@deprecated` alias behavior (`layers` vs `reviewLayers`) — the **pack** stays **active**.
- **`policy_illustration_retired_row`** exists so the **`retired` state** is representable; **no** crystal generator is retired in-repo today.

## Machine-readable table

- `docs/ops/tables/crystal-artifact-lifecycle-policy.json`

Regenerate:

```bash
node scripts/ops/generateCrystalArtifactLifecyclePolicy.mjs --format json --write-table
```

## Related

- `docs/ops/crystal-artifact-manifest.md`
- `docs/ops/crystal-artifact-compatibility-matrix.md`
- `docs/ops/crystal-artifact-contract-linter.md`
- `docs/ops/crystal-artifact-ci-spec.md`
- `docs/ops/crystal-operating-system-pack.md` (`layers` deprecation)
