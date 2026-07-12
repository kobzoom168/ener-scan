# Payment operations (manual PromptPay)

## How payment works

1. **Free scans** – **2** successful scans per **calendar day** per user are free (counted from `scan_results`, local date).
2. **Gate** – After free quota, the user must have an active paid entitlement to scan again.
3. **Entitlement** – Stored in `app_users.paid_until`. If `paid_until` is in the future, the user can scan.
4. **User flow** – User pays via PromptPay (static QR), sends a **slip image** in LINE, and waits for admin. The bot keeps a payment row in `awaiting_payment` / `pending_verify` as appropriate.
5. **Admin LINE ping (optional)** – When a slip is accepted into `pending_verify`, the webhook can **push a short text** to `ADMIN_LINE_USER_ID` (same userId as DLQ alerts) so you get a mobile alert. The admin account must **have added the OA as a friend**. Set `ADMIN_PAYMENT_SLIP_NOTIFY=false` to turn this off while keeping `ADMIN_LINE_USER_ID` for other alerts.
6. **Manual verification** – An admin approves the slip (admin UI or `npm run payment:verify`). The app marks the payment **paid**, grants entitlement by package (default promo: **99 THB / 10 scans / 24h**), and sets `app_users.paid_until` / `paid_remaining_scans` accordingly.

## Admin Dashboard (v2)

### Login (recommended)

1. Set **`ADMIN_USERNAME`**, **`SESSION_SECRET`**, and either **`ADMIN_PASSWORD_HASH`** (bcrypt, recommended) or plain **`ADMIN_PASSWORD`**, plus `NODE_ENV=production` as usual.
2. Open **`GET /admin/login`**, sign in, then use **Payments** as usual.
3. **Logout:** `POST /admin/logout` (button on dashboard).

Session cookie **`ener_admin_sid`** is **httpOnly**, **sameSite=lax**, **~8h** max age; use **HTTPS** in production so `secure` cookies work.

**Rate limit:** after **5 failed** login attempts from the same IP within **15 minutes**, further attempts are blocked until the window cools down (in-memory; single server).

### Legacy token (optional)

- **`ADMIN_TOKEN`** still works: `?token=...` or header `x-admin-token` for scripts / emergency access.
- JSON APIs can use `Accept: application/json` + token if not logged in.

### URLs

- **List:** `GET /admin/payments?status=pending_verify` (after login)  
  Tabs: `pending_verify` (default), `awaiting_payment`, `paid`, `rejected`
- **Detail:** `GET /admin/payments/<paymentId>`
- **JSON API:** same detail URL with header `Accept: application/json` returns `{ ok, payment }`.

Approve/reject use `fetch` + session cookie (`credentials: include`) or legacy token.

## How to verify manually

1. Get the **payment reference (UUID)** from the user (they see it in the LINE instruction message).
2. Optionally confirm the payment in your records (e.g. bank/slip).
3. Run the verify command (see below). On success, that user can scan for 24 hours from the moment of verification (or from their current `paid_until` if it is still in the future).

## Environment variables

For the **API** (payment creation and gate):

- `SUPABASE_URL` – required
- `SUPABASE_SERVICE_ROLE_KEY` – required

For **payment amount** (optional):

- `PAYMENT_UNLOCK_AMOUNT_THB` – amount in THB shown and stored (e.g. `99`). If unset or 0, instructions say “ตามที่แอดมินแจ้ง”.
- `PAYMENT_UNLOCK_CURRENCY` – default `THB`.

For the **verify script**, the same Supabase env vars are required (script loads `.env` via the app config).

For **LINE admin slip alerts** (push when a slip hits `pending_verify`):

- `ADMIN_LINE_USER_ID` – LINE userId (`U…`) that receives the push (same as DLQ worker alerts).
- `ADMIN_PAYMENT_SLIP_NOTIFY` – optional; `false` / `0` / `no` disables slip alerts only.
- `APP_BASE_URL` – optional; when set to `https://…`, the alert includes a link to `/admin/payments/<paymentId>`.

For **public HTML report hero images** (Phase 2.2), **Flex migration** (Phase 2.3+), and **rollout execution** (runbook, optional `ROLLOUT_WINDOW_LABEL`), see **`docs/REPORT_OPS.md`** and **`docs/REPORT_ROLLOUT_RUNBOOK.md`**.

- `SCAN_OBJECT_IMAGE_BUCKET` – Supabase Storage bucket name (default `scan-object-images`). Set to **empty** to skip uploads; reports still render with a placeholder.
- Create the bucket as **public** (see `sql/020_scan_object_image_bucket.sql`). Uploads use the service role; URLs are `https://…` only at render time.

## Exact command to verify a payment

From the project root, with `.env` (or env) set:

```bash
npm run payment:verify -- <paymentId> [verifiedBy]
```

- **paymentId** – UUID of the pending payment (required). User gets this in the LINE message as “รหัสอ้างอิง”.
- **verifiedBy** – Optional label (e.g. admin name or `manual`). Stored in `payments.verified_by`.

Example:

```bash
npm run payment:verify -- a1b2c3d4-e5f6-7890-abcd-ef1234567890 admin
```

Success: prints `Payment approved. paid_until: <iso date>`.  
Failure: prints an error and exits with code 1.

---

# Slip auto-approval (OCR) — status & ops

> Goal: read the slip with a vision model (OCR), validate against the expected
> payment, and auto-approve without an admin if everything matches. Forgery-proof
> level is **medium** (reads text only; does not verify with the bank).

## Pipeline (code)

