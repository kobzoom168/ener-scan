# Codex handoff — approval hardening (23 Sep 2026)

Base: `6660273` (code `e53ef94`), worktree `/tmp/ener-3tasks`, branch `release/three-tasks`.
No customer DB, staging/Pro config, webhook, or production deployment was changed.

## Changes

1. Approval config now requires `TELEGRAM_APPROVAL_BOT_TOKEN` and `TELEGRAM_APPROVAL_CHAT_ID`.
   No fallback to shared `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`. Old config alone leaves endpoint disabled.
2. All approval callers send the actual calculation inputs: package, amount, unlock hours, owner IDs, status.
   New migration 063 compares the entire JSON snapshot null-safely under the payment row lock.
   Telegram's operator snapshot is also checked before calculation and in the transaction.
   Existing grant retries still return without refilling previously consumed quota.
3. Notification stamping checks both RPC errors and boolean confirmation. A uniqueness exception alone
   cannot mark a grant notified: the DB function verifies an `approve_notify` row for that payment.
   Counters/logs report stamp failures honestly. Existing outbox remains the delivery retry owner.
4. Real PostgreSQL tests inject audit/outbox failures and verify rollback/recovery.
5. Nginx access-log snippet masks normalized owner/report token paths and omits query/referrer fields.
   No new location blocks; routing remains unchanged. This is a prepared/tested snippet, NOT an installed change.

## Verification commands (local disposable infrastructure only)

`node scripts/ops/test-payment-approval-db.mjs` requires a local container named
`ener-approval-codex-test`, postgres:16-alpine, network=none, no published ports.
The runner refuses a networked container, creates a dedicated synthetic database and drops it in finally.
Applies real migrations 061/062/063; production JS approval wrapper + sweeper use a SQL transport adapter.
It does NOT prove staging PostgREST schema reload or live Telegram transport.

Covered: idempotent migration; removal of old unsafe overload; audit failure rolls back payment/user/grant;
retry after usage; stale package/amount/hours/null/owner; five concurrent DB connections;
actual JS caller without operator expect; failed outbox creation -> sweep recovery; crash between enqueue
and stamp; no legacy notification; PUBLIC execution denied.

`node scripts/ops/test-private-token-nginx.mjs` starts nginx:alpine with network=none, no host ports.
Runs nginx -t and five HTTP requests through a proxy to a local fixture upstream;
plain/encoded token paths, query strings and Referer secrets are absent from access logs.
Removes only its own disposable container in finally.

`tests/paymentApprovalHardening.test.js` covers all-caller snapshot, operator snapshot mismatch,
RPC {error}/throw/false/null on stamp, and duplicate-key evidence checks.
Existing Telegram config test now proves shared bot credentials cannot enable approval.
Full gate: record actual run result in LOG; no test-baseline exemptions added.

## Staging handoff (not executed by Codex)

- Keep trial OFF and Telegram approval disabled. Do not setWebhook or send real slips.
- Stage only after reviewing exact new SHA. Apply 063 after 062 and reload PostgREST.
- Verify only the 10-argument approval RPC exists; old 9-argument overload must be absent.
- Verify RPC privileges, runtime hashes and rerun synthetic tests against staging's real schema.
- Do NOT redeploy e53ef94 after applying 063: that application uses the removed overload.
- Pro remains untouched; explicit owner GO and live acceptance are still required.

## Nginx ops handoff (separate approval for Pro)

Snippet: `ops/nginx/private-token-access-log.conf`. Include in existing http context, change ONLY the
existing target server's access_log format to `ener_private`; preserve location/proxy_pass/auth settings.
Inspect configuration with secrets redacted; check inherited/duplicate access_log directives.
Back up config, run nginx -t, reload staging only after approval, test existing routes/owner links,
and check new access logs using synthetic tokens. Roll back config if routing changes.
Do not paste full bearer URLs or existing logs into reports. This snippet addresses access logs only:
review error logs, upstream logs and APM separately for bearer URL exposure.
Existing logs are not erased; retention/revocation of exposed tokens needs a separate authorized plan.

## Product scope retained

No changes to same-package replacement/carry-over semantics. That remains an owner decision.
No backfill, customer entitlement edits, broadcast, bot creation or webhook changes.
