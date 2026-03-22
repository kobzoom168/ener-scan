# LINE Flex — real-device QA (scan output)

**Status:** Algorithm tuning in `flex.display.js` is **paused**. Use this checklist for validation on **real LINE mobile** with **real scans**.

## 1. Environment

```bash
# Bypass Supabase scan cache so results reflect current prompt + formatter + Flex (not old cached text)
set SCAN_CACHE_BYPASS=true
# PowerShell: $env:SCAN_CACHE_BYPASS="true"
```

Also valid: `DISABLE_SCAN_RESULT_CACHE=1`

Restart the app after changing env.

## 2. Sample size

Run **5–10** real scans (varied images / birthdates if possible).

## 3. What to review

| Area | Question |
|------|----------|
| **Readability** | Text fits cards; no confusing truncation; bullets OK |
| **Overview** (`overviewForFlex`) | Still feels like a real “ภาพรวม”, not random fragments |
| **Fit** (`fitReasonForFlex`) | Still personalized / meaningful, not generic |
| **Closing** | Warm and useful (next step / invitation), not cold or salesy |
| **altText** | Short notification preview still makes sense |

## 4. Logs

Server logs **`[FLEX_PARSE]`** include:

- Raw vs `*ForFlex` fields  
- `flexInsightDebug` (scores, rank vs picked order, `laterOutperformsEarlier`)  
- `flexSplitCounts` / `flexSplitHighFragmentCount`  
- `altText`

Use these only to **explain** odd UI; do **not** expand scoring/splitting logic until QA findings are in.

## 5. After QA — changes policy

- **Do not** add more scoring/splitting complexity without new product requirements.
- **Do** fix **obvious** bad cases (e.g. broken copy, wrong default, one-off regex that misfires on real data) with **minimal** patches.

### Findings log (fill in during QA)

| # | Issue | Severity | Fix / note |
|---|--------|----------|------------|
| 1 | | | |
| 2 | | | |

---

## 6. Pass 2 — real device (after display-side polish)

**Frozen (do not change):** scoring / splitting / selection in `flex.display.js`, and Flex **layout** structure in `flex.components.js`.

**Do:** run another **LINE mobile** session with `SCAN_CACHE_BYPASS=true` and verify **only** these three things:

| # | Check | Pass? |
|---|--------|-------|
| 1 | **Main energy metric card** — category + short hint readable; no dense parenthetical block |
| 2 | **Lower-left trait boxes** — `generateScanCopy().traits` (feel / use case / effect) read as plain short Thai |
| 3 | **Reading cards** — `overviewForFlex` / `fitReasonForFlex` after `polishReadingLineForFlex` feel easy to read at a glance |

**If something is still wrong:** capture a **screenshot**, note which of (1)(2)(3), then allow **only** small **display-side** tweaks (e.g. char caps in `flex.display.js`, `compactParenHint`, `formatMainEnergyForCard`, trait `safeWrapText` limits) — **not** selector logic.

### Pass 2 findings

| # | Screenshot / note | Issue (1/2/3) | Tiny fix applied? |
|---|-------------------|-----------------|-------------------|
| 1 | | | |
| 2 | | | |

---

*Last updated: QA pass 2 — verify polish only; logic/layout freeze.*
