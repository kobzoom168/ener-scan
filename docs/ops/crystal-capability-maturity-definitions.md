# Crystal capability maturity — level definitions (template)

These definitions support **discussion and planning** only. They are **not** production SLAs or compliance levels.

## Levels and bands

| Level | Band | Meaning (template) |
|-------|------|---------------------|
| **L1** | **fragile** | Evidence shows strong pressure (e.g. high mismatch, clusters, or missing exports). |
| **L2** | **emerging** | Metrics and reviews exist but patterns still need manual triage. |
| **L3** | **stable** | Cadence and metrics support routine operating review. |
| **L4** | **scalable** | Domain looks strong in the submitted window; ready for incremental tuning at scale. |

## Domains (ids)

- `routing_stability` — hard mismatch rate, cluster max, anomaly codes.  
- `wording_quality` — crystal-specific surface, soft mismatch, usage-drop signals.  
- `db_coverage` — generic fallback blend and generic_fallback_elevated pattern.  
- `telemetry_observability` — presence of annual pack and operating-impact-style signals.  
- `review_ops_discipline` — quarterly / half-year status mix in input.  
- `release_change_safety` — `releaseSignals` vs recurring codes.

Exact scoring rules: `src/utils/crystalCapabilityMaturityRoadmapPack.util.js`.

## Roadmap buckets

- **maintain_now** — keep cadence when no acute gap.  
- **stabilize_next** — process/export/wording stabilization.  
- **invest_next_quarter** — foundation (DB/wording/routing) or release/telemetry when evidence supports.  
- **defer_for_now** — informational or low-urgency items.

Roadmap **categories**: `routing`, `wording`, `db`, `telemetry`, `ops`, `release`. Priorities **P1–P3** and horizons **now / next_quarter / later** are template labels for planning.
