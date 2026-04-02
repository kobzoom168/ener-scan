# LINE reply inventory (Ener Scan)

Operational reference: **what** is sent **how**, without changing product logic.

---

## 1. Final scan Flex path (user-facing scan result)

Scan results are **not** sent inline from the webhook. They are built when processing the job / outbound payload and sent by **`worker-delivery`** via `deliverOutbound.service.js`, using flex builders (e.g. `scanFlexReply.builder.js`, `lineFinalScanDelivery.builder.js`, summary-first vs legacy flex per `LINE_FINAL_DELIVERY_MODE` / feature flags).

| Step | Location | Mechanism |
|------|----------|-----------|
| Success | `src/workers/deliveryWorker.js` → `deliverOutboundMessage` | Flex / text per payload kind `scan_result` — **`buildScanFlex()`** or **`buildScanSummaryFirstFlex()`** when enabled + optional birthdate/settings bubbles per builder |
| Flex error | same path | Fallback text push/reply per delivery service |

**Rule:** Production user-facing scan Flex for chat goes through the **outbound queue + delivery worker**, not a synchronous handler.

---

## 2. QR image payment path

| Step | Location | Mechanism |
|------|----------|-----------|
| QR bundle (intro + image + slip line) | `src/services/lineReply.service.js` | `replyPaymentInstructions` → `replyPaymentInstructionWithQr` (one `replyMessage`: text + image + text) |
| Copy for intro | `src/utils/webhookText.util.js` | `buildPaymentQrIntroText`, `buildPaymentQrSlipText` |
| Used from | `src/services/nonScanReply.gateway.js` | `sendNonScanPaymentQrInstructions` and related gateway paths |
| Used from | `src/routes/lineWebhook.js` | Payment command / flows that need QR |
| HTTPS QR missing | `line.reply` / webhook | `replyText` with `buildPaymentInstructionText` (fallback) |

---

## 3. Text-only reply points (user-facing)

### 3.1 Variants (`pickVariant`) — `src/config/replyVariants.th.js` + `src/utils/replyCopy.util.js`

- Birthdate flow: `waiting_birthdate_*`, `birthdate_update_prompt`, `birthdate_saved_after_update`
- **Ajarn Ener persona** (`src/config/personaEner.th.js` + `generatePersonaReply` in `replyPersona.util.js`): non-scan types listed in `docs/AJARN_ENER_PERSONA.md` — varies **pattern**, **slot line**, and **1–3 messages**.
- Payment / slip: `awaiting_slip`, `pending_verify*`, `approved_intro`

### 3.2 Static builders — `src/utils/webhookText.util.js`

- Image / gate: `buildMultiImageInRequestText`, `buildMultipleObjectsText`, `buildUnclearImageText`, `buildUnsupportedObjectText`, `buildDuplicateImageText`, `buildRateLimitText`, `buildCooldownText`
- Idle / history: `buildIdleText`, `buildNoHistoryText`, `buildNoStatsText`
- Payment text: `buildPaymentRequiredText`, `buildPaymentCommandIntroText`, `buildPaymentSlipFollowUpText`, `buildPaymentInstructionText`, `buildManualPaymentRequestText`
- Slip flow: `buildSlipReceivedText`, `buildPaymentFlowLockedGuidanceText`, `buildPendingVerifyReminderText`, `buildPendingVerifyBlockScanText`, `buildPendingVerifyPaymentCommandText`, `buildAwaitingSlipReminderText`, `buildPaymentApprovedText`, `buildPaymentRejectedText`
- Errors: `buildSystemErrorText`

### 3.3 Scan / payment gating (webhook + services)

- Rate limit / cooldown: `buildRateLimitText`, `buildCooldownText` (routed via webhook / payment access)
- Payment gate: `paymentAccess.service.js`, `nonScanReply.gateway.js` patterns
- QR path: see §2
- Object / image checks: `buildMultipleObjectsText`, `buildUnclearImageText`, `buildUnsupportedObjectText`
- Deep scan errors: surfaced on **worker-scan** / outbound failure paths (not `scanFlow.handler.js` — removed)

### 3.4 `src/routes/lineWebhook.js`

- Commands: history, stats, menu, payment, slip upload, birthdate, idle, helpers
- Abuse guards: `ABUSE_MSG_*` constants
- Async scan ingest: `ingestScanImageAsyncV2` when `ENABLE_ASYNC_SCAN_V2=true`
- `sendTextSequence` / `replyText` / payment instructions as routed by state

### 3.5 Human-like pacing (multi-bubble)

- `src/services/lineSequenceReply.service.js` — `sendTextSequence` (first `reply`, rest `push`)

---

## 4. Flex code **not** used as LINE replies (library)

`src/services/flex/status.flex.js` (e.g. `buildMainMenuFlex`, `buildPaymentRequiredFlex`) and similar are **not** wired to production scan delivery.  
Production scan Flex for user chat = **delivery worker** path (§1).

---

## 5. Tone notes (polish pass)

- Non-scan copy aims for **short, casual Thai**, mostly **ผม** voice; admin actions stay **แอดมิน**.
