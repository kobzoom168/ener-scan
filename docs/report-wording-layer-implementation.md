# Implementation wiring spec — Report wording layer (Day 3)

**Source product spec:** `docs/day3-wording-surfaces.md` (families, L1/L2/L3 matrices, clarity mapping).

**Goals**

- Wire **`wordingFamily`** + **`clarityLevel`** + **surface strings** into the existing **`ReportPayload`** path.
- **Single source of truth** for Legacy Flex, Summary-first Flex, HTML report, persistence, and analytics.
- **Best-effort:** failure in wording computation **must not** block scan completion or report delivery.
- **Do not** change scan engine, rollout flags, or summary-first cohort logic.

**Non-goals (this PR / phase)**

- Rewriting the scan engine or LLM prompts.
- Expanding rollout % or `FLEX_SCAN_SUMMARY_FIRST` behavior.
- Replacing conversion / marketing copy outside this layer.

---

## 1) High-level data flow

```
parseScanText(resultText)
       ↓
buildReportPayloadFromScan()
       ├─ existing: sections, summary, object, …
       └─ NEW: computeReportWording(...)  →  payload.wording
       ↓
persist (scan_public_reports) — JSON includes wording if present
       ↓
LINE reply: buildScanSummaryFirstFlex(..., { reportPayload })
       └─ read payload.wording.surfaces.* (teaser)
       ↓
HTTP report: normalizeReportPayloadForRender(payload)
       └─ pass through payload.wording
       └─ mobileReport.template.js uses wording.surfaces + fallbacks
```

If `computeReportWording` throws or returns empty → **omit** `wording` or set `usedFallback: true` and minimal surfaces; builders fall back to **current** behavior (distill summary line, hero rules in template).

---

## 2) `ReportPayload` extension

Add optional nested object **`wording`** (always optional for backward compatibility with rows without it).

| Field | Type | Description |
|-------|------|-------------|
| `wording.family` | `string` | One of: `protect_anchor`, `open_path`, `kindness_metta`, `rebalance`, `restore_strength`, `confidence_lead`, `action_push`, or `unknown` |
| `wording.clarityLevel` | `"L1"\|"L2"\|"L3"` | |
| `wording.clarityLabelThai` | `string` | มีแนวโน้ม \| ค่อนข้างชัด \| เด่นชัด |
| `wording.scoreTier` | `"low"\|"medium"\|"high"` | From energy score bands |
| `wording.confidenceTier` | `"low"\|"medium"\|"high"` | Parser / payload completeness |
| `wording.agreementTier` | `"low"\|"medium"\|"high"` | Section alignment |
| `wording.clarityReasonCode` | `string` | Machine reason per mapping doc (e.g. `all_high`, `default_medium`) |
| `wording.usedFallback` | `boolean` | True if any surface used safe fallback text |
| `wording.wordingSpecVersion` | `string` | e.g. `"1.0.0"` — bump when matrices / mapping rules change |
| `wording.surfaces` | `object` | See below |

**`wording.surfaces`**

| Key | Role |
|-----|------|
| `heroNaming` | Short hero-style label (may still be overridden by non-generic `object.objectLabel`) |
| `flexHeadline` | One sentence for Flex page 1 |
| `bullet1` | What it gives |
| `bullet2` | When it shines |
| `htmlOpening` | 1–2 lines for HTML under hero |

**JSDoc:** Extend `reportPayload.types.js` with `ReportWording` typedef and `wording?: ReportWording` on `ReportPayload`.

---

## 3) New modules (utilities)

### 3.1 `src/utils/reports/reportWordingFamily.util.js`

**Responsibilities**

- Export const **`WORDING_FAMILIES`** list (7 + `unknown`).
- **`inferWordingFamilyFromMainEnergy(mainEnergyLabel: string): string`**  
  - Keyword / substring map Thai + English cues → family id (document mapping table in file header).
  - Default **`unknown`** when no match (never throw).

**Tests:** mapping table coverage for known labels used in scans.

---

### 3.2 `src/utils/reports/reportClarityLevel.util.js`

