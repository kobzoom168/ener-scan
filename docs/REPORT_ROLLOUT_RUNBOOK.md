# Report / Flex rollout — execution runbook (Phase 2.6)

**Scope:** staging/prod rollout **process** only. No product feature changes. Telemetry schema **v3** adds `nodeEnv` and optional `rolloutWindowLabel` on key events (see `getRolloutExecutionContext()` in `reportRolloutTelemetry.util.js`).

**Related docs:** `REPORT_ROLLOUT_ANALYSIS.md` (cohorts & grep), `REPORT_OPS.md` (flags, bucket, schema table).

---

## Optional env: comparison windows

| Variable | Purpose |
|----------|---------|
| `ROLLOUT_WINDOW_LABEL` or `REPORT_ROLLOUT_WINDOW_LABEL` | Short tag (≤64 chars) attached to rollout logs — e.g. `stg-2025-03-20-A`, `prod-wave1`. **Unset** = `rolloutWindowLabel: null` in JSON. |
| `NODE_ENV` | Logged as `nodeEnv` (`unknown` if empty). Use `production` / `development` as usual. |

**Do not** put secrets, full URLs, or user data in `ROLLOUT_WINDOW_LABEL`.

---

## A. Staging rollout (checklist)

1. **Confirm target flags** on the staging service: `FLEX_SCAN_SUMMARY_FIRST`, `FLEX_SUMMARY_APPEND_REPORT_BUBBLE` (see `env.js` / `REPORT_OPS.md`).
2. **Set** `ROLLOUT_WINDOW_LABEL=stg-<date>-<label>` (optional but recommended for log slicing).
3. **Deploy**; wait for health / webhook receiving traffic.
4. **Smoke test:** one free scan → expect `SCAN_RESULT_FLEX_ROLLOUT` with expected `flexPresentationMode` and `envFlexScanSummaryFirst` matching flags.
5. **Open report** from LINE → expect `REPORT_PAGE_OPEN` with `httpStatus: 200`, `nodeEnv` matching staging.
6. **Review logs** (§B below) for 15–30 minutes of traffic.
7. **Rollback rehearsal:** flip `FLEX_SCAN_SUMMARY_FIRST=false`, redeploy or restart, repeat smoke test (§D).

---

## B. Production rollout (checklist)

1. **Staging sign-off** complete; analysis doc updated with baseline rates.
2. **Maintenance window** (if your org requires): announce, monitor error budget.
3. **Set** `ROLLOUT_WINDOW_LABEL=prod-<date>-wave1` (or similar); keep until review done.
4. **Deploy prod** with agreed flag values; confirm `nodeEnv` is `production` in sample lines.
5. **Monitor** for 1–24h:
   - `SCAN_RESULT_TEXT_FALLBACK` rate
   - `flexPresentationMode: summary_first_fallback_legacy` + `FLEX_SUMMARY_FIRST_FAIL`
   - `REPORT_PUBLIC_FAIL` vs `REPORT_PUBLIC_OK`
6. **Post-rollout review** (§E) within 48h; clear or rotate `ROLLOUT_WINDOW_LABEL` for the next experiment.

---

## C. Log filters, grep examples, time-bucket steps

**Principle:** partition by **`nodeEnv`** and **`rolloutWindowLabel`**, then by cohort fields.

### Grep (stdout / downloaded logs)

```text
# All flex deliveries in production for a labeled window
SCAN_RESULT_FLEX_ROLLOUT.*"nodeEnv":"production".*"rolloutWindowLabel":"prod-2025-03-20-wave1"

# Summary-first config actually on
SCAN_RESULT_FLEX_ROLLOUT.*"envFlexScanSummaryFirst":true

# Fallback rate signal (flag on but legacy carousel delivered)
SCAN_RESULT_FLEX_ROLLOUT.*"flexPresentationMode":"summary_first_fallback_legacy"

# Flex completely failed → text reply
SCAN_RESULT_TEXT_FALLBACK

# Report persistence
REPORT_PUBLIC_OK
REPORT_PUBLIC_FAIL

# Page views (200 vs 404)
REPORT_PAGE_OPEN.*"httpStatus":200
REPORT_PAGE_OPEN.*"httpStatus":404
```

### Time-bucket review (manual)

