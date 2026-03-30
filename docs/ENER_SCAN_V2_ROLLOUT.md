# Ener Scan V2 — async queue rollout

**Final migration plan (wave 2+, PR split, DoD, idempotency/DLQ, canary gates):**  
→ [`ENER_SCAN_V2_FINAL_MIGRATION_PLAN.md`](./ENER_SCAN_V2_FINAL_MIGRATION_PLAN.md)

**PR3 — Redis, cutover hardening, queue safety, canary numbers:**  
→ [`ENER_SCAN_V2_PR3_CUTOVER.md`](./ENER_SCAN_V2_PR3_CUTOVER.md)

## Feature flag

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_ASYNC_SCAN_V2` | `false` | When `true`, image + saved birthdate path uses storage + `scan_jobs` + `outbound_messages` instead of inline `runScanFlow`. |
| `ENABLE_SYNC_SCAN_FALLBACK` | `false` | When `true` **and** async ingest fails, fall back to legacy `runScanFlow`. **Emergency only** — default off for production cutover. |
| `REDIS_URL` | unset | When set, Scan V2 uses Redis for dedupe windows, LINE rate hints, 429 canary counter, worker heartbeats. |

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
2. **Webhook ingestion** — `ingestScanImageAsyncV2` behind `ENABLE_ASYNC_SCAN_V2`. Sync fallback only if `ENABLE_SYNC_SCAN_FALLBACK=true` (incident).
3. **Scan worker** — `processScanJob` (object check, `runDeepScan`, `scan_results_v2`, enqueue `scan_result` outbound).
4. **Delivery worker** — push pre-scan ack + flex/text result; quota decrement after successful `scan_result` delivery.
5. **State migration** — `conversation_state` table reserved; in-memory session still authoritative until Phase 5 wiring.
6. **Cleanup** — remove legacy synchronous path when V2 is stable; extend HTML report publishing in worker.

## Priority & backoff

Defined in `src/stores/scanV2/outboundPriority.js` (scan_result &lt; approve &lt; payment_qr &lt; pre_scan_ack; backoff steps for 429).

## Rollback

Set `ENABLE_ASYNC_SCAN_V2=false` and restart web only; workers can stay off. Existing users fall back to `runScanFlow`.

**Ingest failure without sync:** With `ENABLE_SYNC_SCAN_FALLBACK=false` (default), failed async ingest does **not** run `runScanFlow`; user gets a short reply to retry. For emergency inline scan, set `ENABLE_SYNC_SCAN_FALLBACK=true` temporarily.

**Ops:** `npm run scanV2:queue-health`, `GET /health/scan-v2` (Redis + flags). See [`ENER_SCAN_V2_PR3_CUTOVER.md`](./ENER_SCAN_V2_PR3_CUTOVER.md).
