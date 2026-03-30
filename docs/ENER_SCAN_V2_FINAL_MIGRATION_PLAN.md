# Ener Scan V2 — Final migration plan (wave 2+)

This document is the **execution plan after wave 1** (async queue core: `sql/022`, ingestion, scan/delivery workers, feature-flagged webhook). It is **not** a redesign: remaining work is **migration hardening** toward a single outbound path and DB-backed truth.

**Related:** operational canary steps → [`ENER_SCAN_V2_ROLLOUT.md`](./ENER_SCAN_V2_ROLLOUT.md).

**PR1 (outbound unification):** Admin approve/reject/free-reset and pending-intro flush **enqueue** `outbound_messages`; **delivery worker** sends via `deliverOutbound.service.js` (`approve_notify`, `reject_notify`, `payment_qr`, `pending_intro`). Payload contracts: `src/services/scanV2/outboundPayload.contracts.js`. Enqueue helpers: `src/services/scanV2/outboundAdminEnqueue.service.js`.

---

## Decision record

| Question | Answer |
|----------|--------|
| Canary ready? | **Yes** — enable `ENABLE_ASYNC_SCAN_V2` + workers + storage when DB/bucket are ready. |
| Final lockover? | **Not yet** — do not announce “V2 only” until DoD below is met. |
| Nature of remaining work? | **Hardening** (unify outbound, dual-write state, report wiring, Redis, cutover) — not new architecture discovery. |

**Recommended execution priority (fastest path, lowest risk):**

1. **Outbound unification** — all LINE sends of the listed kinds go through `outbound_messages` + delivery worker.  
2. **conversation_state dual-write** — DB write every time; read DB first, memory fallback until stable.  
3. **Report publish in V2 scan worker** — report-first product direction requires full artifact on worker path.  
4. **Redis first-class** — locks, rate hints, dedupe window, heartbeat for ~30 concurrent scans comfortably.  
5. **Cut sync fallback last** — only after 1–4 are stable (`ENABLE_SYNC_SCAN_FALLBACK=false` or remove legacy path).

---

## PR strategy (suggested)

| PR | Scope | Outcome |
|----|--------|---------|
| **PR 1 — Outbound unification** | Approve notify, pending intro, payment QR, reject notify → `outbound_messages`; extend delivery worker + metrics/logs; admin/payment routes enqueue instead of raw push where applicable. | “LINE outbound from one pipeline” for product-critical notifies. |
| **PR 2 — State + report + Redis** | `conversation_state` dual-write; wire HTML/public report publish in V2 `processScanJob`; Redis client + locks/rate/dedupe/heartbeat; tighten fallback behavior (still allow sync emergency if flag exists). | Truth + artifacts + scale controls. |
| **PR 3 — Cutover & cleanup** | `ENABLE_SYNC_SCAN_FALLBACK=false` (or remove path); delete dead legacy bypass; small PR, easy revert. | Final lockover candidate after metrics gate. |

---

## Execution order (detailed)

### 1) Outbound unification (highest ROI)

Unify first so fewer special cases bypass the queue.

**Include:**

- Approve notify  
- Pending intro / compensation flush  
- Payment QR (and related payment-facing text pushes)  
- Reject notify  

**Goal:** Delivery worker (or one shared sender module used only by worker) is the default path for these kinds; metrics and retry policy apply consistently.

**Implementation notes:**

- Extend `outbound_messages.kind` / `payload_json` if needed; keep priorities in `src/stores/scanV2/outboundPriority.js`.  
- Touch: `adminPaymentsDashboard.routes.js`, `adminApproveIntroCompensation.util.js`, `deliverOutbound.service.js`, any direct `notifyLineUserTextAfterAdminAction` call sites that should be queued.

---

### 2) conversation_state — dual-write

- **Write:** persist to `conversation_state` on every state change that matters (pending image ref, package key, reply-token spent, pending intro blob, etc.).  
- **Read:** prefer DB; if row missing, fall back to `session.store` once, then optionally backfill.  
- **Do not** delete `session.store` in PR 2 — cut over read path only after soak.

---

### 3) Report publish — V2 scan worker

- After `runDeepScan`, run the same report publish pipeline as the legacy path (public token, `scan_public_reports` / storage as applicable).  
- Fill `scan_results_v2.report_*` fields and pass `report_url` into outbound `scan_result` payload so Flex/summary matches product (report-first).

---

### 4) Redis — first-class

- Add runtime dependency (`ioredis` or `redis`) and `REDIS_URL` required in production for worker tiers (or document degrade mode).  
- Use for: short-lived worker locks, global/user send rate hints, dedupe windows, optional heartbeats.  
- Replace stub in `src/redis/scanV2Redis.js` with real client + health check.

---

