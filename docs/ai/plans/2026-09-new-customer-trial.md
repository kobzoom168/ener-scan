# Admin switch: new customers receive two lifetime free scans

Owner request: 16 September 2026. Implementation branch: `feature/new-customer-trial`.
Default OFF. No broadcast, staging deployment, production deployment, or customer data changes performed.

## Behavior

- `/admin/promo` links to `/admin/free-trial`, protected by existing admin authentication.
- OFF: existing `freeQuotaPerDay` applies (currently configured separately; not hardcoded to 1).
- ON: daily free allowance stops. Accounts with `app_users.created_at` at/after the FIRST activation qualify for two free jobs in total. Existing accounts receive no new grant. The cohort boundary survives OFF/ON and migration reapply.
- All non-bonus free jobs for eligible accounts count across days, including daily free jobs during an OFF interval. Turning the feature off/on cannot manufacture a fresh trial.
- Active paid entitlement retains priority. Previously granted referral/manual bonuses remain valid. Trial-mode bonuses are decremented atomically on job admission rather than a cached read-only snapshot.
- Non-failed jobs reserve trial slots. `failed` releases a slot; delivery does not. Held/delivering jobs keep their reservation. A sent cached result explicitly marked `skipQuotaDecrement` does not use another trial. Reservations with pending results produce a wait notice rather than a purchase demand.
- SQL locks the account row during free job insertion and reactivation from failed to prevent concurrent last-slot overspend even without Redis. Ingestion releases its Redis lock on insert errors.
- Gate checks policy via a synchronous RPC (no cold-start/background fallback to daily free). Exhausted trial images with no pending payment stop before objectCheck; payment/slip routing stays available.
- Quota replies, LIFF rights, admin rights, and customer facts use trial wording without promising a tomorrow reset.
- Admin requires CSRF token and explicit confirmation. Activation itself is manual: announce seven days ahead, then enable on the agreed date. No scheduler or broadcast sender included.

## Install and verify (not executed on staging/Pro)

1. Assemble a release from the desired runtime baseline. This feature branch starts at `1c307dc`, which includes W2 instrumentation previously held on staging. Do NOT deploy its whole ancestry to Pro automatically; select the feature commit into a reviewed release branch.
2. Apply `sql/057_new_customer_trial.sql` BEFORE starting new application code. It adds a job column, index, policy row (OFF), RPCs and an admission trigger; it does not backfill/update customer records. Functions use the existing server-side PostgREST roles. PostgREST must remain private; never expose its credentials in browser code.
3. Reapply once to verify idempotency and reload PostgREST schema. Confirm policy is OFF, cutoff null, and admin endpoint can read/save OFF. A missing migration intentionally fails entitlement reads closed.
4. Deploy staging only after reviewing the release set. Test authenticated admin ON/OFF, old/new/paid/bonus accounts, normal scan and rejected image, two simultaneous requests for the final slot, failed retry, held result, SHA/pHash cache replay, and pending payment/slip.
5. Check successful report delivery and quota copy in LINE/LIFF with real staging accounts. Unit/isolated SQL results are NOT live LINE smoke.
6. Production deployment and later activation require owner authorization. Broadcast is a separate authorized action. Keep OFF until the announced effective date.

## Verification performed locally

- `tests/newCustomerTrial.test.js`: six behavior tests: policy arithmetic, errors, trial copy, real checkScanAccess with injected DB responses, and actual localhost HTTP requests for admin authentication/CSRF/confirmation/save failure/ON/OFF. No AI calls.
- `scripts/ops/test-new-customer-trial-db.mjs`: real PostgreSQL 16 in a disposable network-isolated development container, using synthetic tables with the relevant runtime columns. Tests migration reapply, initial OFF, permanent first activation, old/new accounts, third-scan denial, paid/bonus handling, failed retry/reactivation, delivered reservation, explicit cache skip and two concurrent connections competing for the last slot. Synthetic database removed by finally.
- Full repository baseline gate run; final result recorded in LOG. Tests are not evidence that untested customer paths or deployment have passed.

## Scope notes

- Existing daily admin offset/reset does not refill lifetime trial. Paid-reset actions keep their existing meaning; use existing bonus tools for intentional compensation.
- No automatic stale-job expiry: a genuinely stuck non-failed job retains its slot until normal recovery or investigation, avoiding unbounded free calls.
- Bonus failure/refund semantics are not expanded in this feature; the new job insertion reservation prevents cached access from granting unlimited bonus jobs.
- Unrelated slip-login changes, notification opt-out bug, model changes and low_shadow operations are not included.
- Found and repaired a pre-existing `/admin/promo` render error: `upgradeCredit` was used but omitted from page arguments.

## Rollback

Disable the switch to return to the configured daily allowance without resetting trial history. For code rollback, disable first with the new admin UI/RPC, verify persisted OFF, then redeploy the previous code. Keep schema objects and cutoff/history; do not drop them or clear the policy row.
