# Business impact signals (half-year KPI pack)

The **`businessImpactSignals`** array on the half-year pack (`halfYearKpiPack.businessImpactSignals`) reuses **monthly/quarterly rollup fields** only. It does **not** compute revenue or external business outcomes.

Each row includes:

| Field | Meaning |
|--------|---------|
| `label` | Signal name (e.g. stability of crystal-first wording) |
| `value` | String from current metrics or input (e.g. `%`, “no releaseSignals in input”) |
| `triggered` | Boolean flag for quick scan |
| `note` | Evidence-bound explanation |

## Signals (template)

1. **Stability of crystal-first wording** — uses blended `crystalSpecificSurfaceRate` from rollups.  
2. **Release-to-drift sensitivity** — states whether `releaseSignals` was present in the half-year JSON; does not infer causality.  
3. **DB crystal coverage concern** — proxy via blended `genericFallbackRate`.  
4. **Repeated generic fallback concentration** — from half-year mismatch recurrence (`generic_fallback_elevated` pattern).  
5. **Repeated weak-protect-default concentration** — blended `weakProtectDefaultRate` + `multiPeriodFallbackHeavy` flag.

For core KPI definitions, see `docs/ops/crystal-monthly-scorecard.md` and `docs/ops/crystal-quarterly-review-pack.md`.
