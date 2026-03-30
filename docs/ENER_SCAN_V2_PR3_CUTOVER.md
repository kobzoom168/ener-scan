# Ener Scan V2 — PR3 Redis, cutover hardening, queue safety

PR3 makes **Redis first-class** when `REDIS_URL` is set, tightens **sync fallback**, adds **queue/DLQ visibility**, and **concrete canary thresholds** (env-tunable).

## Redis (`src/redis/scanV2Redis.js`)

| Capability | Use |
|------------|-----|
| `pingScanV2Redis` | `/health/scan-v2`, ops checks |
| `tryDedupeOnce` | Webhook ingest: collapse duplicate LINE `line_message_id` races (90s window) |
| `setDeliveryRateBackoffMs` / `getDeliveryRateBackoffMs` | After LINE 429, hint delivery worker to wait before next send |
| `incrementLine429CanaryCounter` / `getLine429CanaryCountHour` | Hourly bucket for 429 rate vs canary max |
| `acquireShortLock` / `releaseShortLock` | Available for future mutual exclusion (TTL-bound) |
| `startWorkerHeartbeatLoop` | Scan / delivery / maintenance workers refresh `ener-scan:v2:hb:*` |

Prefix: `SCAN_V2_REDIS_PREFIX` (default `ener-scan:v2:`).

## Feature flags

| Variable | Default | Meaning |
|----------|---------|---------|
| `ENABLE_ASYNC_SCAN_V2` | `false` | Async path (storage + `scan_jobs` + workers). **Preferred default when cut over.** |
| `ENABLE_SYNC_SCAN_FALLBACK` | `false` | If async **ingest** fails, allow legacy `runScanFlow`. **Emergency only** — set `true` during partial outages. |
| `REDIS_URL` | unset | When set, full Redis behavior above; when unset, DB remains source of truth and Redis helpers no-op or use safe defaults. |

**Recommended production:** `ENABLE_ASYNC_SCAN_V2=true`, `ENABLE_SYNC_SCAN_FALLBACK=false`, `REDIS_URL` set.

## Canary thresholds (env)

Concrete defaults in `src/config/env.js`; override without code change:

| Variable | Default | Meaning |
|----------|---------|---------|
| `CANARY_QUEUE_BACKLOG_MAX` | `500` | Combined `scan_jobs` queued + `outbound_messages` queued + `retry_wait` — maintenance logs `alerts.backlog_high` |
| `CANARY_LINE_429_RATE_MAX_PER_HOUR` | `120` | Redis counter `ener-scan:v2:canary:line429:YYYY-MM-DDTHH` — maintenance logs `alerts.line429_high` |
| `CANARY_DELIVERY_SUCCESS_RATE_MIN` | `0.95` | Documented for ops / dashboards (ratio not computed in-app) |
| `CANARY_REPORT_PUBLISH_SUCCESS_RATE_MIN` | `0.98` | Compare `SCAN_V2_REPORT_PUBLIC_OK` vs `SCAN_V2_REPORT_PUBLIC_FAIL` in logs |

## Stuck job recovery

- **Outbound** `sending` stale &gt; 5 minutes → `retry_wait` (existing).
- **Scan** `processing` with `locked_at` older than `SCAN_V2_STALE_PROCESSING_MS` (default 15 minutes) → back to `queued` with `error_message=requeued_stale_processing`.

## Dead-letter visibility

- `outbound_messages.status in ('dead','failed')` surfaced in maintenance JSON log and `npm run scanV2:queue-health`.
- **Replay (manual):** `npm run scanV2:replay-outbound -- <uuid>` — only `dead` or `failed`.

## Rollback paths

1. **Disable async scan (full legacy path):** `ENABLE_ASYNC_SCAN_V2=false`, restart web. Optionally `ENABLE_SYNC_SCAN_FALLBACK=true` temporarily if ingest is flaky.
2. **Keep async but allow sync on ingest failure:** `ENABLE_SYNC_SCAN_FALLBACK=true` (incident mode).
3. **Workers off:** stop scan/delivery workers; queue grows — use health script and DB inspection; re-enable workers after fix.

## Health endpoints

- `GET /health` — liveness.
- `GET /health/scan-v2` — Redis ping + async/fallback flags.

## Lockover candidate checklist

- [ ] `REDIS_URL` set; `/health/scan-v2` shows `redis.ok: true`.
- [ ] Workers running with heartbeats (optional Redis `KEYS ener-scan:v2:hb:*` or monitor).
- [ ] Maintenance worker running; no sustained `alerts.backlog_high` / `line429_high`.
- [ ] `ENABLE_SYNC_SCAN_FALLBACK=false` in steady state.
