# Policy — sacred_amulet hero vs radar graph (HTML v2)

## Decision

- **`โทนหลัก` (hero)** = **baseline identity** for the piece — truth from `amuletV1.flexSurface.mainEnergyShort` (and related summary-first wiring). It is **not** the graph’s top axis.
- **Graph peak** = **current dominant activation** on the object — from **object** six-dimension scores only (`ord[0]`, `ord[1]`, … after `sortPowerKeysByObjectDesc` in `buildAmuletHtmlV2ViewModel`).
- These two **may differ by design**. Do not merge them into one meaning in the hero.

## Implementation (source of truth)

| Layer | Source | User-facing |
|--------|--------|-------------|
| Baseline tone | `fs.mainEnergyShort` | `displayLine`: `โทนหลัก · {mainShort}` |
| Graph ordering | `objectP` scores → `ord` | Radar labels, graph summary rows, interaction copy tied to `ord` |
| Bridge | Only when baseline label ≠ graph peak axis (heuristic) | `clarifierLine`: `ภาพรวม {mainShort} · เด่นสุด {peakShort}` |

## Rules

1. **Do not** set hero / `displayLine` from `ord[0]` directly.
2. **Do not** require `โทนหลัก` to equal the graph top axis.
3. **Do** keep clarifiers **short** (dashboard-style), not long descriptive sentences.
4. **Layout** changes are out of scope for this policy; wording lives in the view model (`amuletHtmlV2.model.js`).

## Code

- `src/amulet/amuletHtmlV2.model.js` — policy comment block + `mainToneMatchesGraphPeak` + hero fields.
