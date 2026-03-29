# Ener Scan V2 — async queue rollout

## Feature flag

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_ASYNC_SCAN_V2` | `false` | When `true`, image + saved birthdate path uses storage + `scan_jobs` + `outbound_messages` instead of inline `runScanFlow`. |

Keep `false` until migration `sql/022_ener_scan_v2_async_queue.sql` is applied and Supabase Storage bucket exists.

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
2. **Webhook ingestion** — `ingestScanImageAsyncV2` behind `ENABLE_ASYNC_SCAN_V2` (fallback to sync `runScanFlow` on failure).
3. **Scan worker** — `processScanJob` (object check, `runDeepScan`, `scan_results_v2`, enqueue `scan_result` outbound).
4. **Delivery worker** — push pre-scan ack + flex/text result; quota decrement after successful `scan_result` delivery.
5. **State migration** — `conversation_state` table reserved; in-memory session still authoritative until Phase 5 wiring.
6. **Cleanup** — remove legacy synchronous path when V2 is stable; extend HTML report publishing in worker.

## Priority & backoff

Defined in `src/stores/scanV2/outboundPriority.js` (scan_result &lt; approve &lt; payment_qr &lt; pre_scan_ack; backoff steps for 429).

## Rollback

Set `ENABLE_ASYNC_SCAN_V2=false` and restart web only; workers can stay off. Existing users fall back to `runScanFlow`.
