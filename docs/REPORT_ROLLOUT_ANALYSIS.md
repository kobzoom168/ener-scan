# Report / Flex rollout — log analysis & decisions (Phase 2.5)

**Purpose:** interpret **existing** telemetry for staging vs production comparisons. No new product features.

**Primary events:** `SCAN_RESULT_FLEX_ROLLOUT`, `REPORT_PUBLIC_OK`, `REPORT_PAGE_OPEN`, `SCAN_RESULT_TEXT_FALLBACK`, `FLEX_SUMMARY_FIRST_FAIL`, `PERSONA_ANALYTICS` (`preview_shown` on free scans).

**Schema:** rollout events use `schemaVersion: 3` (see `REPORT_ROLLOUT_SCHEMA_VERSION`). **v3** adds **`nodeEnv`** and optional **`rolloutWindowLabel`** for staging/prod separation and labeled comparison windows (`ROLLOUT_WINDOW_LABEL`). Older lines may lack v2/v3 fields.

**Execution runbook:** **`docs/REPORT_ROLLOUT_RUNBOOK.md`** (Phase 2.6).

**Privacy:** logs use **token/user prefixes only** — do not join on full tokens in shared dashboards.

---

## A. Query / grep checklist

Assume JSON lines on stdout or in your log store. Examples use **ripgrep**; adapt to CloudWatch Insights / Loki / BigQuery.

### 1. Legacy vs summary-first (actual UI cohort)

Use **`SCAN_RESULT_FLEX_ROLLOUT`** — each line is self-describing thanks to **`envFlexScanSummaryFirst`** (v2+).

| Question | Filter / field |
|----------|----------------|
| Runs under **legacy config** (flag off) | `envFlexScanSummaryFirst == false` → expect `flexPresentationMode == "legacy"` |
| Runs under **summary-first config** (flag on) | `envFlexScanSummaryFirst == true` |
| **Delivered** summary-first UI | `flexPresentationMode` in `summary_first_footer`, `summary_first_append` |
| **Delivered** legacy carousel despite flag on | `flexPresentationMode == "summary_first_fallback_legacy"` (check `FLEX_SUMMARY_FIRST_FAIL` + `summaryFirstBuildFailed: true`) |
| **Strict** A/B: same deploy, different flag | Partition by `envFlexScanSummaryFirst` then compare counts |

**Grep-style examples (illustrative):**

```text
# Volume: summary-first config, successful summary UI (not fallback)
SCAN_RESULT_FLEX_ROLLOUT.*"envFlexScanSummaryFirst":true
  then exclude flexPresentationMode summary_first_fallback_legacy

# Strict legacy (flag explicitly off)
SCAN_RESULT_FLEX_ROLLOUT.*"envFlexScanSummaryFirst":false
```

**Ambiguity resolved (v2):** Without env snapshot, `flexPresentationMode == "legacy"` could be “flag off” OR “unreachable if flag always on” — now cross-check **`envFlexScanSummaryFirst`**.

---

### 2. `footer_uri` vs `carousel_bubble` (report link placement)

Use **`reportLinkPlacement`** on `SCAN_RESULT_FLEX_ROLLOUT` (only meaningful when `hasReportLink: true`).

| Placement | Typical `flexPresentationMode` |
|-----------|-------------------------------|
| `footer_uri` | `summary_first_footer` |
| `carousel_bubble` | `legacy`, `summary_first_append`, `summary_first_fallback_legacy` (with link) |
| `none` | `hasReportLink: false` (report row failed or no URL) |

**Compare cohorts:**

```text
SCAN_RESULT_FLEX_ROLLOUT.*"hasReportLink":true.*"reportLinkPlacement":"footer_uri"
SCAN_RESULT_FLEX_ROLLOUT.*"hasReportLink":true.*"reportLinkPlacement":"carousel_bubble"
```

Also filter **`envFlexSummaryAppendReportBubble`** when diagnosing “why carousel”: `true` forces second bubble when summary-first is on.

---

### 3. Image present vs image-missing

| Signal | Event | Field |
|--------|--------|--------|
| Stored payload had image URL at **Flex send** | `SCAN_RESULT_FLEX_ROLLOUT` | `hasObjectImage` |
| Stored payload had image when **report persisted** | `REPORT_PUBLIC_OK` | `hasObjectImage` |
| **Rendered** page had image URL in payload | `REPORT_PAGE_OPEN` (`outcome: ok`) | `hasObjectImage` |

