# Crystal routing vs visible wording — ops playbook (Phase 5)

**Audience:** on-call, QA, product ops, engineers reviewing dashboards or logs after deploy.

**Scope:** How to read telemetry, triage mismatches, and decide next steps. **Adapt** steps to your logging stack (Datadog, CloudWatch, BigQuery, ELK, etc.); field names match the repo’s JSON log contract.

---

## Important notes (read first)

- **Mismatch metrics are an observability aid.** They compare **routing trace** vs **wording diagnostics** — they are **not** proof that user-visible copy is wrong. Copy can be acceptable while metrics flag a soft mismatch.
- **Preserve current product behavior** when investigating until you confirm a real regression; avoid hotfixing routing/wording logic from metrics alone without repro and owner review.
- **Do not change** mismatch taxonomy semantics in tickets; refer to `docs/crystal-routing-wording-mismatch-metrics.md` and `src/utils/crystalRoutingWordingMetrics.util.js` as the contract.

---

## A. Purpose

Use this document for:

| Use case | What to do |
|----------|------------|
| **Dashboard reading** | Interpret `routingWordingMetrics` and correlation fields in context (crystal vs Thai). |
| **Incident triage** | Decide severity, narrow routing vs wording vs DB vs telemetry. |
| **Production review** | Weekly health: rates, top rules, generic fallback share. |
| **Release regression** | After deploys touching routing, wording, DB templates, or payload builders — compare windows (see query doc). |

---

## B. Data sources (authoritative fields)

Prefer events that already include the full picture:

| Source | What it carries |
|--------|------------------|
| **`REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY`** | Emitted after wording resolution; includes `visibleWordingDiagnostics`, correlation flags, **`routingWordingMetrics`**. |
| **`REPORT_PAYLOAD_BUILT`** | Same telemetry blocks for one-line log pipelines. |
| **`routingWordingMetrics`** | Alignment, mismatch type/severity, dashboard group, category/family flags, rule id, strategy, protect signal, wording source. |
| **`visibleWordingDiagnostics`** | `visibleWordingDecisionSource`, `visibleWordingCrystalSpecific`, category, fallback level, etc. |
| **`crystalRoutingRuleId`** | Stable rule id (`crystal_rg_*`) from routing. |
| **`crystalRoutingStrategy`** | Coarse bucket: `early_exit`, `resolver_direct`, `weak_protect`, `generic_boost`, `fallback`. |

**Optional:** `ReportPayload.diagnostics` for stored payloads / QA tools.

---

## C. Triage severity ladder

Map **metric signals** to **ops response** (tune thresholds per volume).

| Level | Meaning | Typical signals |
|-------|---------|-----------------|
| **monitor** | Track; no immediate action. | Low rate of `soft_mismatch`; baseline `unexpected_generic_fallback`; Thai `not_applicable` stable. |
| **investigate** | Schedule deep dive; sample payloads. | Sustained `soft_mismatch` above baseline; `crystal_specificity_mismatch`; `wording_missing_routing_meta`; rule drift in top-N. |
| **escalate** | Eng + owner; likely cross-layer bug or data issue. | **`hard_mismatch`** especially `object_family_mismatch` or `category_mismatch`; **`routing_missing_wording_meta`** at volume. |
| **hotfix_candidate** | Treat as release/regression until disproven. | Spike **after deploy** in hard mismatch rate, fallback-heavy rate, or collapse in crystal-specific rate; sudden **`crystal_rg_weak_protect_default`** share jump. |

---

## D. Top 8 triage scenarios

### 1) `unexpected_generic_fallback` spike

| | |
|--|--|
| **What it means** | Crystal routing + categories line up, but wording path looks like **code-bank crystal-first** without crystal-specific surface flag (or similar soft signal). |
| **Likely causes** | DB surface unusable → code path; staging/config drift; tests simulating `crystalSpecific: false`. |
| **What to query** | Filter `routingWordingMismatchType == "unexpected_generic_fallback"`; group by `crystalRoutingRuleId`, `visibleWordingReason`. |
| **Inspect in log/payload** | `dbSurfaceOk`, `visibleWordingDecisionSource`, `visibleWordingCrystalSpecific`, DB hydrate events. |
| **Next action** | Compare DB row availability vs category; confirm `resolveCrystalVisibleWordingPriority` inputs. |
| **Owner hint** | **Wording / DB** first; **routing** if category wrong upstream. |

### 2) `object_family_mismatch`

| | |
|--|--|
| **What it means** | Routing says crystal, but **wording object family** is not `crystal`. |
| **Likely causes** | Wrong family passed into wording pipeline; mixed bundle; bug in diagnostics. |
| **What to query** | `routingWordingMismatchType == "object_family_mismatch"`; sample `wordingObjectFamily` vs `routingObjectFamily`. |
| **Inspect** | `objectFamily` / `famNorm` in builder, DB bundle branch, `visibleWordingObjectFamilyUsed`. |
| **Next action** | Reproduce scan; trace `normalizeObjectFamilyForEnergyCopy` and DB selection. |
| **Owner hint** | **Wording / payload builder**; **DB** if wrong template family. |

### 3) `category_mismatch`

| | |
|--|--|
| **What it means** | **energyCategoryCode** (routing) ≠ **visibleWordingCategoryUsed** (wording). |
| **Likely causes** | Category remap bug; DB `categoryUsed` drift; inference vs hydrate mismatch. |
| **What to query** | Hard mismatch + type; joint distribution `energyCategoryCode` × `visibleWordingCategoryUsed`. |
| **Inspect** | Inference trace, DB hydrate `categoryUsed`, flex surface meta. |
| **Next action** | Single-scan diff: routing output vs DB row category. |
| **Owner hint** | **Routing** vs **wording/DB** — split by where category diverges first. |

