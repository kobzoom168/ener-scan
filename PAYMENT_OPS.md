# Payment operations (manual PromptPay)

## How payment works

1. **Free scans** – First 3 successful scans per user are free (counted from `scan_results`).
2. **Gate** – After 3 scans, the user must have an active paid entitlement to scan again.
3. **Entitlement** – Stored in `app_users.paid_until`. If `paid_until` is in the future, the user can scan.
4. **User flow** – User sends a payment-related command (`payment`, `จ่ายเงิน`, `ปลดล็อก`) in LINE. The bot creates a **pending** payment row and replies with instructions plus a **payment reference (UUID)** and amount (if configured).
5. **Manual verification** – An admin verifies the transfer (e.g. slip), then runs the verify command with that payment reference. The app marks the payment succeeded and sets `app_users.paid_until` to now + 24 hours (or extends existing entitlement).

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

Success: prints `Payment verified. paid_until: <iso date>`.  
Failure: prints an error and exits with code 1.
