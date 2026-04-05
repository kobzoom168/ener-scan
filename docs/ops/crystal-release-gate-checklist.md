# Crystal routing + visible wording — release gate checklist (Phase 6)

**Audience:** engineers and release owners before merging or deploying changes that touch crystal routing, wording, diagnostics, or telemetry.

**Principles:** Mismatch metrics and this checklist are **decision aids**, not automatic ship/stop signals. **Calibrate thresholds** to your traffic (`docs/ops/crystal-release-thresholds-template.md`). **Non-crystal / Thai traffic** must not block releases by itself.

---

## When this checklist is required

Use this checklist when the change touches any of:

| Area | Examples |
|------|----------|
| **Routing rules** | `crystalCategoryRouting.util.js`, rule order, new/changed `crystal_rg_*` ids |
| **Visible wording priority / fallback** | `crystalVisibleWordingPriority.util.js`, DB vs code-bank paths |
| **Report payload diagnostics** | `reportPayload.builder.js`, `ReportPayload.diagnostics` fields |
| **Mismatch metrics** | `crystalRoutingWordingMetrics.util.js` (semantics frozen unless explicit version bump + doc) |
| **Telemetry / logs** | New or renamed log JSON fields, event shapes |
| **Docs / tables (contract)** | `crystal-routing-telemetry-mapping.md`, `docs/tables/crystal-routing-rule-map.*` |
| **Dashboard / aggregation** | `crystalRoutingDashboardSummary.util.js`, `crystalReleaseReviewSummary.util.js` |

Purely cosmetic UI copy with **no** routing/wording/diagnostics/telemetry impact does **not** require this checklist.

---

## A. Scope of changes (self-classify)

- [ ] **Routing / inference** — category codes, rule ids, strategy enums  
- [ ] **Wording / templates / DB** — pools, hydrate, visible surface  
- [ ] **Payload / diagnostics** — `reportVersion`, new diagnostic keys  
- [ ] **Observability only** — docs, helpers, log field names (no selection change)  
- [ ] **None of the above** — checklist not required  

---

## B. Pre-merge gate

| Check | Done |
|-------|------|
| `npm test` (or CI equivalent) passes | ☐ |
| Crystal **frozen fixtures** / regression tests pass (`crystalRouting.fixture-regression.test.js`, `crystalCategoryRouting.util.test.js`) | ☐ |
| **Thai path** tests pass; no new crystal-only assumptions in shared code without guards | ☐ |
| **Routing**: intended behavior matches PR description; no accidental rule-order or id drift | ☐ |
| **Visible wording diagnostics**: fields still populated for crystal + non-crystal paths | ☐ |
| **Mismatch metrics**: `routingWordingMetrics` shape still complete for dashboard (`dashboardMetricVersion` noted if contract changes) | ☐ |
| **Docs / rule map**: updated if `routingRuleId`, strategy, or telemetry field names changed | ☐ |
| **Release review helper** (if touched): `tests/crystalReleaseReviewSummary.util.test.js` passes | ☐ |

---

## C. Pre-deploy gate

| Check | Done |
|-------|------|
| Correct **branch / commit SHA** tagged for deploy | ☐ |
| **`REPORT_PAYLOAD_VERSION`** (or equivalent) bumped and noted in PR if diagnostics contract changed | ☐ |
| **Env**: no conflicting feature flags between staging and prod for wording/routing experiments | ☐ |
| **Dashboard / query docs** still reference **actual field names** in logs | ☐ |
| No **unknown** `crystalRoutingRuleId` / `crystalRoutingStrategy` in generated examples, fixtures, or tests without doc/CSV update | ☐ |
| **Spot-check**: 1–3 sample payloads or log lines (crystal + Thai) reviewed in staging | ☐ |
| **Ops artifacts**: `docs/ops/crystal-post-deploy-review.md` window assigned (who watches first hour) | ☐ |

---

## D. Post-deploy review window (who watches what)

Align with `docs/ops/crystal-post-deploy-review.md`. Summary:

| Window | Focus |
|--------|--------|
| **First 15 min** | Error rate, deploy health, first crystal + Thai samples |
| **First hour** | Mismatch rates, crystal-specific rate, fallback-heavy, top rules |
| **Same day** | Trend vs baseline, weak-protect default share, generic fallback |
| **Next day** | Full daily review queries; close or extend incident |

---

## What blocks release

- Failing **tests** or **frozen routing fixtures**.  
- **Undocumented** new `crystal_rg_*` id or strategy in production code paths.  
- **Broken telemetry** (missing `routingWordingMetrics` / diagnostics on crystal paths) without a justified rollback plan.  
- **Unreviewed** Thai / non-crystal regression when shared code changed.

---

## What requires doc update

- Any change to **telemetry field names**, **rule ids**, **strategies**, or **mismatch taxonomy** (if ever allowed via formal change).  
- Updates to **`docs/tables/crystal-routing-rule-map.*`** and **`crystal-routing-telemetry-mapping.md`**.  
- New **dashboard** or **release** helpers: add a line to **`crystal-release-gate-checklist.md`** scope table if new areas are introduced.

---

## What requires payload / report version note

- Any change to **shape or meaning** of `ReportPayload.diagnostics` consumed by clients, QA tools, or stored payloads.  
- Bump **`REPORT_PAYLOAD_VERSION`** in `reportPayload.types.js` and mention in PR + release notes.

---

## What can ship with watch status

- **Docs-only** or **observability-only** changes with tests green.  
- **Small metric / log additions** that do not alter routing or wording selection.  
- Deploy where **pre-merge** is complete but **post-deploy** owner agrees to monitor the first hour (document in ticket).  
- **`watch`** from `buildCrystalReleaseReviewSummary` on **noisy windows** — ship is allowed if product risk is low and monitoring is scheduled; **not** if status is **`rollback_candidate`** without leadership sign-off.

---

## Related

- Weekly quality report: **`crystal-weekly-quality-review.md`** (offline export + `generateCrystalWeeklyQualityReview.mjs`)
- Post-deploy steps: **`crystal-post-deploy-review.md`**  
- Thresholds template: **`crystal-release-thresholds-template.md`**  
- Machine-readable checklist: **`templates/crystal-release-checklist.json`**  
- Query examples: **`crystal-dashboard-query-examples.md`**  
- Ops playbook: **`crystal-routing-wording-playbook.md`**
