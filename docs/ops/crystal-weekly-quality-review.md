# Crystal weekly quality review report

**Purpose:** Produce a **lightweight weekly artifact** (Markdown or JSON) summarizing crystal **routing vs visible wording** alignment and mismatch signals, using the same metrics contract as production logs. **Not** a substitute for full observability stacks or calibrated SLOs.

**Heuristics:** Status (`healthy` / `watch` / `investigate` / `escalate`) uses **template thresholds** in `WEEKLY_REVIEW_HEURISTIC_DEFAULTS` (`src/utils/crystalWeeklyQualityReview.util.js`). **Calibrate** to your baseline before executive decisions.

---

## Input contract

See **`crystal-weekly-review-input-contract.md`**. Rows should mirror `routingWordingMetrics` + routing fields from telemetry exports.

---

## Output fields (summary object)

| Field | Meaning |
|-------|---------|
| `windowStart` / `windowEnd` / `generatedAt` | Review window and generation time |
| `totalCrystalCases` | Crystal routing rows in window |
| `notApplicableRowCount` | Non-crystal rows in export (excluded from rates) |
| `alignedCount` / `softMismatchCount` / `hardMismatchCount` | Counts |
| `alignedRate` / `softMismatchRate` / `hardMismatchRate` | 0..1 among crystal cases |
| `crystalSpecificSurfaceRate` | Share with `visibleWordingCrystalSpecific=true` |
| `genericFallbackRate` | Code-bank `code_bank_*` share on crystal rows |
| `fallbackHeavyRate` | DB-heavy fallback (`visibleWordingFallbackLevel >= 2`) |
| `weakProtectDefaultRate` | Share with `crystal_rg_weak_protect_default` |
| `topMismatchTypes` / `topRoutingRuleIds` / `topDecisionSources` | Ranked tables |
| `ruleDistribution` | Counts per rule id (appendix) |
| `recommendations` | Suggested follow-ups |
| `reviewStatus` | Template weekly status |
| `monitorItems` / `investigateItems` / `escalateItems` | Risk bullets |
| `signals` | Optional deltas if `baselineAggregate` supplied |
| `rawAggregateSnapshot` | Full `aggregateCrystalRoutingDashboardSummary` output |

---

## How to read the Markdown report

1. **Header** — week window and **review status** (template).  
2. **Executive summary** — rates and counts; compare to **last week** manually or via `baselineAggregate`.  
3. **Top findings** — mismatch types, rules, wording sources; identify drift.  
4. **Risk calls** — what to monitor vs investigate vs escalate **per heuristic**.  
5. **Suggested next actions** — ops playbook alignment (DB, weak-protect, code-bank share).  
6. **Appendix** — raw JSON snapshot for spreadsheets.

---

## How to use in weekly ops

| Cadence | Use |
|---------|-----|
| **Weekly** | Run after exporting last 7 days of crystal rows from logs/warehouse. |
| **Post-release** | Run for the week containing a routing/wording deploy; compare to prior week. |
| **Before DB wording batch** | Baseline mismatch + fallback rates; rerun after batch. |

Pair with **`crystal-routing-wording-playbook.md`** and **`crystal-dashboard-query-examples.md`**.

---

## Caveats / limitations

- **Offline only** in this repo — no live DB or log connection.  
- **Template heuristics** — tune `WEEKLY_REVIEW_HEURISTIC_DEFAULTS` or pass `heuristicThresholds` in code (future API); CLI does not expose threshold overrides yet.  
- **Sampling bias** — exports must represent crystal traffic fairly.  
- **Non-crystal noise** — large Thai volume does **not** distort crystal rates when rows are labeled correctly.

---

## CLI

```bash
node scripts/ops/generateCrystalWeeklyQualityReview.mjs --input tests/fixtures/crystalWeekSample.export.json --format markdown
node scripts/ops/generateCrystalWeeklyQualityReview.mjs --input tests/fixtures/crystalWeekSample.export.json --format json
```

**Input:** JSON array or `{ rows, windowStart, windowEnd, generatedAt?, baselineAggregate? }`.

---

## Programmatic use

```javascript
import {
  buildCrystalWeeklyQualityReview,
  renderCrystalWeeklyQualityReviewMarkdown,
} from "../../src/utils/crystalWeeklyQualityReview.util.js";

const summary = buildCrystalWeeklyQualityReview(rows, {
  windowStart: "2026-03-24T00:00:00.000Z",
  windowEnd: "2026-03-31T00:00:00.000Z",
  generatedAt: new Date().toISOString(),
});
const md = renderCrystalWeeklyQualityReviewMarkdown(summary);
```

---

## Related

- **`crystal-weekly-trend-comparison.md`** — week-over-week drift on top of two weekly summaries  
- **`crystal-weekly-review-input-contract.md`**  
- **`crystal-release-gate-checklist.md`** / **`crystal-post-deploy-review.md`**  
- **`crystal-routing-wording-playbook.md`**
