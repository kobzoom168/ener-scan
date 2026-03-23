# Persona A/B auto-optimization

Weighted traffic allocation + **session-scoped** persona assignment. Scan logic, payment rules, routing, and payment flow are unchanged; only **which persona variant** a user sees is optimized over time.

## Config (`src/config/env.js`)

| Env | Default | Meaning |
|-----|---------|---------|
| `PERSONA_AB_OPTIMIZE_ENABLED` | `false` | `true` → DB-backed weights + assignments + stat increments + scheduled recompute. |
| `PERSONA_AB_MIN_WEIGHT` | `0.15` | Floor per variant after renormalize (no variant forced to 0). |
| `PERSONA_AB_MIN_SAMPLE_PAYWALL` | `100` | Minimum **raw** `paywall_shown` in the rolling window (all variants) before weights move off defaults. |
| `PERSONA_AB_RECOMPUTE_INTERVAL_MS` | `86400000` | Recompute interval (24h). |
| `PERSONA_AB_USE_BLENDED_SCORE` | `false` | If `true`, blends intent + success (both Bayesian-smoothed). |
| `PERSONA_AB_BLENDED_INTENT_WEIGHT` | `0.3` | When blended: weight on intent rate. |
| `PERSONA_AB_VARIANT_COUNT` | `3` | Number of variants `A`… |
| `PERSONA_AB_STATS_WINDOW_DAYS` | `14` | Calendar days (server **local** date, `getLocalDateKey`) for rolling funnel aggregation. |
| `PERSONA_AB_STATS_WEIGHT_MODE` | `uniform` | `uniform` \| `linear` \| `exp` — recent days weighted higher for score inputs (not for min-sample threshold). |
| `PERSONA_AB_STATS_EXP_LAMBDA` | `0.35` | Growth per day step when `WEIGHT_MODE=exp` (oldest → newest). |
| `PERSONA_AB_BAYES_ALPHA` | `1` | Numerator prior: `(success + α) / (paywall + β)`. |
| `PERSONA_AB_BAYES_BETA` | `1` | Denominator prior (same for intent when blended). |

Default initial weights (3 variants): **A 0.34, B 0.33, C 0.33** (`buildDefaultWeights` in `personaAbOptimize.util.js`).

## Data model

1. **`persona_ab_weights`** — single row `id = 1`, column `weights` (JSON), `updated_at`. (`sql/016_…`)
2. **`persona_ab_assignments`** — composite **`(line_user_id, payment_session_key)`** → `persona_variant` (`sql/018_…`):
   - `payment_session_key` = `payments.id` while user has **awaiting_payment** or **pending_verify** (same lookup as slip flow).
   - **`__idle__`** when there is no such row → user can get a **new** weighted assignment on the next payment session.
3. **`persona_ab_stats`** — lifetime per-variant counters (raw + deduped columns). (`sql/016`, `017`)
4. **`persona_ab_funnel_daily`** — same counters **per calendar day** for rolling recompute. (`sql/018`)

## Assignment (session-level sticky)

- **`getPaymentSessionKeyForPersona(userId)`** (`personaAb.db.js`) → payment UUID or `__idle__`.
- **`getAssignedPersonaVariant(userId)`** (`personaVariant.util.js`):
  - If optimization **off** → **`hashAssignPersonaVariant(userId)`**.
  - If **on** → **`ensurePersonaAssignment(userId, sessionKey, weights)`**:
    - Sticky **within** `(userId, sessionKey)`; **new payment row** ⇒ new `sessionKey` ⇒ new assignment possible.
    - First pick: **`weightedPick(weights, uniformFromHash32(hash(userId + sessionKey)))`** (deterministic per session).
- **`assignPersonaVariant(userId)`** — async alias of `getAssignedPersonaVariant`.

## Rolling window + recency weighting

