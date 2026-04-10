# Policy — sacred_amulet hero vs radar graph (HTML v2)

## Decision

- **`โทนหลัก` (hero `displayLine`)** = **graph peak** — short label from **object** scores for `ord[0]` (same “เด่นสุด” as the radar), not from `flexSurface.mainEnergyShort`.
- **Scan baseline** — `flexSurface.mainEnergyShort` stays on `mainEnergyLabel` and may differ from the measured graph; when it does, a **short** `clarifierLine` explains the scan summary line.
- **Graph summary row 2** — Label **เข้ากับคุณที่สุด**; value = the axis among the object’s top-two scores that best matches the owner profile (`pickAlignKeyAmongTopTwo` in `amuletOrdAlign.util.js`).

## Implementation (source of truth)

| Layer | Source | User-facing |
|--------|--------|-------------|
| Hero headline | `ord[0]` → `AMULET_PEAK_SHORT_THAI` | `displayLine`: `โทนหลัก · {peakShort}` |
| Baseline from flex | `fs.mainEnergyShort` | `mainEnergyLabel` + optional clarifier |
| Bridge | When baseline ≠ graph peak (heuristic) | `clarifierLine`: `สรุปจากสแกน · {mainShort}` |
| Graph summary | `objectP` → `ord`, owner alignment | Row 1: พลังเด่น; row 2: เข้ากับคุณที่สุด |

## Rules

1. **Do** keep hero wording aligned with the radar’s dominant axis (`ord[0]`).
2. **Do** keep clarifiers **short** (dashboard-style), not long prose.
3. **Layout** changes are out of scope for this policy; wording lives in the view model (`amuletHtmlV2.model.js`) and shared metrics (`amuletOrdAlign.util.js`).

## Code

- `src/amulet/amuletOrdAlign.util.js` — `ord`, `alignKey`, owner/object vectors.
- `src/amulet/amuletHtmlV2.model.js` — `mainToneMatchesGraphPeak`, hero + graph summary.
