# System Design — Timing Engine v1

## Purpose

Timing Engine v1 is a **deterministic truth service** that computes coarse “good windows” for ritual / focus use from **birth date + lane + primary (and optional secondary) power**. It is **not** a wording helper, LLM surface, or template calculation.

Outputs are **structured**, **versioned** (`timing_v1`), and intended to be **persisted on `ReportPayload.timingV1`** once at payload build time. HTML / Flex / APIs **render only**; they must not re-derive scores.

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
| `src/services/timing/timingEngine.types.js` | JSDoc contracts |
| `src/config/timing/timingEngine.config.js` | Formula version + weight vector |
| `src/config/timing/timingWindows.config.js` | Hour window defs + owner anchors |
| `src/config/timing/timingRitualMode.config.js` | Lane × axis → ritual mode (Thai) |
| `src/config/timing/timingWeekdayAffinity.config.js` | Weekday affinity by lane + primary |
| `src/config/timing/timingLaneRules.sacredAmulet.js` | Sacred amulet hour / date-root tables |
| `src/config/timing/timingLaneRules.moldavite.js` | Moldavite baseline tables (Phase 2 tuning) |

## Inputs / outputs

See `timingEngine.types.js`. Core fields:

- **In:** `birthdateIso`, `lane`, `primaryKey`, optional `secondaryKey`, `compatibilityScore`, `ownerFitScore`, etc.
- **Out:** `bestHours`, `bestWeekdays`, `bestDateRoots`, `avoidHours`, `ritualMode`, `confidence`, `ownerProfile`, `summary` (labels + concise `practicalHint`).

## Formula (v1)

Weighted combination (config in `timingEngine.config.js`):

- Owner root affinity vs window anchor (uses existing numerology-style roots from `compatibilityFormula.util.js`: life path, birth-day root).
- Lane power affinity from config tables (hour + date-root; weekday table for weekday slots).
- Weekday / birth-weekday synergy for hour windows.
- Small boosts from compatibility and owner-fit scores (capped so they do not override core signals).

## Guardrails

- Deterministic only; same inputs → same output.
- No randomness; no LLM-generated timing facts.
- Templates must not implement timing math; only display `timingV1` / view-model fields derived from payload.

## Rollout

- **Phase 1 (current):** `sacred_amulet` wired in `reportPayload.builder.js`; HTML section “จังหวะที่เหมาะกับการอธิษฐาน” in `amuletReportV2.template.js`.
- **Phase 2:** Flex snippet; tune moldavite tables.
- **Phase 3:** Richer per-lane copy; optional internal HTTP API if ownership / load requires it.

## Tests

- `tests/services/timing/timingEngine.service.test.js` — stability, lane divergence, invalid birthdate, moldavite pack.
- Amulet HTML tests assert timing block presence when `timingV1` is present on payload.
