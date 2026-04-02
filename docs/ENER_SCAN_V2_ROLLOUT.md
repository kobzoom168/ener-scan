# Ener Scan V2 — async queue rollout

**Final migration plan (wave 2+, PR split, DoD, idempotency/DLQ, canary gates):**  
→ [`ENER_SCAN_V2_FINAL_MIGRATION_PLAN.md`](./ENER_SCAN_V2_FINAL_MIGRATION_PLAN.md)

**PR3 — Redis, cutover hardening, queue safety, canary numbers:**  
→ [`ENER_SCAN_V2_PR3_CUTOVER.md`](./ENER_SCAN_V2_PR3_CUTOVER.md)

## Current architecture (production)

End-to-end path for scan images (no inline deep scan in webhook):

1. **`lineWebhook`** — validate image / birthdate, call **`ingestScanImageAsyncV2`** when `ENABLE_ASYNC_SCAN_V2=true` (upload + `scan_jobs` + optional `outbound_messages` for pre_scan_ack).
2. **`worker-scan`** — claims `scan_jobs`, runs **`processScanJob`** (deep scan, `scan_results_v2`, report publish into **`report_publications`** / related tables as implemented).
3. **`worker-delivery`** — claims **`outbound_messages`**, sends LINE (pre_scan_ack, **`scan_result`** flex/text via `deliverOutbound.service.js` + flex builders).
4. **`worker-maintenance`** — queue health, stale requeue, sweeps, canary-style alerts.

**Removed from runtime:** synchronous `runScanFlow` / `replyScanResult`, legacy webhook inline scan, and env flags `ENABLE_SYNC_SCAN_FALLBACK`, `ENABLE_LEGACY_WEB_INLINE_SCAN`, `ALLOW_LEGACY_SCAN_PATHS` (no longer read by code).

## Feature flags (scan path)

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_ASYNC_SCAN_V2` | `false` | When `true`, image + saved birthdate path uses storage + `scan_jobs` + `outbound_messages` + workers (required for production scan flow). |
| `REDIS_URL` | unset | When set, Scan V2 uses Redis for dedupe windows, LINE rate hints, 429 canary counter, worker heartbeats. |

Keep `ENABLE_ASYNC_SCAN_V2=false` until migration `sql/022_ener_scan_v2_async_queue.sql` is applied and Supabase Storage bucket exists.

## Required setup

1. Run `sql/022_ener_scan_v2_async_queue.sql` on Postgres (Supabase SQL editor).
2. Create Storage bucket named by `SCAN_V2_UPLOAD_BUCKET` (default `scan-uploads`), service-role upload + public read as needed.
3. Deploy **web** (`node src/app.js`) with `ENABLE_ASYNC_SCAN_V2=true`.
4. Deploy **workers** as separate Railway services (or processes):

| Process | Env | Command |
|---------|-----|---------|
| Scan | `ENABLE_SCAN_WORKER=true` | `node src/workers/scanWorker.js` |
| Delivery | `ENABLE_DELIVERY_WORKER=true` | `node src/workers/deliveryWorker.js` |
| Maintenance | `ENABLE_MAINTENANCE_WORKER=true` | `node src/workers/maintenanceWorker.js` |

Shared env: `SUPABASE_*`, `CHANNEL_*`, `OPENAI_API_KEY`, optional `REDIS_URL`.

## Phases (implementation status)

1. **Foundation** — migrations, `src/stores/scanV2/*`, `src/storage/scanUploadStorage.js`, RPC claim functions.
2. **Webhook ingestion** — `ingestScanImageAsyncV2` behind `ENABLE_ASYNC_SCAN_V2` (async only; legacy sync path removed).
3. **Scan worker** — `processScanJob` (object check, `runDeepScan`, `scan_results_v2`, enqueue `scan_result` outbound, report publish).
4. **Delivery worker** — claims outbound rows; sends pre-scan ack + flex/text result; quota rules as implemented.
5. **State migration** — `conversation_state` table reserved; in-memory session still authoritative until further wiring.
6. **Ongoing** — publication SSOT / `LINE_FINAL_DELIVERY_MODE` evolution tracked separately (not part of legacy inline removal).

## Priority & backoff

Defined in `src/stores/scanV2/outboundPriority.js` (scan_result &lt; approve &lt; payment_qr &lt; pre_scan_ack; backoff steps for 429).

## Degraded operation

- **`ENABLE_ASYNC_SCAN_V2=false`:** webhook does not run async ingest; users get the documented “scan temporarily unavailable” style replies — **there is no fallback to inline deep scan** (removed).
- **Ingest failure:** user receives retry guidance; no synchronous scan execution.
- **Workers off:** queues accumulate; restart workers after fixing infra.

**Ops:** `npm run scanV2:queue-health`, `GET /health/scan-v2` (Redis + `ENABLE_ASYNC_SCAN_V2` only). See [`ENER_SCAN_V2_PR3_CUTOVER.md`](./ENER_SCAN_V2_PR3_CUTOVER.md).