**Staging vs prod:** compare rates **per environment** over the same time window (do not expect token-level joins).

**Sanity check:** `REPORT_PUBLIC_OK.hasObjectImage` ≈ `SCAN_RESULT_FLEX_ROLLOUT.hasObjectImage` for scans with `REPORT_PUBLIC_OK` (same request path). Mismatch may indicate timing or missing `reportPayload` in Flex path.

---

### 4. Funnel rough rates (no join key)

| Ratio idea | Numerator | Denominator |
|------------|-----------|-------------|
| Report created | count `REPORT_PUBLIC_OK` | count `SCAN_RESULT_FLEX_ROLLOUT` (same window/env) |
| Page opened (ok) | count `REPORT_PAGE_OPEN` with `httpStatus: 200` | count `REPORT_PUBLIC_OK` |
| 404 probes / bad tokens | `REPORT_PAGE_OPEN` `httpStatus: 404` | — |

**Blind spot:** numerator/denominator are **not** paired per user — use **ratios over buckets** (hourly/daily).

---

## B. Schema notes (v2 / v3)

| Addition | Why |
|----------|-----|
| v2: `envFlexScanSummaryFirst`, `envFlexSummaryAppendReportBubble` on rollout + text fallback | Know deploy config from the line alone |
| v2: `httpStatus` on `REPORT_PAGE_OPEN` | Clear 200 vs 404 alongside `outcome` |
| v3: `nodeEnv`, `rolloutWindowLabel` on rollout, page open, `REPORT_PUBLIC_*` | Separate staging/prod in merged logs; tag rollout waves (see runbook) |

---

## C. Rollout decision checklist

### When to **keep legacy** (default `FLEX_SCAN_SUMMARY_FIRST=false`)

- `summary_first_fallback_legacy` or `SCAN_RESULT_TEXT_FALLBACK` rate **above** agreed threshold vs baseline.
- LINE delivery errors / user complaints spike **only** on summary-first cohorts.
- You **cannot** yet compare fairly (staging traffic too low, env drift between stages).

### When to **switch default to summary-first** (`FLEX_SCAN_SUMMARY_FIRST=true`)

- `SCAN_RESULT_FLEX_ROLLOUT` shows stable **`flexPresentationMode`** in `summary_first_footer` or `summary_first_append` with **low** `summary_first_fallback_legacy` and **low** `SCAN_RESULT_TEXT_FALLBACK`.
- **`REPORT_PAGE_OPEN` ok-rate** (vs `REPORT_PUBLIC_OK`) not worse than legacy (within noise).
- Product OK with **detail-on-web-only** (summary-first drops long Flex bodies).

### When to **disable append bubble** (`FLEX_SUMMARY_APPEND_REPORT_BUBBLE=false`)

- You want **fewer swipes** and a single primary card + footer CTA; A/B shows **no worse** open rate.
- `reportLinkPlacement: carousel_bubble` cohort underperforms **`footer_uri`** on your proxy metrics.
- Ops wants **simpler** carousel (1 scan bubble + settings) for support.

### When to **enable append bubble** (`true`)

- Users miss the footer button; **second card** improves qualitative “found the report” feedback.
- A/B shows better **`REPORT_PAGE_OPEN`** / qualitative outcomes for `carousel_bubble` placement.

---

## D. Known blind spots

| Gap | Mitigation |
|-----|------------|
| **No LINE button-click** in server logs | Use `REPORT_PAGE_OPEN` as proxy for “opened report”; accept noise from bots/previews |
| **No per-session correlation id** | Compare **aggregate** rates by time bucket and env |
| **`preview_shown` includes `userId`** | Persona A/B only; treat as sensitive data in stores |
| **Cache / repeat opens** | `REPORT_PAGE_OPEN` counts **requests**, not unique users |
| **`hasObjectImage` at Flex time** vs **page open** | CDN/browser cache, payload edits, or failed image load on client not distinguished |
| **Free vs paid** | `scanAccessSource` on `SCAN_RESULT_FLEX_ROLLOUT`; `preview_shown` is **free-only** |

---

## Related

- **`docs/REPORT_OPS.md`** — env flags, bucket ops, Phase 2.4 event table (updated for v2 cross-reference).
