# Crystal quality operating system pack (Phase 16.1 — repo reality)

## Purpose

This is a **mapping layer only** on top of what exists in `main` today:

- `buildCrystalAnnualOperatingReviewPack`
- `buildCrystalCapabilityMaturityRoadmapPack`
- Routing/wording telemetry + mismatch metrics (docs + KPI fields that flow into monthly → annual)

It does **not** replace those utilities, does **not** query production, and does **not** change routing, visible wording, or mismatch taxonomy semantics.

## Review layers (canonical)

The pack exposes **`reviewLayers`** — **five** core layers in all runs:

1. **Telemetry layer** — report-payload / routing telemetry contract (`docs/crystal-routing-telemetry-mapping.md`).
2. **Diagnostics layer** — visible wording diagnostics (code + tests in-repo).
3. **Mismatch metrics layer** — routing vs wording mismatch (`docs/crystal-routing-wording-mismatch-metrics.md` → annual rollups).
4. **Annual operating review layer** — `buildCrystalAnnualOperatingReviewPack` JSON (optional `releaseSignals` → `releaseSignalsInput`).
5. **Capability maturity / roadmap layer** — `buildCrystalCapabilityMaturityRoadmapPack` JSON.

A **sixth** layer, **optional historical / external input**, appears **only** when `multiYearHistoryPackReference` (or `multiYearHistoryPack`) is present in the input. There is **no** multi-year generator util in-repo — the layer is explicitly **external / passthrough**.

Release checklists and weekly/monthly/quarterly generators are **not** separate layers here; they are referenced in `docReferences`, continuity breakpoints, and annual release-signal fields.

`unifiedReviewStack.layers` is **deprecated** but still populated as an alias of `reviewLayers` for older callers.

## Expected inputs

1. **Full chain:** `annualOperatingReviewPack` + `capabilityMaturityRoadmapPack`, or omit capability and pass the same inputs the capability util accepts so it can be built from the annual.
2. **Generators only:** `halfYears` or `months` + year window + optional `releaseSignals`.
3. **Snapshot-only capability:** `evidenceSnapshot` without full annual — weaker continuity.

Optional: `weeklyReviewSummaryRefs`, `monthlyScorecardSummaryRefs`, `quarterlyReviewSummaryRefs`, `multiYearHistoryPackReference`.

## Must-have output fields

| Field | Role |
|-------|------|
| `reviewPackVersion` | OS map version (e.g. `1.1`) |
| `reviewLayers` | Layer list (see above) |
| `operatingControlMap` | Eight controls (telemetry contract, routing traceability, wording traceability, mismatch detection, annual review, capability roadmap, release–review linkage, evidence continuity) |
| `evidenceContinuityStatus` / `evidenceContinuitySummary` / `evidenceBreakpoints` | Continuity assessment |
| `releaseReviewLinkageStatus` / `roadmapLinkageStatus` / `linkageStrengths` / `linkageGaps` | Linkage |
| `recommendedSystemImprovements` | De-duplicated merge of continuity upgrades + linkage upgrades |
| `recommendedLinkageUpgrades` | Still present for detail (subset source for merge) |
| `executiveSummary` / `operatingSummary` / `systemSummary` | Three narrative blocks |

## Controls

Each control includes: `controlId`, `controlTitle`, `status` (`missing` / `partial` / `working` / `strong`), `summary`, `evidence`, `gaps`, `nextUpgrade`.

## What this pack does not prove

- Live SLOs, CI runs, or that every monthly job executed — only JSON you pass in.
- Multi-year trends unless you attach an external reference.

## Related docs

- `docs/ops/crystal-annual-operating-review-pack.md`
- `docs/ops/crystal-capability-maturity-roadmap-pack.md`
- `docs/crystal-routing-telemetry-mapping.md`
- `docs/crystal-routing-wording-mismatch-metrics.md`
- `docs/ops/crystal-review-automation-pack.md` (pipeline spec on top of this pack)
