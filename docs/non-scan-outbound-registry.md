# Non-scan outbound registry (LINE)

Audit goal: **non-scan text** should go through `nonScanReply.gateway` so duplicate suppression and gateway telemetry apply. Exceptions are **scan delivery** (worker + `scanPathEnter`/`scanPathExit`), **transport inside gateway**, or **registered audit exempts**.

## Classification summary

| Location | Channel | Class |
|----------|---------|--------|
| `nonScanReply.gateway.js` | `replyText`, `replyPaymentInstructions`, `pushText` | **Inside gateway** (intended) |
| `lineReply.service.js` | `replyText`, `replyFlex`, `replyPaymentInstructions` | **Transport** — called from gateway/scan-path/exempt only |
| `lineSequenceReply.service.js` | `pushText`, `replyTextSequenceOrSingle` | **Transport** — `pushText` warned when bypass suspect |
| `lineWebhook.js` | `replyText` (no `userId`) | **Valid exempt** — `AuditExemptReason` (cannot scope gateway) |
| `lineWebhook.js` | `replyText` (webhook error, no user) | **Valid exempt** — `AuditExemptReason` |
| `deliverOutbound.service.js` / `worker-delivery` | `pushMessage` / flex for `scan_result`, `pre_scan_ack`, etc. | **Scan-path exempt** — `scanPathEnter`/`scanPathExit` around LINE sends |
| `sendNonScanReply` / `sendNonScanSequenceReply` | Gateway | **Gateway** |

> **Note:** `src/handlers/scanFlow.handler.js` was removed. Scan results are delivered asynchronously via `outbound_messages` + delivery worker.

## Audit exempt reasons (`NONSCAN_AUDIT_EXEMPT`)

Registered in `AuditExemptReason` / `ALL_AUDIT_EXEMPT_REASONS` (`lineReplyAudit.context.js`):

- `line_webhook_missing_user_id` — `handleEvent` when LINE omits `userId`.
- `line_webhook_event_error_no_user` — fatal per-event handler, no `userId` on error reply.
- `scan_payment_gate_no_user_id` — payment gate fallback text when `userId` missing.

Introducing a new exempt path: add a constant here, use `auditExemptEnter(thatReason)`, update this doc, and extend `tests/lineReplyAudit.context.test.js`. Set `NONSCAN_AUDIT_EXEMPT_STRICT=1` in CI to fail on unregistered reasons.

## Environment

- `NONSCAN_REPLY_AUDIT=warn` — log `NONSCAN_REPLY_BYPASS_SUSPECT` / `NONSCAN_PUSH_BYPASS_SUSPECT` when suspicious (`env.NONSCAN_REPLY_AUDIT`).
- `NONSCAN_AUDIT_EXEMPT_STRICT=1` — `env.NONSCAN_AUDIT_EXEMPT_STRICT`: throw on unregistered `auditExemptEnter` reason (use in CI when tightening exempt set).

## Payment lifecycle telemetry (production)

See **`docs/payment-funnel-telemetry.md`** for canonical `PAYMENT_FUNNEL_TRANSITION` steps and correlation fields.

Legacy mirror event names still appear in logs; prefer filtering by `step` or `PAYMENT_FUNNEL_TRANSITION`.
