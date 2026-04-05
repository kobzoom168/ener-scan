# Crystal artifact contract linter (Phase 17.3 — minimal)

## Purpose

Offline **shape + version** checks for machine JSON artifacts in the crystal review stack. This is **not** a full JSON Schema platform and **does not**:

- Change generators, routing, visible wording, or mismatch taxonomy semantics
- Replace integration tests or production validation

It **does** help catch:

- Missing **required top-level fields** (static list per artifact)
- Missing **version / id** fields (`reviewPackVersion`, `manifestVersion`, `ciSpecVersion`, …)
- **Drift**: unexpected top-level keys vs a documented allowlist (`KNOWN_KEYS`)

## Artifacts covered

| Artifact id | Notes |
|-------------|--------|
| `artifact_manifest` | From `buildCrystalArtifactManifest` |
| `annual_operating_review_pack` | Optional — **soft** if absent (no year inputs) |
| `capability_maturity_roadmap_pack` | From `buildCrystalCapabilityMaturityRoadmapPack` |
| `operating_system_pack` | From `buildCrystalOperatingSystemPack` |
| `review_automation_pack` | From `buildCrystalReviewAutomationPack` |
| `artifact_ci_spec` | From `buildCrystalArtifactCiSpec` |
| `multi_year_history_external` | **external_or_future** — no object lint |

## Outputs

| Field | Role |
|-------|------|
| `linterVersion` / `reviewPackVersion` | Linter pack ids |
| `artifactSchemas` | Human-readable schema rows (not JSON Schema) |
| `requiredFieldsByArtifact` / `versionFields` | Static contract anchors |
| `contractChecks` | Per-artifact rows with `missingFields`, `unexpectedFields`, `versionStatus` |
| `schemaGuardResults` | Parse/shape/unexpected counts |
| `hardFailures` / `softFailures` / `warnings` | Classified issues |
| `contractReadinessStatus` / `contractReadinessSummary` | Roll-up |
| `recommendedSchemaUpgrades` | When to extend `KNOWN_KEYS` or add golden fixtures |

## Severity

- **Hard:** missing required fields or version ids on **core** artifacts (manifest, capability, OS, automation, CI spec).
- **Soft:** annual pack missing when no annual inputs; drift-only (unexpected keys) surfaces as **warnings** when nothing else fails.

## CLI

```bash
node scripts/ops/runCrystalArtifactContractLinter.mjs --input ./tmp/linter-input.json --format json
node scripts/ops/runCrystalArtifactContractLinter.mjs --format markdown --write-contract-map
```

## Machine-readable contract map

- `docs/ops/tables/crystal-artifact-contract-map.json` — static map (`requiredFieldsByArtifact`, `versionFields`, `knownKeySets`).

Regenerate with `--write-contract-map`.

## Related

- `docs/ops/crystal-artifact-manifest.md`
- `docs/ops/crystal-artifact-ci-spec.md`
