# Crystal routing + wording — post-deploy review (Phase 6)

**Use after** any deploy that touched routing, wording, diagnostics, telemetry, or mismatch aggregation. Pair with **`crystal-dashboard-query-examples.md`** and optional **`buildCrystalReleaseReviewSummary`** on aggregated logs.

**Reminder:** Metrics are **observability aids** — not proof that user-visible copy is wrong. **Do not overreact** to single-window noise; compare to **baseline** and **deploy scope**.

---

## A. Immediate checks (first pull from dashboard/logs)

For **crystal routing cases** (`isCrystalRoutingCase` / `routingWordingAlignmentStatus != not_applicable`):

| Metric | What to look for |
|--------|------------------|
| **Hard mismatch rate** | Sudden step vs pre-deploy baseline |
| **Soft mismatch rate** | Sustained elevation |
| **Crystal-specific usage rate** | `visibleWordingCrystalSpecific=true` share |
| **Fallback-heavy rate** | DB path with high `visibleWordingFallbackLevel` |
| **Top `crystalRoutingRuleId`** | New or missing ids vs CSV |
| **Top `visibleWordingDecisionSource`** | Shift toward `code_bank_*` vs `db_*` |

---

## B. Drift checks

| Signal | Action |
|--------|--------|
| **Weak-protect default spike** | Compare `crystal_rg_weak_protect_default` share to baseline; review weak-protect fixtures |
| **Unexpected generic fallback spike** | `unexpected_generic_fallback` mismatch type rate; check DB availability |
| **Object-family mismatch** | Hard mismatch + wording family ≠ crystal — sample payloads |
| **Category mismatch** | Routing category vs `visibleWordingCategoryUsed` |
| **New / unknown rule ids** | Not in `docs/tables/crystal-routing-rule-map.csv` — contract drift |
| **Crystal routing + non-crystal wording family** | Same as object-family mismatch path; confirm pipeline |

---

## C. Safe vs unsafe patterns

| Pattern | Classification |
|---------|----------------|
| Small hour-to-hour fluctuation with **stable** daily average | **Expected fluctuation** |
| **Soft mismatch** up slightly; **hard** flat; UX unchanged | Often **noise** — monitor |
| **Hard mismatch** or **object-family** cluster **post-deploy** | **Suspicious drift** — investigate |
| **Crystal-specific rate** drop **> agreed threshold** with deploy correlation | **Unsafe** — rollback candidate discussion |
| **Fallback-heavy** + **hydrate errors** in same window | **Unsafe** — likely infra/DB |
| Thai traffic **`not_applicable`** stable | **Expected** — do not count as crystal regression |

---

## D. Rollback signals

Consider **rollback or immediate hotfix** when **all** apply:

1. Change scope included **routing / wording / payload** for crystal.  
2. **Hard mismatch rate** or **object-family / category mismatch** rate exceeds **calibrated critical** threshold (see thresholds template).  
3. **Crystal-specific usage rate** collapses beyond **critical** floor **or** **fallback-heavy rate** spikes beyond **critical** ceiling.  
4. **Top rule distribution** shifts in a way **not explained** by the deploy notes (e.g. new rule ids absent from changelog).  
5. Sample payloads show **wrong family or category** on real scans.

**Do not** rollback on Thai-heavy windows alone or on **`watch`**-only release-review status without corroborating evidence.

---

## First 15 minutes

- Confirm deploy **healthy** (no crash loops, webhook OK).  
- Pull **last N** `REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY` lines for **crystal** and **Thai** — fields present.  
- Glance **error logs** for `REPORT_PAYLOAD_DB_WORDING_HYDRATE_FAIL`.  
- If automated: run **`aggregateCrystalRoutingDashboardSummary`** + **`buildCrystalReleaseReviewSummary`** on a small sample.

---

## First hour

- Rates in section **A** vs **yesterday same hour** (or last week same weekday).  
- **Drift checks** section **B** for top 2 anomalies.  
- Confirm **no unknown** `crystalRoutingRuleId` spike.

---

## Same-day review

- Aggregate **daily** mismatch distribution; **topMismatchTypes** and **topRoutingRuleIds**.  
- Close **“monitor”** if metrics normalized; open **incident** if **rollback signals** persist.

---

## Next-day review

- Reconcile with **release gate** ticket: sign off or schedule follow-up.  
- Update **baseline** numbers in your ops doc if traffic mix changed legitimately.

---

## When to rollback

- See **D. Rollback signals** and **`crystal-release-thresholds-template.md`**.  
- **Escalate** to owner for **routing** vs **wording** vs **DB** using **`crystal-routing-wording-playbook.md`**.

---

## When not to overreact

- **Low-volume** windows (large relative noise).  
- **Staging** or **canary** traffic mixed into aggregates.  
- **Single scan** anomalies — need **pattern**.  
- **`soft_mismatch`** only with **flat hard** rate and **aligned product behavior**.  
- Metrics **flag** but **UX and CS** report no issue — dig deeper before code rollback.

---

## Related

- **`crystal-release-gate-checklist.md`** — pre-merge / pre-deploy  
- **`crystal-release-thresholds-template.md`** — calibrate numbers  
- **`crystal-dashboard-query-examples.md`** — queries  
- **`crystal-routing-wording-playbook.md`** — triage ownership