### 4) `fallback_overuse`

| | |
|--|--|
| **What it means** | **Heavy DB fallback** (`visibleWordingFallbackLevel >= 2`) on DB wording paths. |
| **Likely causes** | Thin template pools; retry paths; data gaps for angle/cluster. |
| **What to query** | `routingWordingMismatchType == "fallback_overuse"`; by `crystalRoutingRuleId`. |
| **Inspect** | `dbWordingFallbackLevel`, `rowSource`, `REPORT_PAYLOAD_DB_WORDING_HYDRATE`. |
| **Next action** | Content/DB coverage review for hot categories. |
| **Owner hint** | **DB / copy**; **telemetry** if level wrong. |

### 5) `routing_missing_wording_meta`

| | |
|--|--|
| **What it means** | Crystal rule present but **wording side missing category or object-family metadata** expected for alignment. |
| **Likely causes** | Hydrate skip; empty diagnostics; pipeline bug. |
| **What to query** | Count by rule id; correlate with failed hydrate. |
| **Inspect** | Full diagnostics block; hydrate fail logs. |
| **Next action** | Fix data or builder so category/family populated. |
| **Owner hint** | **Payload/wording** + **DB**. |

### 6) `wording_missing_routing_meta`

| | |
|--|--|
| **What it means** | Category present but **no `crystal_rg_*` rule id** (soft gap). |
| **Likely causes** | Trace not populated; non-standard id string; legacy path. |
| **What to query** | `crystalRoutingRuleId` null or not prefixed `crystal_rg_` with crystal family. |
| **Inspect** | `inferEnergyCategoryInferenceTrace` outputs in same request. |
| **Next action** | Confirm routing actually ran for crystal scans. |
| **Owner hint** | **Routing / inference trace** wiring. |

### 7) Crystal-specific rate drop

| | |
|--|--|
| **What it means** | **`visibleWordingCrystalSpecific=true`** share falls among **crystal routing** cases. |
| **Likely causes** | More code-bank usage; DB outages; config. |
| **What to query** | Rate `visibleWordingCrystalSpecific` where `isCrystalRoutingCase` (see query doc + `aggregateCrystalRoutingDashboardSummary`). |
| **Inspect** | `wordingPrimarySource`, `dbSurfaceOk`, decision source. |
| **Next action** | Split by `db` vs `code_bank` before blaming copy logic. |
| **Owner hint** | **DB / infra** first if `dbSurfaceOk` dropped. |

### 8) Weak-protect default spike (`crystal_rg_weak_protect_default`)

| | |
|--|--|
| **What it means** | Many scans hit **weak protect default** routing bucket. |
| **Likely causes** | Regex/cue gaps; copy changes in Thai lines; resolver outputs. |
| **What to query** | Volume and rate of `crystalRoutingRuleId`; joint with `protectSignalStrength`. |
| **Inspect** | `crystalWeakProtectOutcome`, raw main energy lines, rule map CSV. |
| **Next action** | Compare to baseline week; review weak-protect fixtures. |
| **Owner hint** | **Routing** (+ **wording** if cues depend on surface copy). |

---

## How to decide: routing vs wording vs DB vs telemetry

| Symptom | Suspect first |
|--------|----------------|
| Wrong **category code** vs scan text | **Routing** / inference (`crystalRoutingRuleId`, branch). |
| Category matches but **wrong template / family** on surface | **Wording** path + **DB** row selection. |
| **DB** fields missing / fallback depth high | **DB** content, slots, **hydrate** errors. |
| Metrics **missing or inconsistent** across events | **Telemetry** wiring / log sampling / version skew (`reportVersion`, `dashboardMetricVersion`). |

Use **`REPORT_PAYLOAD_DB_WORDING_HYDRATE`** vs **`REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY`** timestamps and scan id to align the same request.

---

## What to check first (order)

1. **Exclude noise:** filter **`routingWordingAlignmentStatus != "not_applicable"`** for crystal-only triage (or `isCrystalRoutingCase == true`).  
2. **Confirm deploy window** for correlation with spikes.  
3. **One full payload** (diagnostics + logs) for a single `scanResultId`.  
4. **Rule id + strategy** — bucket before deep diving copy.  
5. **DB vs code:** `wordingPrimarySource`, `visibleWordingDecisionSource`.

---

## When not to panic

- Isolated **`soft_mismatch`** rows on edge categories.  
- Short spikes during **staging** or **load tests**.  
- **`not_applicable`** dominating **Thai** traffic — expected.  
- Metrics flag while **UX reads fine** — treat as signal, not automatic P1.

---

## When to escalate immediately

- **Sustained `hard_mismatch`** (`object_family_mismatch`, `category_mismatch`) above agreed SLO.  
- **`routing_missing_wording_meta`** at non-trivial rate post-deploy.  
- **Crystal-specific rate** collapse correlated with **production deploy** of wording/DB/payload.  
- **Data loss**: hydrate failures across many scans (check infra before code).

---

## Helper reference

Offline aggregation for dashboard CSV/JSON exports: `src/utils/crystalRoutingDashboardSummary.util.js` — `aggregateCrystalRoutingDashboardSummary()`. Example rows: `tests/fixtures/crystalRoutingDashboardRows.fixture.js`.

Query patterns: **`docs/ops/crystal-dashboard-query-examples.md`**.

Release discipline: **`docs/ops/crystal-release-gate-checklist.md`**, **`docs/ops/crystal-post-deploy-review.md`**, **`docs/ops/crystal-release-thresholds-template.md`**. Release review classifier: `buildCrystalReleaseReviewSummary` in `src/utils/crystalReleaseReviewSummary.util.js`.
