# Crystal quarterly KPI pack — definitions

This document describes the **`quarterlyKpiPack`** object on the quarterly review pack. It **reuses monthly KPI semantics** (rates, cluster names, flags) — see:

- `docs/ops/crystal-monthly-scorecard.md`  
- `docs/ops/crystal-kpi-pack-definitions.md`

Quarterly values are **aggregates** (weighted averages, sums, or maxes) as noted in `docs/ops/crystal-quarterly-review-pack.md`.

## Sections

### `headlineKpis`

Blended quarter view: overall template score, aligned / hard mismatch / crystal-specific surface / generic fallback (all weighted).

### `supportingKpis`

Soft mismatch, fallback-heavy, weak-protect-default, JSON snapshots of monthly band distributions, optional top routing / wording shares (first month in the quarter that provides them).

### `riskIndicators`

Sums and maxes aligned with monthly rollup fields (recurring anomaly sum, max cluster counts, usage-drop month count).

### `trendIndicators`

Quarterly ops status, quarter score band, score drift driver label, month count.

### `recurringSignals`

Top rows from `topRecurringAnomalies` (code → months affected).

### `recommendedFocusAreas`

Copy of `focusAreasNextQuarter` on the pack (inspect DB, weak-protect, deploy history, etc.).

---

**Reminder:** Quarterly KPIs are **review aids**, not production SLOs. Pair with monthly digests when any risk indicator triggers.
