# 3-lane-only policy (closed-world routing)

## Policy

Only these lanes are supported for **normal** Scan V2 completion:

1. **moldavite** — Moldavite proven via existing Gemini + heuristic stack (`resolveMoldaviteDetectionWithGeminiCrystalSubtype`)
2. **sacred_amulet** — Thai pipeline category maps to an explicit sacred family (`takrud`, `somdej`, `sacred_amulet`, `thai_amulet`, or **`พระเครื่อง` → `sacred_amulet`** in `mapObjectCategoryToPipelineSignals`)
3. **crystal_bracelet** — existing **strict** crystal family + bracelet form eligibility (`checkCrystalBraceletEligibility`)

**Everything else → unsupported** (no report publication, same class of user messaging as other rejections).

## Resolution order

Implemented in `resolveSupportedLaneStrict` (`src/utils/reports/supportedLaneStrict.util.js`):

1. Global object gate must be `single_supported` (unchanged strict/multiple/unclear rules).
2. **Moldavite** if crystal context (pipeline crystal **or** strict bracelet eligible) and Moldavite detection is true.
3. **Sacred amulet** if pipeline family implies sacred amulet **and** strict bracelet is **not** eligible (avoids classifying a proven bracelet as พระเครื่อง).
4. **Crystal bracelet** if strict bracelet eligibility succeeds.
5. Otherwise **unsupported**.

## Unknown = unsupported

- Empty/unknown Thai category → `generic` pipeline family → no lane unless bracelet/Moldavite/sacred proof applies.
- Crystal without Moldavite and without bracelet proof → **unsupported**.
- `single_supported` at the object gate only means the image passed the base gate; **lane proof is still required**.

## Legacy paths blocked

- No reliance on `summary_first_default` as a **product lane** for Scan V2 when the strict resolver returns unsupported — the worker stops before `buildReportPayloadFromScan`.
- `normalizeObjectFamilyForEnergyCopy` may still map `generic` → `sacred_amulet` for **DB energy-copy** compatibility; lane selection no longer depends on that mapping for worker routing.

## Worker integration

`processScanJob.service.js`:

- Runs bracelet eligibility + Gemini (crystal context) + `resolveSupportedLaneStrict`.
- On **unsupported**: `failJob(..., "supported_lane_unresolved", ...)`, outbound unsupported payload, `updateScanRequestStatus(..., "failed")`, **return** (no report).
- On success: sets `reportObjectFamily` / `reportShapeFamily` and passes **`strictSupportedLane`** into `buildReportPayloadFromScan`.

## Report builder

`buildReportPayloadFromScan` accepts optional **`strictSupportedLane`**. When set, only the matching v1 slice may attach; other slices are cleared (defense in depth).

## Flex

`buildScanResultFlexWithFallback` uses **`crystal_bracelet_flex_v1`** telemetry when `reportPayload.crystalBraceletV1` is present (still `buildScanSummaryFirstFlex` for the bubble).

## Logging

Structured events include: `SUPPORTED_LANE_STRICT_RESOLUTION_START`, `SUPPORTED_LANE_STRICT_RESOLUTION_RESULT`, `SUPPORTED_LANE_UNSUPPORTED`, `SUPPORTED_LANE_MOLDAVITE_CONFIRMED`, `SUPPORTED_LANE_SACRED_AMULET_CONFIRMED`, `SUPPORTED_LANE_CRYSTAL_BRACELET_CONFIRMED`, `SUPPORTED_LANE_LEGACY_PATH_BLOCKED`, plus `REPORT_LANE_SELECTED` with `strictSupportedLane`.

## Tests

- `tests/supportedLaneStrict.util.test.js`
- Pipeline mapping test for `พระเครื่อง` → `sacred_amulet`
- Crystal bracelet payload tests pass `strictSupportedLane` where appropriate
