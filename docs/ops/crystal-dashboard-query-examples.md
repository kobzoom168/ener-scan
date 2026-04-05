# Crystal routing / wording — dashboard query examples (Phase 5)

**Purpose:** Copy-adaptable **pseudo-queries** and **log filter** patterns. **Semantic clarity** over SQL beauty — translate predicates to your warehouse (BigQuery, ClickHouse, Splunk, Loki, etc.) or log platform.

**Events:** Prefer `REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY` or `REPORT_PAYLOAD_BUILT` (both carry `routingWordingMetrics` when enabled).

**Programmatic rollups:** For JSON/CSV exports in a script, use `aggregateCrystalRoutingDashboardSummary(rows)` in `src/utils/crystalRoutingDashboardSummary.util.js` (see `tests/fixtures/crystalRoutingDashboardRows.fixture.js`).

---

## Important notes

- Mismatch metrics are **observability aids**, not automatic proof of bad copy.
- **Preserve behavior** until repro + owner; metrics support investigation, not panic.
- **Adapt syntax** (`WHERE` vs filter DSL, JSON path `$.routingWordingMetrics.*`, etc.) to your stack.

---

## A. Top mismatch groups

**Intent:** Distribution of problem types among rows that include `routingWordingMetrics`.

```sql
-- Pseudo-SQL: group by mismatch type (crystal-triage subset)
SELECT
  JSON_VALUE(payload, '$.routingWordingMetrics.routingWordingMismatchType') AS mismatch_type,
  COUNT(*) AS n
FROM report_logs
WHERE event IN ('REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY', 'REPORT_PAYLOAD_BUILT')
  AND JSON_VALUE(payload, '$.routingWordingMetrics.isCrystalRoutingCase') = 'true'
GROUP BY 1
ORDER BY n DESC;
```

```text
# Log filter (Loki/Kibana-style, illustrative)
event="REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY"
| json
| routingWordingMetrics.isCrystalRoutingCase == true
| stats count by (routingWordingMetrics.routingWordingMismatchType)
```

**By severity:**

```sql
SELECT
  JSON_VALUE(payload, '$.routingWordingMetrics.routingWordingMismatchSeverity') AS sev,
  COUNT(*) AS n
FROM report_logs
WHERE event = 'REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY'
  AND JSON_VALUE(payload, '$.routingWordingMetrics.isCrystalRoutingCase') = 'true'
GROUP BY 1;
```

---

## B. Crystal-specific usage rate

**Intent:** Share of crystal routing cases where **`visibleWordingCrystalSpecific`** is true (often nested under `visibleWordingDiagnostics` in logs).

```sql
SELECT
  SUM(CASE WHEN JSON_VALUE(payload, '$.visibleWordingDiagnostics.visibleWordingCrystalSpecific') = 'true'
           THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS crystal_specific_rate
FROM report_logs
WHERE event = 'REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY'
  AND JSON_VALUE(payload, '$.routingWordingMetrics.isCrystalRoutingCase') = 'true';
```

Use the same denominator as **`totalCrystalRoutingCases`** in `aggregateCrystalRoutingDashboardSummary`.

---

## C. Generic fallback rate (code-bank + fallback-heavy)

**Generic code path rate** (crystal routing only):

```sql
SELECT
  SUM(CASE WHEN JSON_VALUE(payload, '$.visibleWordingDiagnostics.visibleWordingDecisionSource')
              IN ('code_bank_crystal_first', 'code_bank_family')
           THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0) AS generic_code_rate
FROM report_logs
WHERE event = 'REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY'
  AND JSON_VALUE(payload, '$.routingWordingMetrics.isCrystalRoutingCase') = 'true';
```

**Fallback-heavy rate** (aligns with `isFallbackHeavy` / level ≥ 2):

```sql
SELECT
  SUM(CASE WHEN CAST(JSON_VALUE(payload, '$.visibleWordingDiagnostics.visibleWordingFallbackLevel') AS INT64) >= 2
           THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0) AS fallback_heavy_rate
FROM report_logs
WHERE event = 'REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY'
  AND JSON_VALUE(payload, '$.routingWordingMetrics.isCrystalRoutingCase') = 'true'
  AND JSON_VALUE(payload, '$.visibleWordingDiagnostics.visibleWordingDecisionSource') LIKE 'db%';
```

---

## D. Rule-level drift

**Intent:** Volume and mismatch mix per **`crystalRoutingRuleId`**.

```sql
SELECT
  JSON_VALUE(payload, '$.crystalRoutingRuleId') AS rule_id,
  JSON_VALUE(payload, '$.routingWordingMetrics.routingWordingAlignmentStatus') AS align_status,
  COUNT(*) AS n
FROM report_logs
WHERE event = 'REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY'
  AND JSON_VALUE(payload, '$.routingWordingMetrics.isCrystalRoutingCase') = 'true'
GROUP BY 1, 2
ORDER BY n DESC;
```

---

## E. Weak protect monitoring

**Intent:** Weak-protect strategies vs visible wording category.

