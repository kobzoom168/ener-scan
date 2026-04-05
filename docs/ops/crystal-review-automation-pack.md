# Crystal review automation + artifact pipeline pack (Phase 17.0)

## Purpose

This pack is a **repeatable pipeline spec** layered on top of utilities that already exist in `main`:

- Monthly / quarterly / half-year / annual / capability / operating-system packs (offline JSON generators).
- Routing/wording telemetry and mismatch metrics (docs + utils — not redefined here).

It answers:

- What **stages** exist and in what **order** to run generators.
- What **depends on** what.
- What is still **manual**, **semi-automated**, or **ready** (offline JSON from utils).
- What **gaps** remain before this feels like one orchestrated pipeline.

It does **not** run jobs, add CI, or change `buildCrystalAnnualOperatingReviewPack`, `buildCrystalCapabilityMaturityRoadmapPack`, `buildCrystalOperatingSystemPack`, or any routing/wording/mismatch semantics.

## Inputs

Same JSON shape as the operating system pack (see `docs/ops/crystal-operating-system-pack.md`), plus optionally:

- `operatingSystemPack` — pre-built output of `buildCrystalOperatingSystemPack` to skip recomputation.

If `operatingSystemPack` is omitted, this util calls `buildCrystalOperatingSystemPack` with your input.

## Outputs (fields)

| Field | Meaning |
|-------|---------|
| `artifactPipelineStages` | Stages with `stageId`, `title`, `inputs`, `outputs`, `dependsOn`, `status`, `knownFailureModes`, `nextUpgrade` |
| `artifactDependencies` | Directed edges between stage ids |
| `artifactContracts` | Pointer to producer util + doc for key JSON artifacts |
| `generationOrder` | Ordered `stageId` list |
| `automationReadinessStatus` | `weak` / `partial` / `strong` heuristic from stage statuses + OS pack |
| `automationReadinessSummary` | Short narrative |
| `manualStepsRemaining` | Human-required stages (labels) |
| `automationGaps` | Bullet list of gaps |
| `recommendedPipelineUpgrades` | Includes OS `recommendedSystemImprovements` lines plus orchestration suggestions |
| `executiveSummary`, `operatingSummary`, `pipelineSummary` | Narrative + top-3 style lists |
| `reviewPackVersion` | Automation pack version string |

## Repo reality

- **Multi-year history** is not implemented as a util — optional stage is **external/manual**.
- **No single npm script** chains every generator today — the pack states that plainly.
- Stages use **real** `src/utils/*.util.js` and `docs/ops/*.md` names.

## Suggested use

- Quarterly ops review: export JSON, run this generator, attach to runbook.
- Before adding CI: align `generationOrder` with the folder layout you actually use.

## Related

- `docs/ops/crystal-operating-system-pack.md`
- `docs/ops/crystal-annual-operating-review-pack.md`
- `docs/ops/crystal-capability-maturity-roadmap-pack.md`
