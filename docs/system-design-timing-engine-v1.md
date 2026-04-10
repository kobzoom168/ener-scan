# System Design — Timing Engine v1 / v1.1

## Purpose

Timing Engine v1 is a **deterministic truth service** that computes coarse “good windows” for ritual / focus use from **birth date + lane + primary (and optional secondary) power**. It is **not** a wording helper, LLM surface, or template calculation.

Outputs are **structured**, **versioned** (`timing_v1_1` as of v1.1; `timing_v1` remains accepted for older stored payloads), and intended to be **persisted on `ReportPayload.timingV1`** once at payload build time. HTML / Flex / APIs **render only**; they must not re-derive scores.

## Placement in pipeline

```txt
scan → build report payload core
  ├─ compatibility
  ├─ object energy
  ├─ timing engine (v1)   ← computeTimingV1
→ ReportPayload
→ HTML / Flex / public API
```

## Module layout

| Path | Role |
|------|------|
| `src/services/timing/timingEngine.service.js` | `computeTimingV1(request)` |
| `src/services/timing/timingCalibration.util.js` | v1.1 bounded post-score calibration helpers |
| `src/services/timing/timingEngine.copy.th.js` | Thai strings for derived `reasonText` + `practicalHint` (ASCII `\u` source) |
| `src/services/timing/timingEngine.types.js` | JSDoc contracts |
| `src/config/timing/timingEngine.config.js` | Formula version + weight vector + standard `reasonCode` list |
| `src/config/timing/timingWindows.config.js` | Hour window defs + owner anchors |
| `src/config/timing/timingRitualMode.config.js` | Lane × axis → ritual mode (Thai) |
| `src/config/timing/timingWeekdayAffinity.config.js` | Weekday affinity by lane + primary |
| `src/config/timing/timingLaneRules.sacredAmulet.js` | Sacred amulet hour / date-root tables |
| `src/config/timing/timingLaneRules.moldavite.js` | Moldavite baseline tables (Phase 2 tuning) |

## Inputs / outputs

See `timingEngine.types.js`. Core fields:

- **In:** `birthdateIso`, `lane`, `primaryKey`, optional `secondaryKey`, `compatibilityScore`, `ownerFitScore`, etc.
- **Out:** `bestHours`, `bestWeekdays`, `bestDateRoots`, `avoidHours`, `ritualMode`, `confidence`, `ownerProfile`, `summary` (labels + concise `practicalHint`), optional `debug` (v1.1 introspection only).

## Formula (v1)

Weighted combination (config in `timingEngine.config.js`):

- Owner root affinity vs window anchor (uses existing numerology-style roots from `compatibilityFormula.util.js`: life path, birth-day root).
- Lane power affinity from config tables (hour + date-root; weekday table for weekday slots).
- Weekday / birth-weekday synergy for hour windows.
- Small boosts from compatibility and owner-fit scores (capped so they do not override core signals).

### v1.1 tuning layer

After the core weighted score, each slot receives a **calibration stack** (`timingCalibration.util.js`): compatibility, owner-fit, and primary-axis strength nudges with a **hard per-slot total cap** (`TIMING_CALIBRATION_TOTAL_CAP`, default 8). This improves believability without replacing the core formula.

**Reason codes** are locked to the set in `TIMING_REASON_CODES` (`timingEngine.config.js`). Every slot exposes `reasonCode` + `reasonText`; text is **always** derived from code + context via `timingEngine.copy.th.js` (no freeform reasoning in the engine).

**Stability:** scoring keys on `birthdateIso`, `lane`, `primaryKey`, `secondaryKey`, rounded compat/fit, and owner profile signals. `scannedAtIso` is **not** used in math (bounded/coarse use reserved for future). Responses include `debug.timingFingerprint` + `debug.timingStableKey` for logs and regression checks.

**Lane voice:** `buildPracticalHintTh` produces **sacred_amulet** copy (หมุดพลัง / พลังมุม) vs **moldavite** copy (โฟกัส / ชีวิตประจำวัน); moldavite hour + date-root tables are tuned to diverge from sacred curves.

## Known gaps / v1.1 tuning

- Reason codes are locked; map future wording layers from `reasonCode`, not `reasonText`.
- Calibration layer added; total delta capped per slot.
- Lane divergence tests: sacred protection vs luck, moldavite work vs relationship, sacred vs moldavite same birthdate; fixture grid under `tests/services/timing/fixtures/`.
- Stability anchor: fingerprint + stable key; `scannedAtIso` jitter does not swing output.

## Guardrails

- Deterministic only; same inputs → same output.
- No randomness; no LLM-generated timing facts.
- Templates must not implement timing math; only display `timingV1` / view-model fields derived from payload.

## Rollout

- **Phase 1 (current):** `sacred_amulet` wired in `reportPayload.builder.js`; HTML section “จังหวะที่เหมาะกับการอธิษฐาน” in `amuletReportV2.template.js`.
- **Phase 2:** Flex snippet (timing stays HTML-first for sacred_amulet teaser balance).
- **Phase 3:** Richer per-lane copy; optional internal HTTP API if ownership / load requires it.

## Tests

- `tests/services/timing/timingEngine.service.test.js` — stability, `scannedAtIso` jitter, lane divergence, invalid birthdate, moldavite pack, fixture grid.
- `tests/services/timing/fixtures/*.fixture.js` — reusable inputs for tuning and snapshots.
- Amulet HTML tests assert timing block presence when `timingV1` is present on payload.
