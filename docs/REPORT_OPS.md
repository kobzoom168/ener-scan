# Public HTML report & scan image ops (Phase 2.2–2.6)

## Object image bucket (`SCAN_OBJECT_IMAGE_BUCKET`)

- **Create** a dedicated Supabase Storage bucket (default name: `scan-object-images`). Mark **public** if you use `getPublicUrl()` for browser/LINE WebView (see `sql/020_scan_object_image_bucket.sql`).
- **Uploads** use the **service role** from the app; **end users never get write keys**.
- **Paths** are namespaced by LINE user id + report `publicToken` (see `scanObjectImage.storage.js`) so URLs are not guessable from `scan_result_id` alone.

### Lifecycle & retention

- Supabase does not expire objects automatically unless you configure **Lifecycle** rules (Dashboard → Storage → bucket → Policies / lifecycle) or a scheduled job.
- **Recommended:** define a retention policy aligned with product needs (e.g. delete objects older than **90–365 days**) via:
  - Supabase Storage lifecycle (if available on your plan), or
  - Periodic Edge Function / cron calling Storage `remove()` for prefixes older than a cutoff (requires listing by prefix or maintaining an index table).
- **PII note:** images are user-submitted scan photos; treat as sensitive. Avoid logging full public URLs in production logs (current code logs token prefixes only for some events).

### Safety

- **HTML render** only allows `https:` image URLs (`reportImageUrl.util.js` + normalize layer).
- **Bucket public read** exposes only what you upload under those paths; keep **no listing** if possible and rely on unguessable `publicToken`.
- **CORS:** default Supabase public URLs work for `<img src>`; if you proxy through another domain, update CSP accordingly.

---

## Phase 2.3 — Flex “summary-first” migration

### Flags (environment)

| Variable | Default | Purpose |
|----------|---------|---------|
| `FLEX_SCAN_SUMMARY_FIRST` | off | Replace legacy 3-bubble + optional report carousel with **summary-first** Flex (`flex.summaryFirst.js`). |
| `FLEX_SUMMARY_APPEND_REPORT_BUBBLE` | off | If summary-first is on: add a **second** carousel bubble for “รายงานฉบับเต็ม” instead of a footer URI button on the first bubble. |

### Suggested rollout

1. **Staging:** enable `FLEX_SCAN_SUMMARY_FIRST=true`, leave `FLEX_SUMMARY_APPEND_REPORT_BUBBLE=false` (compact: one bubble + footer button).
2. **Monitor:** `FLEX_SUMMARY_FIRST` JSON logs, user feedback, scan completion rate (unchanged path).
3. **Optional A/B:** toggle `FLEX_SUMMARY_APPEND_REPORT_BUBBLE` for users who prefer a dedicated swipe card for the report link.
4. **Legacy:** set `FLEX_SCAN_SUMMARY_FIRST=false` for instant rollback; no DB migration.

### What stays unchanged

- Payment gate, slip flow, conversation routing, and scan success criteria are **unchanged**.
- `ReportPayload` shape and public report route are **unchanged**; summary-first Flex reads the same payload when the DB row exists.

---

## Manual test checklist (Phase 2.3)

- [ ] HTML report **with** uploaded image: hero shows image, acceptable crop (`object-fit: cover`).
- [ ] HTML report **without** image: placeholder copy and muted frame (`hero--no-image`).
- [ ] Broken image URL / network failure: hero falls back to “โหลดรูปไม่สำเร็จ”.
- [ ] Legacy Flex (`FLEX_SCAN_SUMMARY_FIRST` off): 3 bubbles + optional report + settings bubble.
- [ ] Summary-first + footer button: 1 summary bubble + settings; report opens from footer.
- [ ] Summary-first + append bubble: 2 carousel bubbles + settings when `reportUrl` present.
- [ ] Report insert fails: scan still succeeds; Flex uses parsed text only (`reportPayload` null).

---

## Phase 2.4 — Rollout instrumentation (logs)