- Each funnel increment updates **`persona_ab_funnel_daily`** for **today** (local date) as well as lifetime **`persona_ab_stats`**.
- **`fetchPersonaAbStatsForRecompute()`** loads the last **`PERSONA_AB_STATS_WINDOW_DAYS`** days.
- **Min-sample check** uses **unweighted** total raw `paywall_shown` in that window (sum over variants and days). If zero (e.g. before any daily rows), falls back to **lifetime** `persona_ab_stats` totals.
- **Score inputs** per variant: for each day \(d\), weight \(w_d\) from **`buildRollingDayWeightsNormalized`** (`uniform` / `linear` / `exp`).
  - `paywall_raw* = Σ_d paywall_shown_d · w_d`
  - `paywall_deduped* = Σ_d paywall_shown_deduped_d · w_d`
  - `intent_raw* = Σ_d payment_intent_d · w_d`
  - `intent_deduped* = Σ_d payment_intent_deduped_d · w_d`
  - `success_raw* = Σ_d payment_success_d · w_d`
  - Optimization denominator uses **deduped paywall when available**:
    - `paywall_opt* = (paywall_deduped* > 0) ? paywall_deduped* : paywall_raw*`
  - Optional blended intent uses **deduped intent when available**:
    - `intent_opt* = (intent_deduped* > 0) ? intent_deduped* : intent_raw*`

## Recompute (`recomputeWeights`)

- **Bayesian-smoothed rates (optimization math):**
  - `successRate = (success_raw* + α) / (paywall_opt* + β)`
  - If blended mode on: `intentRate = (intent_opt* + α) / (paywall_opt* + β)`
  - Blended score: `score = 0.7 * successRate + 0.3 * intentRate` (equivalent to `(1-b)*success + b*intent` with `b=0.3`, configurable via `PERSONA_AB_BLENDED_INTENT_WEIGHT`).
- If **raw** total paywall in window \< `PERSONA_AB_MIN_SAMPLE_PAYWALL` → **default** weights + floor.
- Else: normalize smoothed scores, apply **`PERSONA_AB_MIN_WEIGHT`**, renormalize (no variant = 0).

## Stats ingestion

`logEvent` → `incrementPersonaAbStatFromEvent` (when optimize on + `personaVariant`):

- Updates **lifetime** `persona_ab_stats` and **today’s** `persona_ab_funnel_daily` row.
- **Raw counters remain unchanged for reporting** (`paywall_shown`, `payment_intent`, `payment_success`, etc.).
- Recompute uses deduped counters **only for optimization math** (with safe fallback to raw when deduped is zero/missing).

## Schedule

`schedulePersonaAbRecompute()` — first run ~2 min after boot, then every **`PERSONA_AB_RECOMPUTE_INTERVAL_MS`**.

## Sample (Bayesian + floor)

With `α=1`, `β=1`, variant B has weighted `paywallShown*=50`, `paymentSuccess=8`:

- Smoothed success rate = `(8+1)/(50+1) ≈ 0.176` (vs raw `0.16`).

After normalize across variants + min floor 0.15, low performers keep exploration traffic.

## Limitations

- **Daily rollup** uses **server local** midnight (`getLocalDateKey`), same as free-scan daily window.
- **Multi-instance** daily increments are per-row upserts; rare races only slightly skew counts.
- **Migrations**: run **`sql/018_persona_ab_session_and_rolling.sql`** after `016`/`017` so assignments and `persona_ab_funnel_daily` exist.
- **Idle key `__idle__`**: one sticky variant per user while not in an active payment row; new **payment session** uses the payment UUID key.

## Files (summary)

| Area | Files |
|------|--------|
| SQL | `sql/016_…`, `sql/017_…`, `sql/018_persona_ab_session_and_rolling.sql` |
| Store | `src/stores/personaAb.db.js`, `src/stores/payments.db.js` (session lookup) |
| Math | `src/utils/personaAbOptimize.util.js` |
| Assignment | `src/utils/personaVariant.util.js` |
| Config | `src/config/env.js` |
