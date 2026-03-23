# LINE UX: text-only flows, Flex only for scan result

## Rule

- **Text** (`replyText` / `replyPaymentInstructions` with QR image): onboarding, birthdate, errors, paywall fallback, slip, pending, menu/help, multi-image rejects, etc.
- **Flex** (`replyFlex` + `buildScanFlex`): **only** `replyScanResult` in `scanFlow.handler.js` (final scan presentation + optional birthdate settings bubble).
- If Flex build/send fails, **fallback** remains plain `resultText` (unchanged).

## Flex usages removed / replaced

| Location (before) | After |
|-------------------|--------|
| `lineWebhook` — pending verify block scan | `replyText` + `buildPendingVerifyBlockScanText` |
| Duplicate / multi / unclear / unsupported image (finalize + image handler + webhook multi-image) | `replyText` + existing `build*Text()` helpers |
| Start instruction after accepted image | `replyText` + `buildStartInstructionText(userId)` |
| Main menu / idle fallback | `replyText` + `buildIdleText()` |
| Multi-image collect-window / burst / same-request | `replyText` + `buildMultiImageInRequestText()` |
| `scanFlow` — rate limit, cooldown, paywall (no QR path), scan errors (multiple/unclear/unsupported) | `replyText` + `build*Text()` |
| `paymentAccess.buildPaymentGateReply` | **Text only** — removed `buildPaymentRequiredFlex` from return |
| `replyFlexWithFallback` helper | **Removed** (no longer used) |

## Files changed

- `src/routes/lineWebhook.js` — all conversational replies → `replyText`; dropped flex imports.
- `src/handlers/scanFlow.handler.js` — non-result paths → `replyText`; dropped `replyFlexWithFallback` and non-scan flex builders; **kept** `replyScanResult` → `replyFlex` + `buildScanFlex`.
- `src/services/paymentAccess.service.js` — `buildPaymentGateReply` returns only `fallbackText`.

## Still uses Flex (intentional)

- `replyScanResult` → `buildScanFlex` + `buildBirthdateSettingsBubble` (carousel) in `scanFlow.handler.js`.

## Still not Flex (unchanged)

- `replyPaymentInstructions` — sends **text + QR image message** (not Flex bubble).