**Responsibilities**

- **`scoreTierFromEnergyScore(energyScore: number|null): "low"|"medium"|"high"`** — bands from `day3-wording-surfaces.md` § Score tier.
- **`confidenceTierFromParseState({ parseException, sectionCounts, summaryLineIsDefault, ... }): ...`** — heuristic from `day3` § Confidence.
- **`agreementTierFromSections({ summary, sections, family }): ...`** — heuristic from `day3` § Agreement.
- **`resolveClarityLevel({ scoreTier, confidenceTier, agreementTier }): { clarityLevel, clarityLabelThai, clarityReasonCode }`** — implement **priority-ordered** rules from `day3` § Mapping rules.
- **Thin / conflict:** if `isThinPayload(payload)` or `hasMajorConflict(...)` → force L1 + reason code `thin_or_conflict`.

**Tests:** golden cases for each `clarityReasonCode` path; edge: null score → low.

---

### 3.3 `src/utils/reports/reportWordingSurface.util.js`

**Responsibilities**

- **`WORDING_SPEC_VERSION`** export constant (e.g. `"1.0.0"`).
- **`buildSurfacesFromFamilyAndClarity(family, clarityLevel, payload): ReportWordingSurfaces`**  
  - Select copy from **embedded tables** or JSON keyed by `family` + `clarityLevel` (L1/L2/L3 rows) aligned with `docs/day3-wording-surfaces.md` matrices.
  - Return `{ heroNaming, flexHeadline, bullet1, bullet2, htmlOpening }`.
- **`applySafeFallbacks(payload, surfaces)`** — if `object.objectLabel` is specific non-generic, **hero** may keep template rule (Stop rule); if section empty, fill bullet from `whatItGives` / `distillSummaryLine` per existing doc.

**Tests:** for each family at L2, surfaces non-empty; L1 softer than L3 for same family (string contains มีแนวโน้ม vs เด่นชัด where applicable).

---

## 4) `buildReportPayloadFromScan` (`reportPayload.builder.js`)

**After** sections and summary are assembled (same as today):

1. Build a **partial context** for clarity: `energyScore`, `parseException`, `summaryLine`, section counts, `mainEnergyLabel`.
2. Call **`inferWordingFamilyFromMainEnergy(mainEnergyLabel)`**.
3. Call **`resolveClarityLevel`** + tier helpers.
4. Call **`buildSurfacesFromFamilyAndClarity`**; set **`usedFallback`** if fallbacks applied.
5. Attach **`wording: { ... }`** to the returned payload.

**Error handling:** wrap steps 1–5 in try/catch; on error log `REPORT_WORDING_SKIPPED` with message; **return payload without `wording`** (or `wording: { usedFallback: true, wordingSpecVersion, wording: null }` — **prefer omit** for smaller DB rows).

**Do not** add async I/O here.

---

## 5) `normalizeReportPayloadForRender` (`reportPayloadNormalize.util.js`)

- If `raw.wording` exists and is object, **copy** `wording` through to normalized payload (same shape).
- If missing, **omit** `wording` (no warning required).
- Optional warning: `wording_missing` when `reportVersion` is new but wording absent (debug only).

---

## 6) Flex — `flex.summaryFirst.js`

**Current:** `flexHeadlineFromPayload`, `flexTeaserBullets` use `messagePoints` / `whatItGives` / `distillSummaryLine`.

**Change:**

- If **`reportPayload.wording?.surfaces`**, use:
  - `flexHeadline` ← `wording.surfaces.flexHeadline` (trimmed; clamp lines with existing `safeWrapText` / max chars).
  - Bullets ← `wording.surfaces.bullet1`, `wording.surfaces.bullet2` if non-empty.
- Else **existing** behavior (no regression).

**Legacy Flex** (`flex.service.js`): unchanged unless product later wants wording; **out of scope** for this spec.

---

## 7) HTML — `mobileReport.template.js`

**Current:** hero label logic, `heroOpeningLine` from `messagePoints`/`whatItGives`, `distillSummaryLine` for summary card.

