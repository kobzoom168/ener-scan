# LINE UX: text-only flows, Flex only for scan result

## Rule

- **Text** (`replyText` / `replyPaymentInstructions` with QR image): onboarding, birthdate, errors, paywall fallback, slip, pending, menu/help, multi-image rejects, etc.
- **Flex** (`replyFlex` + `buildScanFlex` / summary-first): **scan result only**, sent by **`worker-delivery`** when delivering `outbound_messages` kind `scan_result` (built via `scanFlexReply.builder.js`, `lineFinalScanDelivery.builder.js`, etc.).
- If Flex build/send fails, **fallback** remains plain result text per delivery service (unchanged intent).

## Flex usages removed / replaced (historical)

| Location (before) | After |
|-------------------|--------|
| `lineWebhook` — pending verify block scan | `replyText` + `buildPendingVerifyBlockScanText` |
| Duplicate / multi / unclear / unsupported image | `replyText` + existing `build*Text()` helpers |
| Start instruction after accepted image | `replyText` + `buildStartInstructionText(userId)` |
| Main menu / idle fallback | `replyText` + `buildIdleText()` |
| Multi-image collect-window / burst / same-request | `replyText` + `buildMultiImageInRequestText()` |
| Legacy synchronous `scanFlow.handler` paths | **Removed** — scan results via queue + delivery worker only |
| `paymentAccess.buildPaymentGateReply` | **Text only** — removed `buildPaymentRequiredFlex` from return |
| `replyFlexWithFallback` helper | **Removed** (no longer used) |

## Files (current)

- `src/routes/lineWebhook.js` — conversational replies → `replyText`; async ingest → `ingestScanImageAsyncV2`.
- `src/workers/deliveryWorker.js` + `src/services/scanV2/deliverOutbound.service.js` — scan result Flex/text.
- `src/services/paymentAccess.service.js` — `buildPaymentGateReply` returns only `fallbackText`.

## Still uses Flex (intentional)

- **Delivery worker** path: `buildScanFlex` / `buildScanSummaryFirstFlex` + optional bubbles per `LINE_FINAL_DELIVERY_MODE` and feature flags.

## Still not Flex (unchanged)

- `replyPaymentInstructions` — sends **text + QR image message** (not Flex bubble).
