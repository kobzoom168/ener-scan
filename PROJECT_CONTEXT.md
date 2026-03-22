# Ener Scan Project Context

## Stack
- Node.js
- Express
- LINE OA
- Supabase

## Architecture
- routes -> handlers -> services -> stores

## Main Flow
1. user sends image
2. runtime guard (burst / multi-image)
3. validate image
4. save pending image in session
5. ask birthdate
6. validate birthdate
7. run scan
8. save history
9. reply via LINE flex

## Core Files
- src/app.js
- src/routes/lineWebhook.js
- src/handlers/scanFlow.handler.js
- src/services/*
- src/stores/*

## Runtime Concepts
- flowVersion
- scanJobId
- image burst window
- waiting_birthdate state

## Constraints
- 1 image per case
- duplicate protection
- multi-image protection

## Deep scan (OpenAI)
- Layer 1: `gpt-4.1-mini` → draft (fixed format) — `src/services/openaiDeepScan.api.js` + `src/prompts/deepScan.prompt.js`
- Layer 2 (optional): `gpt-4o` rewrite — `ENABLE_DEEP_SCAN_REWRITE=true` in env; orchestration `src/services/deepScan.service.js`
- Layer 3 (optional): `gpt-4o-mini` quality score — `ENABLE_DEEP_SCAN_SCORING=true`; prompts `src/prompts/deepScanScore.prompt.js`; service `src/services/deepScanQuality.service.js`
- Layer 4 (optional, max 1 round): `gpt-4o` improve when score is in band `(DEEP_SCAN_IMPROVE_FLOOR_SCORE, DEEP_SCAN_MIN_QUALITY_SCORE)` and below `DEEP_SCAN_HIGH_QUALITY_SCORE` (defaults: floor 15 / min 35 / high 44) — `ENABLE_DEEP_SCAN_AUTO_IMPROVE=true`
- After improve: **re-score** with `gpt-4o-mini`; if `total_score` ไม่สูงกว่าเดิม (หรือ rescore ไม่น่าเชื่อถือ) → คงข้อความก่อน improve — logs: `[DEEP_SCAN_IMPROVE_NO_GAIN]`, `[DEEP_SCAN_IMPROVE_APPLIED]` (มี `delta`)
- Format + polished check: `src/services/deepScanFormat.service.js` (improve must pass or fallback)
- Cache key version: `SCAN_CACHE_PROMPT_VERSION` in `src/stores/scanResultCache.db.js` (bump when prompt/pipeline changes)

## Quality analytics (data capture → future prompt evolution)
- Each successful scan can persist **`scan_results.quality_analytics`** (JSONB): `score_before`, `score_after`, `delta`, `improve_attempted`, `improve_applied`, `improve_skipped_reason`, `latency_ms`, **`quality_tier`** (`getQualityTier(score_after)`), **`signals`** (`extractSignals` on user-facing text), **`improve_gain_ratio`** (`delta / score_before` when valid), `version` (≥2 after enrich). Helpers: `src/services/deepScanQualityAnalytics.service.js` — `getQualityTier`, `extractSignals`, `computeImproveGainRatio`, `enrichQualityAnalyticsForPersist` (called in `runDeepScan` after `formatScanOutput`).
- Pipeline returns `{ text, qualityAnalytics }` from `runDeepScanPipeline`; `runDeepScan` enriches + passes to webhook → `createScanResult`. Cache hits store `improve_skipped_reason: "from_cache"` plus signals/tier from formatted text.
- **Note:** scores are from the **deep-scan pipeline**; tier/ratio use `score_after` / `score_before` from that layer; **signals** use final LINE text (after format).
- SQL: `sql/012_scan_results_quality_analytics.sql` (column); sample aggregates: `sql/013_quality_analytics_sample_queries.sql`.
- **Top performers:** `src/stores/scanQualityInsights.db.js` — `listTopPerformingScanResults` (default `minScoreAfter: 45`), optional `qualityTier`, `requireDeltaPositive`, `improveApplied`; `fetchRecentScanResultsWithQuality` for tier-level aggregates.
- **Style learning (offline):** `src/services/scanStyleAnalysis.service.js` — pattern summary + `buildStyleReferencePackDocument`; CLI `npm run analyze:style` → `data/style-reference-pack.json` (does not change scan flow).
- **Style references in rewrite (optional):** `src/services/deepScanStyleReference.service.js` loads `data/style-reference-pack.json` (or `DEEP_SCAN_STYLE_REFERENCE_PATH`), appends a compact Thai block to **rewrite** only. **Mode:** `DEEP_SCAN_STYLE_REFERENCE_MODE=off|on|sample` (if unset, legacy `ENABLE_DEEP_SCAN_STYLE_REFERENCES=true` → `on`). **Sample:** `DEEP_SCAN_STYLE_REFERENCE_SAMPLE_PCT` (default 10) when `MODE=sample`. Persisted on `quality_analytics`: `style_reference_mode`, `style_reference_enabled`, `style_reference_sample_selected`, `style_reference_used`, `style_reference_fragment_count`, `style_reference_source`, `rewrite_with_style`. Logs: `[DEEP_SCAN_STYLE_REFERENCE_USED]`, `[DEEP_SCAN_STYLE_REFERENCE_COUNT]`, `[DEEP_SCAN_STYLE_REFERENCE_SOURCE]` (when mode ≠ off). A/B SQL: `sql/014_quality_analytics_style_ab_compare.sql`.
- **Effectiveness report (rollout):** `npm run report:style-effectiveness` — `src/analysis/styleReferenceEffectiveness.report.js` compares `style_reference_used` true vs false, metrics by `style_reference_mode`, outputs `expand` | `keep_sampling` | `disable` (env `MIN_COHORT_N`, `SCORE_EDGE`, `--limit=`).