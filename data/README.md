# Generated data (local / optional commit)

## `style-reference-pack.json`

Produced by:

```bash
npm run analyze:style
```

Contains aggregated **pattern summary** (signal histogram, avg `improve_gain_ratio` by `quality_tier`, wording traits) plus **5–10 example** full texts from top-performing scans (`quality_tier = excellent`, `score_after >= 45`).

- Safe to `.gitignore` if you treat it as environment-specific.
- Commit a snapshot if you want versioned few-shot references for prompt work.

Requires Supabase credentials and `quality_analytics` populated on `scan_results` (see `sql/012_*.sql`).

## Rewrite style references (optional)

**Gating (prefer env mode over legacy flag):**

- `DEEP_SCAN_STYLE_REFERENCE_MODE=off` — never inject  
- `DEEP_SCAN_STYLE_REFERENCE_MODE=on` — always try when rewrite runs  
- `DEEP_SCAN_STYLE_REFERENCE_MODE=sample` — random subset; set `DEEP_SCAN_STYLE_REFERENCE_SAMPLE_PCT` (default `10`)  
- If `MODE` is unset: `ENABLE_DEEP_SCAN_STYLE_REFERENCES=true` → behaves like `on`; else `off`.

Requires `ENABLE_DEEP_SCAN_REWRITE=true`. If the pack file is missing or invalid, rewrite runs without the extra block (scan flow continues).

Metrics are stored on `scan_results.quality_analytics` for comparing cohorts (see `sql/014_quality_analytics_style_ab_compare.sql`).
