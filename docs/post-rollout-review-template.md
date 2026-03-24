# Post-rollout review — Summary-first Flex (Day 2 → Day 3 decision)

**Purpose:** Read production logs only; fill this in after the rollout window. **No copy changes here.** Output = decision memo for Day 3 (wording / tuning).

| Field | Value |
|-------|--------|
| Review date | |
| Rollout window / `ROLLOUT_WINDOW_LABEL` | |
| Reviewer | |
| Env snapshot (from deploy / config) | `FLEX_SCAN_SUMMARY_FIRST` = · `FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT` = · |

---

## 1) Rollout configuration (as deployed)

| Metric | Source | Value |
|--------|--------|--------|
| Configured rollout % | `flexScanSummaryFirstRolloutPct` on `SCAN_RESULT_FLEX_ROLLOUT` (constant per deploy) | **%** |
| Master flag | `envFlexScanSummaryFirst` on same event | true / false |

---

## 2) Summary-first selected traffic (effective cohort)

| Metric | How to read logs | Count / % |
|--------|------------------|-----------|
| Total scan Flex sends | Count `SCAN_RESULT_FLEX_ROLLOUT` in window | **N =** |
| Summary-first **selected** | Same event where `flexScanSummaryFirstSelected === true` | **n₁ =** (**% of N =** ) |
| Legacy Flex only | `flexScanSummaryFirstSelected === false` (or `flexPresentationMode === "legacy"`) | **n₀ =** |

*Optional sanity:* Expected rough share of selected ≈ `FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT` of traffic **when master is true** (stable bucket; small samples drift).

---

## 3) Report opens & open rate

| Metric | How to read logs | Value |
|--------|------------------|--------|
| Successful opens | `REPORT_PAGE_OPEN` with `outcome === "ok"` and `httpStatus === 200` | **opens =** |
| Failed / not found | `REPORT_PAGE_OPEN` with other `outcome` or `httpStatus` | **fails =** |
| Denominator (denominator choice) | e.g. `REPORT_PUBLIC_OK` with `hasReportLink`, or team-defined “scans with link” | **base =** |
| **Open rate** | opens / base | **%** |

*Notes:* Align numerator/denominator with product definition; document if base = only cohort with `flexScanSummaryFirstSelected` or all users.

---

## 4) `hasObjectImage` vs no-image

Use `SCAN_RESULT_FLEX_ROLLOUT` and/or `REPORT_PAGE_OPEN` (both carry `hasObjectImage`).

| Segment | Count | Share of opens (optional) |
|---------|-------|---------------------------|
| `hasObjectImage === true` | | |
| `hasObjectImage === false` | | |

*Insight line:* Does open rate differ by segment? (qualitative / rough %)

---

## 5) `FLEX_SUMMARY_FIRST_FAIL` & build fallback

| Metric | Source | Count |
|--------|--------|--------|
| Summary-first **build** failed | `FLEX_SUMMARY_FIRST_FAIL` | **F =** |
| Flex used legacy after failed build | `SCAN_RESULT_FLEX_ROLLOUT` with `flexPresentationMode === "summary_first_fallback_legacy"` and `summaryFirstBuildFailed === true` | **B =** |

*Healthy:* F and B should be **low** vs `flexScanSummaryFirstSelected` volume. If high → investigate errors before Day 3 copy work.

---

## 6) Timezone verification (LINE / HTML / admin)

| Check | Status (pass / fail / n/a) | Evidence |
|-------|---------------------------|----------|
| `REPORT_RENDER_TIMEZONE_OK` present on HTML render | | `timeZone` = `Asia/Bangkok`, `generatedAtBangkok` |
| Same scan: LINE-displayed time vs HTML hero date | | Screenshot or note |
| Admin dashboard datetime vs Bangkok | | Same row / payment / scan |

**Overall timezone status:** **PASS / FAIL / PARTIAL**

**If FAIL:** Stop increasing rollout until fixed (presentation/env only).

---

## 7) Recommendation (Day 3)

Choose **one** primary action:

| Option | When to use |
|--------|-------------|
| **Keep** | Metrics stable; F/B low; open rate acceptable; timezone PASS |
| **Increase** | No red flags; want more data — raise `FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT` in small steps |
| **Rollback** | F/B high; open rate collapse; timezone FAIL; or product/UX red flags |

**Decision:** **Keep / Increase / Rollback**

**If Increase:** proposed next `FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT` = **___%** (and date)

**If Rollback:** `FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT=0` and/or `FLEX_SCAN_SUMMARY_FIRST=false` — **no scan logic change**

---

## 8) Day 3 — follow-ups (wording only; no scope creep)

- [ ] Only if **Keep** or **Increase:** plan QA + copy tuning (hero, distillation, Flex headline, etc.) per Day 3 roadmap
- [ ] If **Rollback:** root-cause note (logs, errors) before any copy experiment

---

## Log event quick reference (current implementation)

| Event | Key fields for this review |
|-------|----------------------------|
| `SCAN_RESULT_FLEX_ROLLOUT` | `flexScanSummaryFirstRolloutPct`, `flexScanSummaryFirstSelected`, `flexRolloutBucket0to99`, `flexPresentationMode`, `summaryFirstBuildFailed`, `hasObjectImage`, `hasReportLink` |
| `REPORT_PAGE_OPEN` | `outcome`, `httpStatus`, `hasObjectImage`, `tokenPrefix` |
| `REPORT_RENDER_TIMEZONE_OK` | `timeZone`, `generatedAtBangkok`, `generatedAtRaw`, `schemaVersion` |
| `FLEX_SUMMARY_FIRST_FAIL` | `message`, `lineUserIdPrefix`, `flexScanSummaryFirstRolloutPct`, `flexRolloutBucket0to99` |
