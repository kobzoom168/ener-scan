# Crystal artifact manifest (Phase 17.1 — CI-friendly, repo reality)

## Purpose

This is a **machine-describable** map of crystal **review stack artifacts** that exist in `main` today: scripts, utils, docs, and how they depend on each other. It is **not** a runner, **not** CI enforcement, and **does not** change:

- `buildCrystalAnnualOperatingReviewPack`
- `buildCrystalCapabilityMaturityRoadmapPack`
- `buildCrystalOperatingSystemPack`
- `buildCrystalReviewAutomationPack`
- routing / visible wording / mismatch taxonomy semantics

Use it so automation can **name**, **order**, and **diff** artifacts without pretending the repo has a full orchestrated pipeline.

## Outputs (`buildCrystalArtifactManifest`)

| Field | Meaning |
|-------|---------|
| `manifestVersion` | Schema/version for this manifest shape |
| `reviewPackVersion` | Pack id for this util |
| `artifacts[]` | Rows with `artifactId`, `title`, `category`, `inputs`, `outputs`, `dependsOn`, `scriptPath`, `utilPath`, `status`, `contractStatus`, `knownGaps`, `nextUpgrade` |
| `generationOrder` | Recommended CI-friendly order (`CRYSTAL_ARTIFACT_GENERATION_ORDER`) |
| `dependencyGraph` | `edges` + `nodeIds` |
| `artifactContracts` | Key contracts with `producerUtil` + `docPath` |
| `artifactStatuses` | Map of `artifactId` → status |
| `ciReadinessStatus` / `ciReadinessSummary` | Heuristic from artifact statuses + OS pack presence |
| `manualArtifactsRemaining` | Human-required rows |
| `recommendedManifestUpgrades` | Includes OS `recommendedSystemImprovements` + CI diff suggestions |
| `automationPackRef` | Versions of nested automation + OS packs used for context |

## Scope

Included: telemetry/diagnostics inputs, mismatch metrics, monthly/quarterly/half-year/weekly generators where present, annual pack, capability pack, OS pack, review automation pack, this manifest, and **`multi_year_history_external`** as **`external_or_future`** (no util in-repo).

## Machine-readable table

Committed snapshot (regenerate when changing the manifest util):

- `docs/ops/tables/crystal-artifact-manifest.json`

Regenerate:

```bash
node scripts/ops/generateCrystalArtifactManifest.mjs --format json --write-table
```

Optional: set `MANIFEST_GENERATED_AT` to pin `generatedAt` in the written file.

## CLI

```bash
node scripts/ops/generateCrystalArtifactManifest.mjs --input ./tmp/manifest-input.json --format json
node scripts/ops/generateCrystalArtifactManifest.mjs --input ./tmp/manifest-input.json --format markdown
```

Input is optional; defaults to `{}` (builds nested OS + automation context from empty composite inputs).

## Related

- `docs/ops/crystal-review-automation-pack.md`
- `docs/ops/crystal-operating-system-pack.md`