### 5) Disable sync fallback (last)

- Only after PR 1–2 soak and canary gates pass.  
- Introduce explicit flag e.g. `ENABLE_SYNC_SCAN_FALLBACK` (default `true` during migration) → `false` when safe.  
- Remove or isolate `runScanFlow` from hot webhook path to emergency-only module.

---

## Additions to the checklist

### A. Idempotency keys

Prevent duplicate jobs/outbound rows on webhook replay or double-submit.

| Area | Suggested key |
|------|----------------|
| `scan_jobs` | Tie to stable inbound identity: e.g. `line_message_id` (unique per upload already on `scan_uploads`) or explicit `source_event_id` / webhook delivery id if stored. |
| `outbound_messages` | Composite uniqueness for enqueue: e.g. `(kind, related_job_id)` for job-scoped kinds, or `dedupe_key` column filled with `kind + line_user_id + stable_id`. |

**Action:** add columns + partial unique indexes in a follow-up SQL migration (`023_*`), and set keys in enqueue helpers.

---

### B. Dead-letter policy (explicit)

| Stream | Behavior |
|--------|----------|
| **Outbound** | Rows in `status = dead` (or equivalent) must be **visible in admin** (list/filter by kind, user, reason). **Replay** = re-queue with new attempt budget or single-shot replay action. |
| **Scan jobs** | Failed jobs **replay** from admin or CLI with reason code; no silent drop. |
| **Reason codes** | Standardize: `line_429`, `object_validation_failed`, `deep_scan_failed`, `storage_read_failed`, `max_attempts`, `stale_sending`, etc. |

---

### C. Canary success criteria (before lock)

Tune **X / Y / Z** per environment; start conservative.

| Metric | Gate (example placeholders — **tune in prod**) |
|--------|-----------------------------------------------|
| Queue backlog | p95 time from `SCAN_JOB_QUEUED` → `SCAN_JOB_DELIVERY_ENQUEUED` **≤ X minutes** (e.g. 5–10). |
| 429 rate | `LINE_RATE_LIMIT_HIT` / outbound attempts **≤ Y%** (e.g. &lt; 5% over 24h). |
| Scan result delivery | `OUTBOUND_SEND_SUCCESS` for `scan_result` **> Z%** (e.g. &gt; 99% excluding user blocks). |
| Quota integrity | **Zero** `QUOTA_DECREMENT_*` when `OUTBOUND_SEND_SUCCESS` did not occur for that job (audit log). |

**Logs to watch:** `SCAN_JOB_QUEUED`, `SCAN_JOB_CLAIMED`, `SCAN_JOB_DELIVERY_ENQUEUED` / `SCAN_JOB_FAILED`, `OUTBOUND_SEND_SUCCESS`, `LINE_RATE_LIMIT_HIT`, `QUOTA_DECREMENT_AFTER_DELIVERY_OK`.

---

## Definition of Done — “Ener Scan V2 locked”

Before announcing full lockover, all **six** must hold:

1. Scan image webhook **does not** call deep scan inline (except documented emergency path).  
2. Final scan result **only** via delivery queue (push-first).  
3. Paid quota **only** decrements after **successful** delivery (already directionally true in V2 delivery path — keep audits).  
4. Important state **does not** use `session.store` as sole source of truth.  
5. Approve / reject / payment notifications **all** go through `outbound_messages`.  
6. No production-critical path relies on **raw push/reply** that bypasses the queue (except explicitly documented reply-token replies if product requires).

---

## Rollback (summary)

| Action | Effect |
|--------|--------|
| `ENABLE_ASYNC_SCAN_V2=false` | Webhook uses legacy `runScanFlow` again; queued rows remain in DB for inspection. |
| Stop workers | No new claims; queues drain when workers restart. |
| Revert PR 3 only | Restores fallback without undoing schema. |

---

## Key files (living list)

| Area | Files |
|------|--------|
| Webhook / sync fallback | `src/routes/lineWebhook.js`, `src/handlers/scanFlow.handler.js` |
| V2 ingest / scan / delivery | `src/services/scanV2/*.js`, `src/workers/*.js` |
| Outbound DB | `src/stores/scanV2/outboundMessages.db.js`, `sql/022_*.sql`, future `023_*` idempotency/DLQ |
| Admin / notify | `src/routes/adminPaymentsDashboard.routes.js`, `src/utils/adminApproveIntroCompensation.util.js`, `src/utils/lineNotify429Retry.util.js` |
| Session | `src/stores/session.store.js` → `conversation_state` repos |
| Redis | `src/redis/scanV2Redis.js` |
| Env | `src/config/env.js` |

---

*Last updated: aligns with wave-1 implementation + stakeholder priority: **outbound unification → conversation_state dual-write → report publish → Redis → cutover**.*
