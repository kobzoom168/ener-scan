# LINE reply inventory (Ener Scan)

Operational reference: **what** is sent **how**, without changing product logic.

---

## 1. Final scan Flex path (only user-facing Flex)

| Step | Location | Mechanism |
|------|----------|-----------|
| Success | `src/handlers/scanFlow.handler.js` → `replyScanResult()` | `replyFlex()` with `buildScanFlex()` + optional `buildBirthdateSettingsBubble` appended |
| Flex error | same | `replyText()` with raw scan text |

**Rule:** `replyFlex` is only called from `replyScanResult` in `scanFlow.handler.js`.  
`status.flex.js` helpers are used **inside** that scan carousel (settings bubble), not as separate LINE Flex messages for menus/paywall.

---

## 2. QR image payment path

| Step | Location | Mechanism |
|------|----------|-----------|
| QR bundle (intro + image + slip line) | `src/services/lineReply.service.js` | `replyPaymentInstructions` → `replyPaymentInstructionWithQr` (one `replyMessage`: text + image + text) |
| Copy for intro | `src/utils/webhookText.util.js` | `buildPaymentQrIntroText`, `buildPaymentQrSlipText` |
| Used from | `src/handlers/scanFlow.handler.js` | `replyPaymentQrTripleOrFallback` when payment gate requires payment / paid over-limit path |
| Used from | `src/routes/lineWebhook.js` | Payment command / finalize image flows that need QR |
| HTTPS QR missing | `line.reply` / `scanFlow` | `replyText` with `buildPaymentInstructionText` (fallback) |

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

### 3.3 `src/handlers/scanFlow.handler.js`

- Rate limit / cooldown: `buildRateLimitText`, `buildCooldownText`
- Payment gate (no QR): `sendPaymentGateTextReply` → `sendTextSequence` or `replyText` / `paywallMessageSequence`
- QR path: `replyPaymentQrTripleOrFallback` (see §2)
- Scan result: `replyFlex` or fallback `replyText` (see §1)
- Object / image checks: `buildMultipleObjectsText`, `buildUnclearImageText`, `buildUnsupportedObjectText`
- Deep scan generic error: inline `replyText` (analysis failed)
- Billing / DB: inline `replyText` (payment gate catch, scan_request prep, missing image, persist failure)
- Paid warning line: inline note when remaining paid scans 1–3 (prepended to success reply path)

### 3.4 `src/routes/lineWebhook.js`

- Commands: history, stats, menu, payment, slip upload, birthdate, idle, helpers
- Abuse guards: `ABUSE_MSG_*` constants
- `sendTextSequence` / `replyText` / `replyPaymentInstructions` as routed by state
- Incidental strings (e.g. user not found) — text-only

### 3.5 Human-like pacing (multi-bubble)

- `src/services/lineSequenceReply.service.js` — `sendTextSequence` (first `reply`, rest `push`)

---

## 4. Flex code **not** used as LINE replies (library)

`src/services/flex/status.flex.js` (e.g. `buildMainMenuFlex`, `buildPaymentRequiredFlex`) and similar are **not** wired to `replyFlex` in the webhook path.  
Production LINE Flex for user chat = **scan result only** (§1).

---

## 5. Tone notes (polish pass)

- Non-scan copy aims for **short, casual Thai**, mostly **ผม** voice; admin actions stay **แอดมิน**.
- Payment QR intro avoids stiff “ระบบ…” where possible; slip flows use plain **รับสลิป / รอตรวจ**.
