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