- `src/core/payments/slipCheck/slipOcrExtractor.service.js` — vision LLM OCR (extract amount, date, receiver, ref, confidence).
- `src/core/payments/slipCheck/slipAutoApproval.service.js` — validation rules (amount / receiver / time / slip_ref / confidence / dedupe).
- `src/core/payments/slipCheck/slipAutoApprovalOrchestrator.service.js` — runs OCR → evaluate → write result columns.

Result is written to `payments` columns: `slip_verify_status`, `slip_review_reason`,
`slip_ref`, `slip_amount`, `slip_transferred_at`, `slip_receiver_name`,
`slip_receiver_account_last4`, `slip_receiver_promptpay`, `slip_ocr_confidence`, `slip_ocr_raw_text`.

`slip_verify_status` ends up one of: `dry_run_would_auto_approve` | `manual_review` | `auto_approved`.

## Environment flags

| flag | default | meaning |
|---|---|---|
| `SLIP_AUTO_APPROVE_ENABLED` | `false` | master switch for the OCR pipeline |
| `SLIP_AUTO_APPROVE_DRY_RUN` | `true` | when true: evaluate + log only, **do not** auto-approve (admin still approves) |
| `SLIP_OCR_MODEL` | `gpt-4.1-mini` | vision model used for OCR |
| `SLIP_OCR_MIN_CONFIDENCE` | `0.85` | min OCR confidence to pass |
| `SLIP_AMOUNT_TOLERANCE` | `0` | allowed THB diff vs expected (0 = exact) |
| `SLIP_AUTO_APPROVE_MAX_AGE_HOURS` | `24` | reject slips transferred longer ago than this |
| `SLIP_RECEIVER_NAME` | _(empty)_ | expected receiver name (substring match). **Must be set** or receiver check fails |
| `SLIP_RECEIVER_ACCOUNT_LAST4` | _(empty)_ | expected receiver account last 4 digits |
| `SLIP_RECEIVER_PROMPTPAY` | _(empty)_ | expected receiver PromptPay id |

Receiver passes if **any** of last4 / PromptPay / name matches the configured value.

### Live server state (as of 2026-06-17)

- `SLIP_AUTO_APPROVE_ENABLED=true`, `SLIP_AUTO_APPROVE_DRY_RUN=true` (safe), `SLIP_RECEIVER_NAME=ธนริศย์ อภิโชคจิรศิลป์`
- Account is KBank; receiver name check relies on the name above.

## Known issue (the main blocker)

Across all historical slips, `slip_ref` (เลขที่รายการ) extracted as **null** → reason
`missing_slip_ref` blocked every auto-approve. `slipOcrExtractor.service.js` was
patched with key aliases + a stricter system prompt to fix this, **but it has not yet
been confirmed against a fresh slip** processed by the new code. Also `confidence`
was sometimes `0` → `low_confidence` (threshold is strict at 0.85).

Genuine 49 THB KBank slips to the configured account otherwise pass amount + receiver
+ time. So the open items to verify on the next real test: **slip_ref read OK?** and
**confidence ≥ 0.85?**

## How to re-check results (server)

A query script is kept on the server at `/root/_slipcheck.mjs` (lists the latest 10
payment rows with all slip OCR columns). Re-run any time:

```bash
ssh root@my-ener.uk "docker cp /root/_slipcheck.mjs ener-scan:/tmp/_slipcheck.mjs && docker exec ener-scan node /tmp/_slipcheck.mjs; exit"
```

## Go-live checklist

1. Do one real 49 THB transfer + send slip; confirm row shows `dry_run_would_auto_approve` (slip_ref read, confidence ok).
2. Flip `SLIP_AUTO_APPROVE_DRY_RUN=false` and rebuild/restart the `ener-scan` container.
3. Keep watching `slip_review_reason` on the first few live ones.

---

# KBank K API — reference (parked; not started)

> Decision parked on 2026-06-17. KBank fees / eligibility are **unknown** and must be
> confirmed with KBank directly (business line / relationship manager). Do not assume prices.

## Two relevant products

### A. Slip Verification
- **What**: send the slip QR / reference to KBank → confirms the slip is **real and actually paid** (forgery-proof).
- **Needs**: business relationship/account with KBank + subscribe the product in K API portal + OAuth credentials.
- **Fit**: customer still uploads a slip (current flow); we verify for real instead of OCR-guessing. Minimal code change.

### B. QR Payment (the product opened in the portal: app "Ener-scan")
- **What**: generate a dynamic Thai QR bound to amount + reference → bank confirms payment directly (no slip at all).
- **Needs**: merchant onboarding (settlement account, KYC) + **pass the 15 sandbox certification exercises** ("ทดสอบ API 0/15") before production credentials.
- **Confirm flow**: always call **Inquiry QR Transaction** (`GET /qr/v2/qr/{charge_id}`, status PAID) server-to-server to confirm — do not trust the UI callback alone.
- **Effort**: larger (new payment provider integration).

## Open questions to ask KBank before deciding
1. Is the receiving account **personal** or **business/merchant** (juristic)? Some products require a merchant account.
2. **Fees** for Slip Verification / QR Payment (per call vs monthly package)?
3. **Eligibility** thresholds (sales volume / documents) — do we qualify?
4. Does it work with slips from **all banks**, or only transfers into KBank?

## Comparison (for later decision)

| Option | Anti-forgery | Cost | Start now? |
|---|---|---|---|
| OCR (current) | medium (reads text) | free | yes — built, pending test |
| KBank Slip Verify | very high | ask KBank | needs product subscription |
| KBank QR Payment | highest (no slip) | ask KBank | needs onboarding + pass 15 exercises |
| EasySlip / SlipOK (3rd-party) | high | ~99 THB/mo | yes — self-serve signup |
