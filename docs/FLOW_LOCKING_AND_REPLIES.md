# Flow locking + Thai reply variants

## Priority (text)

1. `awaiting_slip` — any non–payment-command text → slip reminder variants (no history/menu/scan jump).
2. `pending_verify` — lock reminder, or payment-again text, or **utility routing** (history/stats/menu/สแกนพลังงาน/เปลี่ยนวันเกิด/วิธีใช้) before birthdate lock.
3. `awaitingBirthdateUpdate` — profile birthdate change subflow.
4. `waiting_birthdate` — `session.pendingImage` + not `awaiting_slip`; if DB row `awaiting_payment` → slip reminder; else birthdate parse / guidance / change-birthdate.

## Non-scan copy

- `src/utils/replyVariant.util.js` — `pickVariant(userId, type, variants)` + in-memory last index.
- `src/config/replyVariants.th.js` — variant strings (no emoji/icons).
- `src/utils/replyCopy.util.js` — composed messages (birthdate example line, payment ref line).

## Before scan ack

After valid birthdate while `waiting_birthdate`, the **before_scan** line is sent with **`client.pushMessage`** (same webhook event cannot `reply` twice with one `replyToken`). **Scan result** is sent later by **`worker-delivery`** (push/flex from `outbound_messages`), not inline in the webhook. If push fails, scan continues.

## Remaining edge cases

- **Push vs reply order**: push may rarely arrive after the scan reply depending on latency.
- **pending_verify + pendingImage**: non-utility text still gets verify reminder (birthdate for scan is blocked until verify completes).
- **Paywall / QR intro** (`buildPaymentQrIntroText`, flex titles): still older marketing copy; only fallback paywall + slip/pending/approved intros were variantized where wired.