Structured **JSON lines** on stdout (grep / log drain). **Never** logs full `publicToken` or LINE `userId` — only **8-char prefixes** where applicable (`safeTokenPrefix` / `safeLineUserIdPrefix`). **Do not** log full report URLs (they contain the token).

**Phase 2.5 — analysis:** **`docs/REPORT_ROLLOUT_ANALYSIS.md`**.  
**Phase 2.6 — execution runbook:** **`docs/REPORT_ROLLOUT_RUNBOOK.md`** (staging/prod steps, grep, rollback, review template).

### Event schema (`schemaVersion`: **3** — older lines may show `1` or `2`)

| Event | When | Key fields |
|-------|------|------------|
| `SCAN_RESULT_FLEX_ROLLOUT` | After successful `replyFlex` for a scan | `flexPresentationMode`, bubble counts, `hasReportLink`, `reportLinkPlacement`, `hasObjectImage`, `scanAccessSource`, `summaryFirstBuildFailed`, `lineUserIdPrefix`, `envFlexScanSummaryFirst`, `envFlexSummaryAppendReportBubble`, **`nodeEnv`**, **`rolloutWindowLabel`** (v3) |
| `SCAN_RESULT_TEXT_FALLBACK` | Flex send failed; text reply used | `lineUserIdPrefix`, env flex flags, **`nodeEnv`**, **`rolloutWindowLabel`** (v3) |
| `REPORT_PUBLIC_OK` | Public report row + link persisted | `hasObjectImage`, `hasReportLink`, flex env flags, token prefixes, **`nodeEnv`**, **`rolloutWindowLabel`** (v3) |
| `REPORT_PUBLIC_FAIL` | Public report persist error | `schemaVersion`, **`nodeEnv`**, **`rolloutWindowLabel`**, safe prefixes, error fields |
| `REPORT_PAGE_OPEN` | `GET /r/:publicToken` response | `outcome`, `httpStatus`, `loadSource`, `hasObjectImage`, `reportVersion`, `isDemoToken`, `tokenPrefix`, **`nodeEnv`**, **`rolloutWindowLabel`** (v3) |
| `FLEX_SUMMARY_FIRST` | Summary-first Flex JSON built | `flexPresentationMode`, `hasReportPayload`, `hasReportUrl`, `appendReportBubble` |
| `PERSONA_ANALYTICS` `preview_shown` | Free-tier scan result (existing pipeline) | `scanDeliveryMode`, `bubbleCount`, `flexPresentationMode`, `flexMode`, `hasReportLink`, `reportLinkPlacement`, `hasObjectImage` (+ existing `userId` for persona AB — keep DB policies in mind) |

`REPORT_HTTP` / `REPORT_LOOKUP` lines are unchanged for backward compatibility.

### Manual analysis checklist (staging / prod)

See **`docs/REPORT_ROLLOUT_ANALYSIS.md`** (cohorts, grep) and **`docs/REPORT_ROLLOUT_RUNBOOK.md`** (execution steps, time-buckets, rollback, post-review template).

### Known limitations (instrumentation)

- **No per-user journey join key** in logs (by design — privacy). Use time-bucketed ratios, not per-token joins.
- **`preview_shown` still includes `userId`** for existing persona A/B increment; rollout fields are additive.
- **Bots** may inflate `REPORT_PAGE_OPEN`; consider IP / UA rules at the edge later (not implemented here).
- **Correlation** `REPORT_PUBLIC_OK` ↔ `REPORT_PAGE_OPEN` is approximate without a privacy-safe id.

---

## Known limitations

- **Flex:** Summary-first omits the long “reading” and “usage” carousel bodies; full detail remains on the HTML report only.
- **Images:** Very tall/narrow originals are cropped in the hero (by design); true “contain” layout would need a deliberate UI change.
- **Retention:** No automatic deletion is implemented in-app; ops must configure Storage lifecycle or jobs.
- **Analytics:** For `accessSource === "free"`, `preview_shown` includes `bubbleCount`, `flexPresentationMode`, `flexMode`, and `scanDeliveryMode` (Phase 2.4).
