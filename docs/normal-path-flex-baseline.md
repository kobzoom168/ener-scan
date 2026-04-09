# Normal-path Flex / routing baseline (frozen)

This document locks the **default scan delivery** policy. Code outside this policy is either legacy compatibility or isolated modules.

## Runtime selection (summary-first Flex)

- **Lanes:** `moldavite` | `sacred_amulet` | generic summary-first fallback.
- **No** dedicated crystal–generic-safe **routing** lane in normal selection (no `crystal_generic_safe_flex_v1` in the main path).
- **Sacred amulet** is the active amulet lane (`amuletV1` / sacred_amulet builders).

## Isolated compatibility

- `flex.crystalGenericSafe.js` remains as an **isolated builder** for tests or future non-default surfaces — **not** wired into normal `buildScanResultFlexWithFallback` / worker summary-link selection.

## Sacred amulet product truths (do not regress without explicit decision)

- No **`โทนทอง`** in user-facing sacred_amulet copy.
- **`โทนหลัก`** remains the hero energy line.
- **Graph-first** HTML report shell; **2-row** graph summary under “สรุปจากกราฟ”.
- **Flex** stays **teaser-only** (primary product lanes remain moldavite + sacred_amulet).
