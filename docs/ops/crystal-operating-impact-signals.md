# Operating impact signals (annual KPI pack)

The **`operatingImpactSignals`** array on the annual pack (`annualKpiPack.operatingImpactSignals`) reuses **monthly / quarterly / half-year** rollup semantics. It does **not** compute revenue or external business KPIs.

Each row includes `label`, `value`, `triggered`, and `note` (evidence-bound).

Typical rows:

1. **Stability of crystal-first wording** — annual blended `crystalSpecificSurfaceRate`.  
2. **Release-to-drift sensitivity** — whether `releaseSignals` appeared in the annual JSON.  
3. **DB crystal coverage concern** — proxy via blended `genericFallbackRate`.  
4. **Recurring generic fallback concentration** — annual mismatch pattern (≥6 months over threshold).  
5. **Recurring weak-protect-default concentration** — blended rate + multi-period fallback-heavy flag.  
6. **Repeated watch/escalate in half-year reviews** — count of half-years with `watch` or `escalate` status.

Core definitions: `docs/ops/crystal-monthly-scorecard.md`, `docs/ops/crystal-quarterly-review-pack.md`, `docs/ops/crystal-halfyear-business-review-pack.md`.
