# Ener Scan — two copy layers

## 1. Scan copy system

- **Controls:** Scan result **wording and meaning** (what the user reads as the reading).
- **Output:** Structured text → LINE **Flex** (final scan bubble) + optional text fallback.
- **Where:** LLM prompts (`src/prompts/deepScan*.prompt.js`), formatter, `scanCopy.*`, `flex.*`, outbound/delivery builders (`scanFlexReply.builder.js`, `lineFinalScanDelivery.builder.js`, etc.).
- **Not:** Random chat filler; not birthdate/payment menu copy.

## 2. Chat persona system (Ajarn Ener)

- **Controls:** **Non-scan** conversational replies in the LINE flow (human operator style).
- **Traits:** Thai, calm, short, non-repetitive (pattern + slot rotation), state is respected by **routing** in `lineWebhook.js` / handlers — persona only supplies **lines** for each reply type.
- **Where:** `src/config/personaEner.th.js`, `src/utils/replyPersona.util.js`, `src/utils/replyCopy.util.js`, sequence send (`lineSequenceReply.service.js`).
- **Not:** Scan result content; not Flex layout for the reading.

## Rule of thumb

| Question | Layer |
|----------|--------|
| “What does the scan **say** about the object?” | **Scan copy** |
| “What does the bot **say** while waiting for birthdate / slip / payment?” | **Chat persona** |

See also: `PROJECT_CONTEXT.md` (§ Two copy layers), `docs/AJARN_ENER_PERSONA.md`, `docs/ENER_SYSTEM_TONE_GUIDE.md` (scan tone).
