# Ener Scan V2 — PR3 Redis, cutover hardening, queue safety

PR3 makes **Redis first-class** when `REDIS_URL` is set, adds **queue/DLQ visibility**, and **concrete canary thresholds** (env-tunable). Legacy sync scan fallback has been **removed** from code (not merely disabled).

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

## Feature flags (scan path)

| Variable | Default | Meaning |
|----------|---------|---------|
| `ENABLE_ASYNC_SCAN_V2` | `false` | Async path (storage + `scan_jobs` + workers). **Required for production scan flow.** |
| `REDIS_URL` | unset | When set, full Redis behavior above; when unset, DB remains source of truth and Redis helpers no-op or use safe defaults. |

**Recommended production:** `ENABLE_ASYNC_SCAN_V2=true`, `REDIS_URL` set.

> **Note:** `ENABLE_SYNC_SCAN_FALLBACK`, `ENABLE_LEGACY_WEB_INLINE_SCAN`, and `ALLOW_LEGACY_SCAN_PATHS` were removed from the application; do not set them in Railway.

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
- **Scan** `processing` with `locked_at` older than `SCAN_V2_STALE_PROCESSING_MS` (default 15 minutes) → back to `queued` with `error_message=requeued_stale_processing`. Each requeued job logs **`SCAN_JOB_STALE_REQUEUED`** (job id prefix, cutoff, previous `locked_at`) plus a batch summary — use during canary to spot false positives from slow-but-valid scans.

## Dead-letter visibility

- `outbound_messages.status in ('dead','failed')` surfaced in maintenance JSON log and `npm run scanV2:queue-health`.
- **Replay (manual):** `npm run scanV2:replay-outbound -- <uuid>` — **only** `dead` or `failed`. Conditional `UPDATE … WHERE status IN (dead,failed)` prevents overwriting `sent` / in-flight rows; explicit refusal if status is `sent` or `queued`/`sending`/`retry_wait`.

## Ingest dedupe (Redis)

- Key: `scan_v2:ingest:line_message_id:<LINE message id>` — one key per inbound LINE message (not per user), so unrelated events are never collapsed together.

## Degraded operation (no inline fallback)

1. **Disable async ingest:** `ENABLE_ASYNC_SCAN_V2=false`, restart web — users get unavailable/retry messaging; **no** inline deep scan (legacy path removed).
2. **Workers off:** stop scan/delivery workers; queue grows — use health script and DB inspection; re-enable workers after fix.

## Health endpoints

- `GET /health` — liveness.
- `GET /health/scan-v2` — JSON: `status`, `redis` ping, and `flags: { ENABLE_ASYNC_SCAN_V2 }` only (see `src/app.js`).

## Final canary (before declaring lockover)

Do **not** flip to “permanent V2 only” until this soak passes.

**Env (production candidate):**

- `ENABLE_ASYNC_SCAN_V2=true`
- `ENABLE_SCAN_WORKER=true`
- `ENABLE_DELIVERY_WORKER=true`
- `ENABLE_MAINTENANCE_WORKER=true`

**Checks:**

- [ ] `GET /health/scan-v2` — Redis up + `flags.ENABLE_ASYNC_SCAN_V2` as expected.
- [ ] Run **5–10 real scans**; watch queue backlog, Redis 429/hour, delivery success, report publish (`SCAN_V2_REPORT_PUBLIC_*` logs), and **`SCAN_JOB_STALE_REQUEUED`** (should be rare; if frequent, increase `SCAN_V2_STALE_PROCESSING_MS` or investigate slow workers).

## Lockover candidate checklist

- [ ] `REDIS_URL` set; `/health/scan-v2` shows `redis.ok: true`.
- [ ] Workers running with heartbeats (optional Redis `KEYS ener-scan:v2:hb:*` or monitor).
- [ ] Maintenance worker running; no sustained `alerts.backlog_high` / `line429_high`.
- [ ] No legacy sync env vars present in deployment (`ENABLE_SYNC_SCAN_FALLBACK` / `ENABLE_LEGACY_WEB_INLINE_SCAN` / `ALLOW_LEGACY_SCAN_PATHS` removed).
