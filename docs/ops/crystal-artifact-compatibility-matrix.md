# Crystal artifact compatibility matrix (Phase 17.4 — repo reality)

## Purpose

Describes **which artifacts consume which**, **minimum version/field expectations**, and **minimal upgrade paths** for the crystal review stack. It does **not**:

- Change generator behavior, routing, visible wording, or mismatch taxonomy semantics
- Replace the artifact manifest, contract linter, or CI spec — it **references** them

## Builder

- `src/utils/crystalArtifactCompatibilityMatrix.util.js` — `buildCrystalArtifactCompatibilityMatrix(inputs?, options?)`
- `buildCrystalArtifactCompatibilityTable()` — slim JSON for committed table export
- CLI: `scripts/ops/generateCrystalArtifactCompatibilityMatrix.mjs`

## Key outputs

| Field | Role |
|-------|------|
| `matrixVersion` / `reviewPackVersion` | Matrix pack ids |
| `artifacts` | Core roles + version hints |
| `compatibilityRows` | Producer → consumer with `compatibilityStatus`, required fields/versions, risk |
| `dependencyCompatibility` | Points at manifest `dependencyGraph.edges` |
| `requiredVersionHints` / `requiredFieldHints` / `versionFieldHints` | From util semver + contract linter exports |
| `breakingChangeRisks` | Doc-level caveats when bumping contracts |
| `upgradePaths` | Named paths with steps, blocking deps, rollback |
| `upgradeReadinessStatus` / `upgradeReadinessSummary` | Roll-up from manifest + contract linter readiness |
| `recommendedUpgradeSequence` | Stable order (`RECOMMENDED_UPGRADE_SEQUENCE`) |
| `contextSnapshot` | `annualPackPresent`, `capabilityPackPresent`, readiness echoes |

## Compatibility status values

- `compatible`
- `compatible_with_conditions` (e.g. rolling → annual row; or annual present but capability `evidenceSourceNote` does not confirm embedded/generated annual reuse)
- `upgrade_needed` (e.g. annual missing when capability is evaluated — including snapshot-only capability inputs)
- `unknown` (external / future, e.g. multi-year)

## Machine-readable table

- `docs/ops/tables/crystal-artifact-compatibility-matrix.json`

Regenerate:

```bash
node scripts/ops/generateCrystalArtifactCompatibilityMatrix.mjs --format json --write-table
```

## Related

- `docs/ops/crystal-artifact-manifest.md`
- `docs/ops/crystal-artifact-contract-linter.md`
- `docs/ops/crystal-artifact-ci-spec.md`
