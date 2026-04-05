# Crystal quality operating system pack (unified review stack)

## Purpose

Phase 16 adds a **mapping layer** on top of artifacts that already exist in the repo. It answers:

- Which **review artifacts** exist (telemetry → rolling reviews → annual → capability).
- Which **layer** is diagnostics vs metrics vs annual vs capability roadmap.
- How strong **evidence continuity** and **linkage** are between annual JSON, capability output, and optional lower-layer references.
- Where **control gaps** remain (manual stitching, missing `releaseSignals`, snapshot-only capability).

This pack **does not** replace `buildCrystalAnnualOperatingReviewPack` or `buildCrystalCapabilityMaturityRoadmapPack`, and **does not** change routing, visible wording, or mismatch taxonomy semantics.

## Expected inputs (code reality)

Provide a JSON object. Typical shapes:

1. **Full chain (recommended)**  
   - `annualOperatingReviewPack`: output of `buildCrystalAnnualOperatingReviewPack`  
   - `capabilityMaturityRoadmapPack`: output of `buildCrystalCapabilityMaturityRoadmapPack` (usually generated with the same annual embedded), **or** omit and let this util call the capability builder using the same annual.

2. **Generators only**  
   - `halfYears` or `months` + `yearWindowStart` / `yearWindowEnd` + optional `releaseSignals` — annual is built first; capability is built with `annualOperatingReviewPack` set internally.

3. **Snapshot-only capability path** (weaker evidence)  
   - `evidenceSnapshot` per capability util — annual may be absent; continuity is marked **partial** or **weak**.

Optional passthrough (not validated):

- `weeklyReviewSummaryRefs`, `monthlyScorecardSummaryRefs`, `quarterlyReviewSummaryRefs` — file paths or labels for human traceability.
- `multiYearHistoryPackReference` — narrative only; there is **no** `buildCrystalMultiYearHistoryPack` in-repo yet.

## How annual and capability feed the system pack

- **Annual** is the KPI and recurring-pattern anchor (`annualKpis`, `topRecurringAnomalies`, `topRecurringMismatchTypes`, `releaseSignalsInput`).
- **Capability** reuses annual when `evidenceSourceNote` matches the string produced by `buildCrystalCapabilityMaturityRoadmapPack` for embedded annual (`Built from embedded or generated annual operating review pack.`).
- The operating system pack **reads** both objects and fills the unified stack + control map + linkage sections. It performs **no** extra aggregation of monthly data beyond what those builders already did.

## Output fields (summary)

| Area | Fields |
|------|--------|
| Meta | `reviewPackVersion`, `generatedAt`, `assessmentWindowStart` / `End`, `annualPackPresent`, `capabilityPackPresent` |
| Stack | `unifiedReviewStack.layers[]` — layer id, title, role, inputs/outputs, questions, consumers, `currentStatus`, `knownGaps` |
| Controls | `operatingControlMap[]` — `controlId`, `status` (`missing` / `partial` / `working` / `strong`), evidence, gaps, `nextUpgrade` |
| Continuity | `evidenceContinuityStatus`, `evidenceContinuitySummary`, `evidenceBreakpoints`, `evidenceStrengths`, `evidenceUpgradeSuggestions` |
| Linkage | `releaseReviewLinkageStatus`, `roadmapLinkageStatus`, `linkageStrengths`, `linkageGaps`, `recommendedLinkageUpgrades` |
| Summaries | `executiveSummary` (`top3Strengths`, `top3Risks`, `top3RecommendedMoves`), `operatingSummary` (ops strengths/gaps/next actions), `systemSummary` (`top3UnifiedStackHighlights`, `top3ControlGaps`, `top3LinkageUpgrades`) |
| Pointers | `docReferences`, `optionalLayerReferences` |

## What this pack does **not** prove

- Live production queries or SLO certification.
- Automatic multi-year trends (unless you attach external history references).
- That every weekly/monthly job actually ran — only what you embed or reference in JSON.

## How to use for quarterly / half-year operating review

1. Export **annual** JSON after monthly/quarterly generators have been run for the window.
2. Run **capability** pack from the same annual (or pass both JSON blobs into the OS pack input).
3. Optionally attach **refs** to monthly/quarterly/weekly files for continuity.
4. Generate **markdown** for leadership; keep **json** under version control.

## Cadence suggestions

- **Half-year roadmap review:** use OS pack + capability pack together.
- **Annual operating planning:** lead with annual JSON, then OS pack for control and linkage narrative.
- **Pre-major routing/wording reset:** compare `evidenceBreakpoints` + control map `partial` rows before locking semantics.

## Related docs

- `docs/ops/crystal-annual-operating-review-pack.md`
- `docs/ops/crystal-capability-maturity-roadmap-pack.md`
- `docs/crystal-routing-telemetry-mapping.md`
- `docs/crystal-routing-wording-mismatch-metrics.md`
