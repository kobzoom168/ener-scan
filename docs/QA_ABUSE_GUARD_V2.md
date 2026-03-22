# QA: Abuse Guard v2 (scan vs payment locks)

Manual QA on **real LINE** is required; this doc records **code-level verification** and a **repeatable test matrix**.

## Static verification (code review)

| # | Criterion | Result | Where |
|---|-----------|--------|--------|
| 1 | **Separate locks** — scan abuse affects `scanLockUntil`; payment/slip affects `paymentLockUntil` | Pass | `src/stores/abuseGuard.store.js` — `maybeApplyScanLock` / `maybeApplyPaymentLock` |
| 2 | **Scan lock does not block slip uploads** | Pass | `handleImageMessage`: if `imageWillUseSlipPath` (`!allowed && pendingPayment`), only `checkPaymentAbuseStatus` runs; **not** `checkScanAbuseStatus` (`src/routes/lineWebhook.js`) |
| 3 | **Payment lock does not block normal scan** | Pass | Same routing: non–slip-path images use **scan** gate only; payment lock is not evaluated on scan route at image entry |
| 4 | **Birthdate → `runScanFlow` under scan lock** | Pass | After valid birthdate with `session.pendingImage`, `checkScanAbuseStatus` runs; if `isLocked`, reply `ABUSE_MSG_SCAN_LOCK` and **no** `runScanFlow` (`gate: "pendingImage_birthdate_text"` in logs) |
| 5 | **Slip path in `finalizeAcceptedImage`** | Pass | Same condition as routing: `!accessDecision?.allowed && pendingPayment`; payment lock checked again before slip / `pending_verify` handling |

**Note:** `finalizeAcceptedImage` runs **`registerScanIntent` only on the scan branch** (after slip branches return). Slip uploads do not increment scan intent windows for the main scan pipeline.

**Note:** Immediate scan with **saved birthdate** in the same webhook as the image does not re-check scan lock before `runScanFlow` — the same request already passed `handleImageMessage` scan gating for scan-route images.

---

## Manual tests (LINE)

Use a **test OA** and tail server logs (grep `ABUSE_GUARD`).

### A — Scan lock (abuse scan side only)

1. Trigger scan-heavy behavior until `scanSpamScore` / temp scan lock applies (see store thresholds).
2. Send a **normal scan image** (user **not** on slip path: paid access, or free tier without awaiting payment row).
3. **Expect:** reply with scan lock copy (`ABUSE_MSG_SCAN_LOCK`); log `[ABUSE_GUARD_SCAN_LOCK]` on **scan** route (no `gate` on image handler scan branch, or filter `[ABUSE_GUARD_SCAN_STATUS]` without `gate` for slip).

### B — Slip not blocked by scan lock

1. Put test user in **slip path**: e.g. `awaiting_payment` / pending payment row, no scan access.
2. Induce **scan lock** on that user (e.g. from another context if you can reset state per env — or use a second account for scan abuse, then align DB state — **adjust to your staging setup**).
3. Send **slip image** on the payment/slip path.
4. **Expect:** slip path is gated by **payment** status only at image entry (`gate: "handleImageMessage_slip_route"`). If only scan is locked and payment is not, user should **not** get the scan-lock message for this image.

### C — Payment lock does not block scan-route images

1. Induce **payment lock** (payment/slip spam path).
2. Send image as **normal scan user** (access allowed or no pending payment — **not** slip path).
3. **Expect:** `[ABUSE_GUARD_SCAN_STATUS]` applies; **not** blocked by payment-only lock at image entry.

### D — Birthdate text after scan lock

1. Complete flow until `pendingImage` + instruction to type birthdate (no saved birthdate).
2. Apply **scan lock** (same user).
3. Send valid birthdate text.
4. **Expect:** `ABUSE_MSG_SCAN_LOCK`; logs `[ABUSE_GUARD_SCAN_STATUS]` with `gate: "pendingImage_birthdate_text"` and `[ABUSE_GUARD_SCAN_LOCK]` with same `gate`.

### E — Global hard block

1. Drive total score to hard block (or use test harness if you add one later).
2. **Expect:** any event hits `[ABUSE_GUARD_GLOBAL_STATUS]` / `[ABUSE_GUARD_HARD_BLOCK]` early; generic hard-block copy.

---

## Log review: clarity & duplication

### Tags in use (grep-friendly)

| Tag | Purpose |
|-----|---------|
| `[ABUSE_GUARD_GLOBAL_STATUS]` | Every event, early in `handleEvent` |
| `[ABUSE_GUARD_HARD_BLOCK]` | Hard block (various `source` / `gate`) |
| `[ABUSE_GUARD_SCAN_STATUS]` | Scan lock snapshot (image scan route, birthdate gate) |
| `[ABUSE_GUARD_SCAN_LOCK]` | User hit scan lock |
| `[ABUSE_GUARD_PAYMENT_STATUS]` | Payment lock snapshot |
| `[ABUSE_GUARD_PAYMENT_LOCK]` | User hit payment lock |
| `[ABUSE_GUARD_SCAN_ABUSE]` | Warnings from `registerScanIntent` |
| `[ABUSE_GUARD_PAYMENT_ABUSE]` | Warnings from payment/slip/payment-intent paths |
| `[ABUSE_GUARD_TEXT_SPAM]` | Text heuristics |
| `[ABUSE_GUARD_LOCKED_IMAGE_ACTIVITY]` | Activity while a lock was active (`recordLockedImageActivity`) |

### Duplication / noise

- **Slip image (happy path):** `[ABUSE_GUARD_PAYMENT_STATUS]` may appear **twice** for one image: once in `handleImageMessage` (`gate: "handleImageMessage_slip_route"`) and once in `finalizeAcceptedImage` (slip branch, **no `gate` field**). Same payload shape; second line is a **defense-in-depth** re-check before upload. When reading logs, filter by `userId` + timestamp or prefer lines with `gate` to see **where** the check ran.
- **`[ABUSE_GUARD_SCAN_STATUS]`:** can appear on **image** (scan route, no `gate`) and on **text** (`gate: "pendingImage_birthdate_text"`). Use `gate` to distinguish.
- **`[ABUSE_GUARD_GLOBAL_STATUS]`:** once per webhook event at the top — expected; not duplicated per sub-handler.

### Optional clarity tweak (later, not required)

Add `gate: "finalize_slip"` to the `finalizeAcceptedImage` slip-branch `[ABUSE_GUARD_PAYMENT_STATUS]` / `[ABUSE_GUARD_PAYMENT_LOCK]` logs to make duplicate payment-status lines easier to tell apart.

---

## Explicit reason bumps

`registerScanAbuse` / `registerPaymentAbuse` are **not** wired in production paths yet. Leave for a follow-up unless QA finds a gap that requires them.
