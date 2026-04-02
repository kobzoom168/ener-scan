# QA — waiting for birthdate (LINE)

## Automated tests

```bash
npm test
```

File: `tests/birthdateParse.test.js`

Covers:

- CE `14/09/1995`, BE `14/09/2538` → CE `1995`, `14-9-2538`, invalid calendar `31/02/2538`
- `looksLikeBirthdateInput`: Thai keywords (`จ่ายเงิน`, `สแกนพลังงาน`, `ประวัติ`, `สถิติ`), `hello` → **false**; slash dates → **true**
- `เปลี่ยนวันเกิด` (Thai) → **not** a date attempt (`looksLike` false)

## BE year (พ.ศ.) — **supported**

In `src/utils/birthdateParse.util.js`:

- 4-digit year **≥ 2400** → Buddhist Era, converted to CE with **−543** (e.g. `2538` → CE `1995`).
- Calendar checks use **CE** year after conversion.

## Text routing order (state-first)

For **incoming text**, handlers run in this order (see `src/routes/lineWebhook.js`):

1. **`awaiting_slip`** — non–payment-command → slip reminder (stay in slip flow).
2. **`pending_verify`** — lock / payment-again / **utility branch** (history, stats, menu, etc.) **before** birthdate lock.
3. **`awaitingBirthdateUpdate`** — profile birthdate change.
4. **`waiting_birthdate`** — `session.pendingImage` and not in slip-only path; may show slip reminder if DB `awaiting_payment`.

So: if the user is in **`pending_verify`** and sends **`ประวัติ` / `สถิติ`** (utility allowed), they get history/stats from the **pending_verify utility branch**, not the waiting-birthdate guidance.

## Manual matrix — **`waiting_birthdate` only**

Assume: `session.pendingImage`, **no** active `awaiting_slip` text gate, **no** `awaiting_payment` row, **not** stuck in `pending_verify` (or already past utility handling).

| Input | Expected |
|-------|----------|
| `จ่ายเงิน` | **Guidance** (blocked intent). Payment QR **not** opened. Log: `guidance` / `payment_command_blocked` if payment handler reached. |
| `สแกนพลังงาน` | **Guidance** (blocked intent). Log: `guidance`, `hint: blocked_intent` |
| `ประวัติ` | **Guidance** (blocked intent). Log: `guidance`, `hint: blocked_intent` |
| `สถิติ` | Same as ประวัติ |
| `hello` | **Guidance** (not date-like). Log: `guidance`, `hint: default` |
| `14/09/1995` | Valid → `accepted` → push `before_scan` + async ingest (`ingestScanImageAsyncV2`) when `ENABLE_ASYNC_SCAN_V2=true` |
| `14/09/2538` | Valid → CE `1995` → same as above |
| `14-9-2538` | Valid → same CE normalization |
| Second image (no saved birthdate, no slip row) | **Image reminder** variant; pending image not replaced. Log: `second_image_reminder` |
| `เปลี่ยนวันเกิด` | **`awaitingBirthdateUpdate`** — prompt for new date (not parsed as birthdate) |

## Payment edge cases

| Scenario | Behavior |
|----------|----------|
| **`pendingImage` + stale `awaiting_payment`** | `getLatestAwaitingPaymentForLineUserId` expires rows **> 24h** → `null`. User is not stuck on slip reminder; **waiting_birthdate** can apply. |
| **`pendingImage` + `awaiting_slip`** | In-memory slip state: **waiting_birthdate** block skipped (`paymentState === awaiting_slip`). User gets **slip** handling first. |
| **`pending_verify` + utility** | **Before** `waiting_birthdate`: allowed commands (`ประวัติ`, `สถิติ`, menu, …) run from **pending_verify utility** branch. Random text → pending-verify reminder. |

## Logs (grep `[WAITING_BIRTHDATE]`)

| Event | Meaning |
|------|---------|
| `guidance` | Nudge toward birthdate (`hint`: `default`, `blocked_intent`, `non_date_like`, or `payment_command_blocked`) |
| `invalid_date_attempt` | `looksLikeBirthdateInput` but parse failed (`reason` in payload) |
| `accepted` | Parsed OK; profile save or scan (after `gate`) |
| `second_image_reminder` | Extra image while still waiting for birthdate |

## Before / after (UX / parser)

| Input | Legacy (pre-parser) | Current |
|-------|---------------------|---------|
| `14/09/2538` | Often rejected (CE-only) | Valid → CE **1995** |
| `14-9-2538` | Invalid | Valid |
| `สแกนพลังงาน` | Could look like “wrong format” | **Guidance** (`looksLike` false for Thai) |
| `31/02/2538` | Generic error | `invalid_date` + variant copy |

## Files to review for this feature

- `src/utils/birthdateParse.util.js` — parse + `looksLike`
- `src/utils/replyVariant.util.js` / `src/config/replyVariants.th.js` / `src/utils/replyCopy.util.js` — non-scan copy
- `src/routes/lineWebhook.js` — routing + `logWaitingBirthdate`
