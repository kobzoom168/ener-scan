# Crystal release governance runbook (Phase 17.8 — repo reality)

## Purpose

Consolidates **pre-release gates**, **post-deploy checks**, **drift / mismatch response**, **rollback**, **hotfix**, and **escalation** for the crystal review stack — without building a separate release platform.

## Builder

- `src/utils/crystalReleaseGovernanceRunbook.util.js` — `buildCrystalReleaseGovernanceRunbook(inputs?, options?)`
- `buildCrystalReleaseGovernanceRunbookTable()` — slim JSON
- CLI: `scripts/ops/generateCrystalReleaseGovernanceRunbook.mjs`

## Key outputs

| Field | Role |
|-------|------|
| `runbookVersion` / `reviewPackVersion` | Runbook pack ids |
| `releaseGovernanceRules` | High-level gates (manifest, linter, lifecycle) |
| `preReleaseChecks` / `postDeployChecks` | Checklist items with owner roles |
| `driftResponseRules` | Mismatch spike, schema drift, incompatibility, missing owner |
| `rollbackRules` / `hotfixRules` | When and how to revert or minimal fix |
| `ownerEscalationMap` | Fallback owners by situation |
| `runbookReadinessStatus` | Roll-up from manifest, CI spec, linter, lifecycle, ownership, handoff |

## Machine-readable table

- `docs/ops/tables/crystal-release-governance-runbook.json`

```bash
node scripts/ops/generateCrystalReleaseGovernanceRunbook.mjs --format json --write-table
```

## Related

- `docs/ops/crystal-artifact-handoff-protocol.md`
- `docs/ops/crystal-artifact-lifecycle-policy.md`
- `docs/ops/crystal-artifact-ci-spec.md`