**Change:**

- If **`p.wording?.surfaces?.heroNaming`** and hero synthetic path would apply: prefer **wording** for display title **or** merge with existing “evocative lead” rule (document: **non-generic `objectLabel` wins** over `wording.surfaces.heroNaming`).
- If **`p.wording?.surfaces?.htmlOpening`**: use for **`.hero-hook`** when present; else existing `heroOpeningLine` from sections.
- Summary card **unchanged** unless product ties summary line to wording later (not required for v1).

---

## 8) Logging

### 8.1 `REPORT_PAYLOAD_BUILT` (existing)

Extend JSON with (when wording computed):

```json
{
  "wordingFamily": "protect_anchor",
  "clarityLevel": "L2",
  "scoreTier": "medium",
  "confidenceTier": "high",
  "agreementTier": "medium",
  "clarityReasonCode": "default_medium",
  "usedFallback": false,
  "wordingSpecVersion": "1.0.0"
}
```

### 8.2 Optional: `REPORT_WORDING_BUILT` (single event)

If `REPORT_PAYLOAD_BUILT` becomes too large, emit a second compact event with the same fields + `scanResultIdPrefix`.

### 8.3 Flex / HTML (optional)

- `FLEX_SUMMARY_FIRST` log: add **`wordingFamily`**, **`clarityLevel`** when `reportPayload` has wording (optional, low priority).

**Do not** log full surface strings in production if logs are public; **prefix or hash** optional for debug.

---

## 9) Constants

| Constant | Location | Purpose |
|----------|----------|---------|
| `WORDING_SPEC_VERSION` | `reportWordingSurface.util.js` | Bump when matrices in `day3-wording-surfaces.md` change |
| **Payload version** | `REPORT_PAYLOAD_VERSION` in `reportPayload.types.js` | Consider minor bump when `wording` added (e.g. `1.1.0`) — **team decision** |

---

## 10) Tests (file-level plan)

| Test file | Coverage |
|-----------|----------|
| `tests/reportWordingFamily.util.test.js` | `inferWordingFamilyFromMainEnergy` — known Thai labels → family |
| `tests/reportClarityLevel.util.test.js` | Score bands; clarity priority rules; `clarityReasonCode` |
| `tests/reportWordingSurface.util.test.js` | L1/L2/L3 surface strings exist for each family; **usedFallback** path |
| `tests/reportPayload.builder.wording.test.js` | Mock parse output → payload has `wording` shape; **no wording** on throw inside wording block |
| `tests/reportPayload.hardening.test.js` (extend) | Normalize preserves `wording` when present |

**Integration (optional):** snapshot Flex JSON fragment when `reportPayload.wording` set.

---

## 11) Rollout & safety checklist

- [ ] Wording failure does **not** throw from `buildReportPayloadFromScan`.
- [ ] DB row without `wording` still renders HTML + Flex (normalize + template fallbacks).
- [ ] No change to `scanFlow` rollout / `buildScanResultFlexWithFallback` / env flags.
- [ ] `wording` size bounded (no unbounded LLM output in this layer — tables only).

---

## 12) Implementation order (suggested)

1. Add typedefs + `WORDING_SPEC_VERSION` + **static** surface tables in `reportWordingSurface.util.js` (copy from `day3` doc).
2. Implement `reportWordingFamily.util.js` + `reportClarityLevel.util.js` + tests.
3. Wire `buildReportPayloadFromScan` + `REPORT_PAYLOAD_BUILT` fields.
4. **Normalize** pass-through.
5. **Flex** + **HTML** consumers + tests.
6. Manual QA: one scan with full payload, one thin payload.

---

## 13) References

- `docs/day3-wording-surfaces.md` — families, L1–L3 matrices, clarity mapping, fallbacks.
- `src/services/reports/reportPayload.builder.js` — insertion point.
- `src/services/flex/flex.summaryFirst.js` — Flex headline + bullets.
- `src/templates/reports/mobileReport.template.js` — hero + hero-hook.
