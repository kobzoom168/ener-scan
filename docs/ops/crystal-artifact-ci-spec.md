# Crystal artifact CI spec (Phase 17.2 — minimal, repo reality)

## Purpose

This describes a **minimal** set of CI jobs and validation checks for the crystal **artifact review stack**. It does **not**:

- Replace your CI platform or add a heavy pipeline
- Change `buildCrystalAnnualOperatingReviewPack`, capability/OS/automation/manifest utils, or routing/wording/mismatch semantics
- Assume full automation — many steps remain **manual** or **external**

Use it to answer: what to run, in what order, what is **fail-hard** vs **fail-soft**, and what still needs human follow-up.

## Builder

- Util: `src/utils/crystalArtifactCiValidation.util.js` — `buildCrystalArtifactCiSpec(inputs?, options?)`
- CLI: `scripts/ops/generateCrystalArtifactCiSpec.mjs`

## Jobs (`jobOrder`)

1. `validate_artifact_manifest`
2. `validate_required_artifacts_present`
3. `validate_generation_order`
4. `validate_dependency_graph`
5. `validate_machine_readable_contracts`
6. `validate_pack_renderability`
7. `report_manual_followups`

## Validation checks

Each check includes: `checkId`, `title`, `scope`, `severity` (`hard` | `soft`), `summary`, `expectedCondition`, `failureMeaning`, `recommendedAction`, and `assessment` (`pass` | `warn` | `fail` | `unknown`).

- **Fail-hard** list: `failHardChecks` — severity `hard`; CI should block merge if any `assessment === "fail"` (team policy).
- **Fail-soft** list: `failSoftChecks` — severity `soft`; warn / advisory.

Optional **render smoke** runs `build*` + `render*` for manifest, OS, and automation packs unless `ciValidationContext.skipRenderSmoke` is set. Use `ciValidationContext.forceRenderFailure` in tests to simulate a render failure without changing pack code.

## Outputs

| Field | Meaning |
|-------|---------|
| `ciSpecVersion` | Spec schema version |
| `reviewPackVersion` | This CI spec pack id |
| `jobs` / `jobOrder` | Job definitions and order |
| `validationChecks` | Full check list |
| `failHardChecks` / `failSoftChecks` | Partitioned by severity |
| `manualFollowups` | Human items + manifest manual rows |
| `artifactCoverageSummary` | Short coverage narrative |
| `ciReadinessStatus` / `ciReadinessSummary` | Inherits from manifest, downgraded if hard checks fail |
| `recommendedNextCiUpgrades` | Next automation steps |

## Machine-readable export

Committed snapshot:

- `docs/ops/tables/crystal-artifact-ci-spec.json`

Regenerate:

```bash
node scripts/ops/generateCrystalArtifactCiSpec.mjs --format json --write-table
```

Optional: `CI_SPEC_GENERATED_AT` when using `--write-table`.

## Example commands

```bash
node scripts/ops/generateCrystalArtifactCiSpec.mjs --input ./tmp/ci-input.json --format markdown
node scripts/ops/generateCrystalArtifactCiSpec.mjs --format json --write-table
```

## Related

- `docs/ops/crystal-artifact-manifest.md`
- `docs/ops/crystal-review-automation-pack.md`
- `docs/ops/crystal-operating-system-pack.md`
