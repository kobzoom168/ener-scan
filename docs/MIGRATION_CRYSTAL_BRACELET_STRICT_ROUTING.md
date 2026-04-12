# Crystal bracelet strict routing (migration note)

## What changed

- **Strict bracelet lane proof** runs after the global object gate passes (`single_supported`) and before the scan report is built.
- Two additional **structured OpenAI vision passes** (same model family as object check: `gpt-4.1-mini` via `openai.responses`) classify:
  - **Crystal vs sacred-amulet family** (`runStrictCrystalFamilyCheck`)
  - **Bracelet form vs other** (`runStrictBraceletFormCheck`)
- **`shapeFamily: "bracelet"`** is applied to the report pipeline only when `checkCrystalBraceletEligibility` returns `eligible: true`. Permissive gate **`shapeHint`** is not used to force bracelet routing.
- If the pipeline previously carried **`shapeFamily: "bracelet"`** without proof, it is **cleared** (undefined) so `crystalBraceletV1` is not attached by guess.

## New environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CRYSTAL_BRACELET_ENABLE_STRICT_PASS` | `true` (set to `false` to disable) | Run strict family/form passes; when disabled, bracelet is never proven via this path. |
| `CRYSTAL_BRACELET_FAMILY_MIN_CONFIDENCE` | `0.8` | Minimum `familyConfidence` for crystal family proof. |
| `CRYSTAL_BRACELET_FORM_MIN_CONFIDENCE` | `0.8` | Minimum `formConfidence` for bracelet form proof. |

## How bracelet routing is proven now

`crystalBraceletV1` / `crystal_bracelet` lane still requires **normalized `objectFamily` = crystal**, **`shapeFamily` = bracelet**, and **non-Moldavite** in `reportPayload.builder.js`. The worker sets `objectFamily` / `shapeFamily` to `crystal` / `bracelet` **only** when strict eligibility succeeds; otherwise it does not force bracelet.

## Logs (structured)

`CRYSTAL_BRACELET_ELIGIBILITY_START`, `CRYSTAL_BRACELET_FAMILY_CHECK`, `CRYSTAL_BRACELET_FORM_CHECK`, `CRYSTAL_BRACELET_ELIGIBILITY_RESULT`, `CRYSTAL_BRACELET_ROUTE_FORCED`, `CRYSTAL_BRACELET_ROUTE_BLOCKED`.

## PR summary (short)

- Added strict bracelet eligibility before routing into `crystal_bracelet`.
- `shapeFamily: "bracelet"` is **proven truth**, not a permissive hint.
- New env thresholds and unit tests cover eligibility and report attachment rules.

## PR review checklist

**A. Architecture** — Global strict + permissive + `mergeGateLabels()` unchanged; new passes are `runStrictCrystalFamilyCheck`, `runStrictBraceletFormCheck`, `checkCrystalBraceletEligibility`.

**B. Routing truth** — `shapeFamily: "bracelet"` only after strict eligibility success; permissive `shapeHint` does not force bracelet; `reportPayload.builder.js` still attaches `crystalBraceletV1` only for crystal + bracelet + non-Moldavite.

**C. Worker** — `processScanJob.service.js` runs eligibility after `legacyScanResultId` exists and applies `reportObjectFamily` / `reportShapeFamily` to `buildReportPayloadFromScan` and Gemini when appropriate.

**D. Confidence** — Env thresholds default to `0.8`; low confidence yields `inconclusive` / blocked routing.

**E. Prompt contract** — Thai JSON-only prompts; beads on one bracelet are not multiple objects; charms do not win ownership over a bracelet loop.

**F. Logging** — Events listed above include `scanResultIdPrefix`, gate result, family/form labels and confidences, final status, and forced/blocked bracelet routing.

**G. Tests** — `tests/crystalBracelet/crystalBraceletEligibility.test.js` + extended `crystalBraceletPayload.build.test.js`.

**H. User-facing safety** — No new exposure of internal subtype/tone/color guesses; Moldavite path untouched.

**I. Regression** — Sacred amulet / Moldavite / generic crystal behavior preserved when bracelet is not proven; object gate hard rejects unchanged.

**J. Merge note** — Same as “PR summary” and “What changed” above.