1. Choose **UTC window** (e.g. deploy time ± 2h).
2. **Count** `SCAN_RESULT_FLEX_ROLLOUT` per bucket: `flexPresentationMode` × `reportLinkPlacement` × `hasObjectImage`.
3. **Count** `REPORT_PUBLIC_OK` in same window (same `nodeEnv` / label).
4. **Count** `REPORT_PAGE_OPEN` `httpStatus: 200` vs `404`.
5. **Ratio checks** (approximate): `REPORT_PAGE_OPEN ok` / `REPORT_PUBLIC_OK`, `TEXT_FALLBACK` / `SCAN_RESULT_FLEX_ROLLOUT`.
6. **Compare** to previous window **with same `nodeEnv`** (ignore mixed staging/prod in one file).

---

## D. Rollback checklist

### Roll back **summary-first** → **legacy Flex**

1. Set **`FLEX_SCAN_SUMMARY_FIRST=false`** (and optionally `FLEX_SUMMARY_APPEND_REPORT_BUBBLE=false`).
2. **Redeploy** or **restart** all app instances (env is read at process start).
3. Smoke test: `SCAN_RESULT_FLEX_ROLLOUT` should show `flexPresentationMode: legacy`, `envFlexScanSummaryFirst: false`.
4. Set **`ROLLOUT_WINDOW_LABEL`** to a new value e.g. `prod-rollback-<date>` for clean log slicing.
5. Confirm **`FLEX_SUMMARY_FIRST_FAIL`** stops for new traffic (legacy path should not build summary-first JSON).

### Roll back **append bubble** only

1. Set **`FLEX_SUMMARY_APPEND_REPORT_BUBBLE=false`**; keep `FLEX_SCAN_SUMMARY_FIRST=true` if desired.
2. Expect `flexPresentationMode: summary_first_footer`, `reportLinkPlacement: footer_uri` when link exists.

### If **Flex send** is broken (emergency)

- Users may receive **text fallback** (`SCAN_RESULT_TEXT_FALLBACK`). Fix forward or rollback flags; no separate “text mode” flag — investigate LINE API / payload size / flex errors in app logs.

---

## E. Rollout decision snapshot

Copy-paste for Slack, tickets, or PR notes. Substantiate **Observed** answers with log counts from **§B–C** (`nodeEnv` / `rolloutWindowLabel` filters).

### Rollout Decision Snapshot

Window: [ ]  
Env: [ ]  
Flags:

- FLEX_SCAN_SUMMARY_FIRST=[ ]
- FLEX_SUMMARY_APPEND_REPORT_BUBBLE=[ ]

Observed:

- Flex stable? [yes/no]
- Report persist stable? [yes/no]
- Report open proxy acceptable? [yes/no]
- Image-present better than image-missing? [yes/no/unclear]
- Fallbacks acceptable? [yes/no]

Decision:

- [keep legacy / continue / switch default / rollback]

Why:

- [1]
- [2]
- [3]

Next:

- [ ]
- [ ]

**Owner / date:** [ ]

### Optional: evidence table (same window)

| Metric | Count / rate | Notes |
|--------|----------------|-------|
| `SCAN_RESULT_FLEX_ROLLOUT` total | | |
| `legacy` / `summary_first_footer` / `summary_first_append` / `summary_first_fallback_legacy` | | |
| `SCAN_RESULT_TEXT_FALLBACK` | | |
| `FLEX_SUMMARY_FIRST_FAIL` | | |
| `REPORT_PUBLIC_OK` vs `REPORT_PUBLIC_FAIL` | | |
| `REPORT_PAGE_OPEN` 200 vs 404 | | |
| `hasObjectImage` true % | | |
| `reportLinkPlacement` (where `hasReportLink`) | | |

---

## F. Known remaining blind spots

- **No automated dashboard** — grep / log platform queries only unless you build one.
- **`rolloutWindowLabel`** is **manual** — forgotten label ⇒ compare by `ts` + deploy time only.
- **Mixed replicas** during rolling deploy may show **two flag regimes** briefly — use short windows or wait for rollout complete.
- **LINE / CDN** behavior not visible in these logs beyond success/fallback.
- See also **`REPORT_ROLLOUT_ANALYSIS.md` §D** (bots, no click telemetry, no join key).
