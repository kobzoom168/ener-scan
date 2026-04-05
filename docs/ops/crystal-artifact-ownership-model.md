# Crystal artifact ownership model (Phase 17.6 — repo reality)

## Purpose

Maps **logical owner roles** and **review responsibilities** for crystal artifacts. It does **not**:

- Change generator behavior, routing, visible wording, or mismatch taxonomy semantics
- Encode HR/org chart — role strings are **repo-local conventions** (`crystal_repo_engineering`, `product_review_crystal`, etc.)

## Builder

- `src/utils/crystalArtifactOwnershipModel.util.js` — `buildCrystalArtifactOwnershipModel(inputs?, options?)`
- `buildCrystalArtifactOwnershipModelTable()` — slim JSON for committed table export
- CLI: `scripts/ops/generateCrystalArtifactOwnershipModel.mjs`

## Key outputs

| Field | Role |
|-------|------|
| `ownershipModelVersion` / `reviewPackVersion` | Model pack ids |
| `artifactOwnershipRows` | Per-artifact roles, reviewers, approval/escalation, status |
| `reviewResponsibilityMap` | Nine responsibility lanes (contract, linter, compatibility, lifecycle, CI, telemetry, annual, capability, OS) |
| `approvalPaths` | Contract changes, compatibility-impacting changes, deprecation/retirement |
| `escalationPaths` | Unclear ownership, unowned-but-consumed, cross-domain drift |
| `ownerCoverageStatus` / `ownerCoverageSummary` | Roll-up from row statuses |
| `unownedArtifacts` | e.g. `multi_year_history_external` (no in-repo generator) |
| `responsibilityGaps` | Honest gaps (telemetry spans modules, roles are placeholders) |
| `recommendedOwnershipFixes` | Action list |

## Repo-honest notes

- **`multi_year_history_external`** is **`unowned`** in-repo — there is no generator util to assign engineering ownership to.
- **`telemetry_diagnostics_inputs`** is **`unclear`** — inputs span multiple modules; name a DRI outside git if needed.
- **Phase 17 meta** artifacts share **`artifact_stack_platform_owner`** + engineering backup.

## Machine-readable table

- `docs/ops/tables/crystal-artifact-ownership-model.json`

Regenerate:

```bash
node scripts/ops/generateCrystalArtifactOwnershipModel.mjs --format json --write-table
```

## Related

- `docs/ops/crystal-artifact-manifest.md`
- `docs/ops/crystal-artifact-lifecycle-policy.md`
- `docs/ops/crystal-artifact-compatibility-matrix.md`
