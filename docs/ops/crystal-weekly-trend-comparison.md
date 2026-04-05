# Crystal weekly trend comparison (week-over-week)

**Purpose:** Compare two **Phase 7 weekly quality summaries** and surface **rate deltas**, **distribution shifts** (rules, mismatch types, wording sources), and a **template trend status** (`stable` / `watch` / `investigate` / `escalate`).

**Heuristics:** `TREND_HEURISTIC_DEFAULTS` in `src/utils/crystalWeeklyTrendComparison.util.js` are **templates** — calibrate to your traffic; not production truth.

---

## Expected inputs

### Primary path (recommended)

Two JSON files, each the **output** of `buildCrystalWeeklyQualityReview()` (same shape as `npm run` / script output from Phase 7). Must include at least:

- `windowStart`, `windowEnd`, `totalCrystalCases`, rate fields, `topMismatchTypes`, `topRoutingRuleIds`, `topDecisionSources`, `reviewStatus`, etc.

### Alternate path

Each file may instead be `{ rows, windowStart, windowEnd, generatedAt?, ... }`; the CLI runs `buildCrystalWeeklyQualityReview` on `rows` first (same as Phase 7 generator).

**Input field semantics** for `rows`: see **`crystal-weekly-review-input-contract.md`** (Phase 7). No new taxonomy.

---

## Comparison output fields

| Field | Meaning |
|-------|---------|
| `comparisonVersion` | Schema version |
| `generatedAt` | When comparison was built |
| `currentWindow` / `previousWindow` | From embedded weekly summaries |
| `totalCrystalCasesCurrent` / `totalCrystalCasesPrevious` | Crystal denominators |
| `reviewStatusDelta` | `{ current, previous }` weekly `reviewStatus` |
| `metricDiffs` | Count deltas (aligned / soft / hard / total crystal cases) |
| `rateDiffs` | Current − previous for aligned, soft, hard, crystal-specific, generic fallback, fallback-heavy, weak-protect-default |
| `topMismatchShifts` / `topRuleShifts` / `topDecisionSourceShifts` | Per-key share and count deltas (sorted by \|Δshare\|) |
| `driftSignals` | Machine-readable codes |
| `trendStatus` | Template aggregate verdict |
| `stableItems` / `watchItems` / `investigateItems` / `escalateItems` | Narrative bullets |
| `recommendations` | Suggested follow-ups |
| `heuristicNote` | Disclaimer |

`buildCrystalWeeklyDriftSignals(comparison)` returns a compact `{ codes, trendStatus, ... }` for automation.

---

## How to read drift signals

1. Start **`rateDiffs`** — alignment and mismatch rates move first.  
2. Check **`topMismatchShifts`** and **`topRuleShifts`** for *where* the mix moved.  
3. Use **`trendStatus`** as a **prioritization hint**, not a definitive incident verdict.  
4. **Non-crystal rows** in weekly exports do not enter crystal denominators (Phase 7); comparing two Thai-heavy weeks still compares **crystal slices** only.

---

## Caveats / limitations

- **Offline** — no live warehouse connection.  
- **Same taxonomy** as mismatch metrics — no new labels.  
- **Thresholds** must be tuned; default numbers are for development / demos.  
- **Volume changes** — `totalCrystalCases` delta can move shares even when behavior is stable; read counts + shares together.

---

## Suggested cadence

| When | Use |
|------|-----|
| **Weekly** | Monday review of last vs prior week exports. |
| **Post-release** | Week containing deploy vs previous week. |
| **After DB wording batch** | Before/after batch windows. |
| **After routing rule map change** | Compare rule distribution shifts. |

---

## CLI

```bash
node scripts/ops/generateCrystalWeeklyTrendComparison.mjs --previous tests/fixtures/trendComparisonWeekA.json --current tests/fixtures/trendComparisonWeekB.json --format markdown
node scripts/ops/generateCrystalWeeklyTrendComparison.mjs --previous tests/fixtures/trendComparisonWeekA.json --current tests/fixtures/trendComparisonWeekB.json --format json
```

**Arguments:** `--previous` `<file>`, `--current` `<file>`, `--format` `markdown` \| `json`.

---

## Programmatic use

```javascript
import {
  buildCrystalWeeklyTrendComparison,
  renderCrystalWeeklyTrendComparisonMarkdown,
} from "../../src/utils/crystalWeeklyTrendComparison.util.js";

const comparison = buildCrystalWeeklyTrendComparison(currentWeeklySummary, previousWeeklySummary, {
  generatedAt: new Date().toISOString(),
});
const md = renderCrystalWeeklyTrendComparisonMarkdown(comparison);
```

---

## Related

- **`crystal-weekly-quality-review.md`** — Phase 7 weekly artifact  
- **`crystal-weekly-review-input-contract.md`** — row / summary shapes  
- **`crystal-routing-wording-playbook.md`** — triage after drift  
- **`crystal-post-deploy-review.md`**