```sql
SELECT
  JSON_VALUE(payload, '$.crystalRoutingStrategy') AS strategy,
  JSON_VALUE(payload, '$.visibleWordingDiagnostics.visibleWordingCategoryUsed') AS wording_cat,
  COUNT(*) AS n
FROM report_logs
WHERE event = 'REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY'
  AND JSON_VALUE(payload, '$.crystalRoutingStrategy') = 'weak_protect'
GROUP BY 1, 2;
```

**Weak-protect default rule share** (matches `weakProtectDefaultRate` in summary helper):

```sql
SELECT
  SUM(CASE WHEN JSON_VALUE(payload, '$.crystalRoutingRuleId') = 'crystal_rg_weak_protect_default'
           THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0)
FROM report_logs
WHERE event = 'REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY'
  AND JSON_VALUE(payload, '$.routingWordingMetrics.isCrystalRoutingCase') = 'true';
```

---

## F. Post-deploy comparison template

**Windows:** `[t0, t1]` = before deploy baseline; `[t2, t3]` = after deploy.

| Metric | How to compute |
|--------|----------------|
| Hard mismatch rate | `count(alignmentStatus == 'hard_mismatch') / crystal_cases` per window |
| Soft mismatch rate | `count(alignmentStatus == 'soft_mismatch') / crystal_cases` |
| Crystal-specific rate | Section B |
| Fallback-heavy rate | Section C |
| Top changed rule id | Diff top-N `crystalRoutingRuleId` counts or delta |

```sql
-- Pattern: repeat for each time window CTE (pseudo)
WITH w AS (SELECT ... FROM logs WHERE ts BETWEEN :t2 AND :t3 AND ...)
SELECT
  AVG(CASE WHEN align = 'hard_mismatch' THEN 1.0 ELSE 0.0 END) AS hard_rate,
  AVG(CASE WHEN align = 'soft_mismatch' THEN 1.0 ELSE 0.0 END) AS soft_rate
FROM w;
```

Export rows to a script and call **`aggregateCrystalRoutingDashboardSummary`** for each window to compare counters and `topMismatchTypes`.

---

## G. Thai / non-crystal exclusion

**Do not** review Thai traffic as crystal mismatch noise:

```sql
WHERE JSON_VALUE(payload, '$.routingWordingMetrics.routingWordingAlignmentStatus') <> 'not_applicable'
```

or

```sql
WHERE JSON_VALUE(payload, '$.routingWordingMetrics.isCrystalRoutingCase') = 'true'
```

**Object family filter (if only raw `objectFamily` on log):**

```sql
WHERE LOWER(JSON_VALUE(payload, '$.objectFamily')) = 'crystal'
-- or use diagnostics.routingObjectFamily if present
```

---

## Daily review queries

- **Volume:** event count by hour for `REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY`.  
- **Health:** Sections **A** (mismatch types) + **B** (crystal-specific rate).  
- **Top rules:** Section **D** top 10 `crystalRoutingRuleId`.  
- **Noise check:** Section **G** — confirm `not_applicable` share on Thai traffic matches expectation.

---

## Post-deploy review queries

- **F** full table (hard/soft/specific/fallback/top rules).  
- Compare **`wordingPrimarySource`** (`db` vs `code_bank`) before/after.  
- Spike check on **`unexpected_generic_fallback`** and **`hard_mismatch`**.

---

## Release gate metrics (wording / routing / DB touched)

| Gate | Pass criteria (example; tune per team) |
|------|----------------------------------------|
| Hard mismatch | No sustained increase vs 7-day baseline |
| Crystal-specific rate | Within X pp of baseline |
| `crystal_rg_weak_protect_default` | Not spiking beyond threshold |
| Hydrate failures | No new `REPORT_PAYLOAD_DB_WORDING_HYDRATE_FAIL` cluster |

---

## Incident drill-down queries

1. **Filter** scan or user id + time range.  
2. **Fetch** full sequence: `REPORT_PAYLOAD_MAIN_ENERGY_INFERENCE` → `REPORT_PAYLOAD_DB_WORDING_HYDRATE` → `REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY`.  
3. **Join** on `scanResultIdPrefix` (or full id if logged).  
4. **Extract** `routingWordingMetrics`, `crystalRoutingRuleId`, `visibleWordingDiagnostics`.  
5. **Aggregate** same window with Section **D** + **A** to see if incident is rule-specific.

---

## See also

- **`docs/ops/crystal-routing-wording-playbook.md`** — triage scenarios and escalation.  
- **`docs/ops/crystal-release-gate-checklist.md`** — pre-merge / pre-deploy gates.  
- **`docs/ops/crystal-post-deploy-review.md`** — time windows, rollback vs calm.  
- **`docs/ops/crystal-release-thresholds-template.md`** — calibrate warning/critical.  
- **`docs/ops/templates/crystal-release-checklist.json`** — machine-readable checklist keys.  
- **`docs/crystal-routing-telemetry-mapping.md`** — field mapping.  
- **`docs/crystal-routing-wording-mismatch-metrics.md`** — mismatch taxonomy.
