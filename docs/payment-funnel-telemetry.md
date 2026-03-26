# Payment funnel telemetry (debug / analytics)

Canonical structured logs use **`PAYMENT_FUNNEL_TRANSITION`** with a stable correlation shape. Many steps also emit a **legacy mirror** line (same payload fields, different top-level `event`) for backward compatibility.

## Correlation fields (all funnel-related events)

| Field | Description |
|--------|-------------|
| `lifecycleSchemaVersion` | `1` |
| `userId` | LINE user id |
| `lineUserId` | Same as `userId` (duplicate for joins) |
| `paymentId` | DB payment UUID string when known |
| `paymentRef` | Human-facing ref when known |
| `packageKey` | Package / offer code |
| `step` | Semantic step id (see below) |
| `fromState` / `toState` | `FunnelPhase` (see `paymentLifecycleCorrelation.js`) |
| `reason` | Stable machine reason / source path |
| `ts` | Epoch ms |

Query tip: filter `event === "PAYMENT_FUNNEL_TRANSITION"` OR any legacy mirror (`package_selected_entered`, `awaiting_payment_entered`, etc.); prefer `step` for funnel analytics.

## Canonical sequence (happy path, single-offer pay)

1. **`package_selected_entered`** — `paywall_selecting` → `package_selected` (or `idle` → `package_selected` from idle price hint).  
   Legacy: `package_selected_entered`.

2. **`awaiting_payment_entered`** — `package_selected` *or* `paywall_selecting` → `awaiting_payment` when a pending payment row is created.  
   May include `hadPackageSelected: true`.  
   Legacy: `awaiting_payment_entered`.

3. **`slip_phase_entered`** — `awaiting_payment` → `slip_phase` (in-memory “wait for slip” after pay prompt).  
   Legacy: `slip_phase_entered`.

4. **`qr_bundle_sent`** — `slip_phase` → `qr_delivered` (QR multipart reply succeeded).  
   Legacy: `payment_qr_bundle_sent`.

5. **`pending_verify_entered`** — `awaiting_payment` → `pending_verify` after slip upload + DB update.  
   Legacy: `pending_verify_entered`.

6. **`payment_approved`** — `pending_verify` → `paid` (admin approve + entitlement).  
   Legacy: `payment_approved_funnel`.  
   (Existing `PAYMENT_APPROVED_ENTITLEMENT_GRANTED` log remains for entitlement detail.)

7. **`payment_rejected`** — `pending_verify` → `rejected`.  
   Legacy: `payment_rejected_funnel`.

## Notes

- `qr_delivered` is a funnel moment, not a long-lived DB status.
- Transitions are **best-effort UX phases**; DB `payments.status` is source of truth for money state.
- See also `docs/non-scan-outbound-registry.md` for LINE reply audit context.
