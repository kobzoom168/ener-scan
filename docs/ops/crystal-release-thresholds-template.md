# Crystal release / post-deploy — thresholds template (Phase 6)

**Purpose:** Define **warning** and **critical** levels for automated or manual review. This file is a **template only**.

## Critical notes (read before use)

1. **Calibrate from real baseline** — Use 2–4 weeks of production or staging traffic in **your** mix (crystal vs Thai).  
2. **Do not treat example numbers as defaults** — Replace placeholders with team-approved values.  
3. **Always interpret spikes with deploy scope** — A wording-only deploy should not use routing-only thresholds as rollback triggers without evidence.  
4. **Metric spikes** must be read **together** (e.g. hard mismatch + object-family + sample payloads).  
5. **Non-crystal traffic** should be **excluded** from crystal denominators (`isCrystalRoutingCase` or equivalent).

---

## Template table

| Metric name | Baseline window (suggested) | Warning threshold | Critical threshold | Suggested action |
|-------------|----------------------------|-------------------|---------------------|------------------|
| `hardMismatchRate` | Rolling 7d same hour | TBD (e.g. +2 pp vs baseline) | TBD (e.g. +5 pp or absolute cap) | Investigate → escalate if sustained |
| `softMismatchRate` | Rolling 7d | TBD | TBD | Monitor → investigate |
| `crystalSpecificSurfaceRate` | Rolling 7d | TBD drop vs baseline | TBD floor | Watch → rollback discussion |
| `genericFallbackRate` | Rolling 7d | TBD | TBD | Investigate DB/code path |
| `fallbackHeavyRate` | Rolling 7d | TBD | TBD | Investigate templates/DB depth |
| `weakProtectDefaultRate` | Rolling 14d | TBD | TBD | Routing/content review |
| `% aligned` (`alignedRate`) | Rolling 7d | TBD drop | TBD floor | Pair with mismatch types |
| `objectFamilyMismatchRate` (from mismatch breakdown) | Rolling 7d | > 0 sustained | TBD | Escalate — likely P1 |
| `categoryMismatchRate` | Rolling 7d | > 0 sustained | TBD | Escalate |

**Code defaults (for offline helper only):** `DEFAULT_RELEASE_THRESHOLDS` in `src/utils/crystalReleaseReviewSummary.util.js` — **override in production** via your own config or wrapped thresholds; do not assume they match your traffic.

---

## Mapping to `buildCrystalReleaseReviewSummary`

The helper uses **rate-based** checks on `aggregateCrystalRoutingDashboardSummary` output. Align your **critical** column with:

- `hardMismatchRateRollback`, `objectFamilyMismatchRateRollback`, `categoryMismatchRateRollback`  
- `crystalSpecificSurfaceRateMinRollback`  
- `fallbackHeavyRateInvestigate`, `genericFallbackRateInvestigate`  
- `softMismatchRateWatch`, `crystalSpecificSurfaceRateMinWatch`, `weakProtectDefaultRateWatch`  
- Optional **baseline deltas**: `deltaHardRateRollback`, `deltaSoftRateWatch`

---

## Review cadence

| Cadence | Use |
|---------|-----|
| Daily | Warning-level drift |
| Per deploy | Full table within first hour + same day |
| Weekly | Re-baseline if product or traffic mix changed |

---

## Related

- **`crystal-post-deploy-review.md`** — when to rollback vs wait  
- **`crystal-dashboard-query-examples.md`** — how to compute rates  
- **`crystal-release-gate-checklist.md`**
