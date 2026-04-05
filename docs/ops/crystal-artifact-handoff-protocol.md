# Crystal artifact handoff protocol (Phase 17.7 — repo reality)

## Purpose

Defines **who must be informed**, **who reviews**, **who approves**, and **what to update** when crystal artifacts change. It does **not** change generators, routing, wording, or mismatch semantics.

## Builder

- `src/utils/crystalArtifactHandoffProtocol.util.js` — `buildCrystalArtifactHandoffProtocol(inputs?, options?)`
- `buildCrystalArtifactHandoffProtocolTable()` — slim JSON
- CLI: `scripts/ops/generateCrystalArtifactHandoffProtocol.mjs`

## Key outputs

| Field | Role |
|-------|------|
| `handoffProtocolVersion` / `reviewPackVersion` | Protocol ids |
| `changeTypes` | `contract_change`, `schema_change`, `compatibility_change`, `lifecycle_change`, `ownership_change`, `ci_change`, `doc_only_change` |
| `artifactHandoffRows` | Template rows per artifact + change type (includes `rowId`, impact, steps) |
| `changeCommunicationRules` | When to notify / pair docs |
| `requiredNotifications` / `requiredApprovals` | Minimum channels and approvers by change type |
| `consumerImpactRules` | low / medium / high definitions |
| `handoffReadinessStatus` | Tied to ownership model coverage |
| `recommendedHandoffUpgrades` | PR template / CI ideas |

## Machine-readable table

- `docs/ops/tables/crystal-artifact-handoff-protocol.json`

```bash
node scripts/ops/generateCrystalArtifactHandoffProtocol.mjs --format json --write-table
```

## Related

- `docs/ops/crystal-artifact-ownership-model.md`
- `docs/ops/crystal-artifact-manifest.md`
