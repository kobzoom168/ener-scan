# Hybrid Persona AI (Ajarn Ener)

Hybrid Persona AI adds optional LLM rephrasing for **non-scan conversational copy** only.  
Routing, payment, state machine, access control, scan result text/Flex, and admin/payment logic stay code-controlled.

## Architecture Summary

- **Deterministic layer (existing code) decides**
  - state
  - reply type
  - routing/transitions
  - payment/access behavior
- **Hybrid AI layer (new) can only rewrite text**
  - input: structured payload with constraints
  - output: strict JSON `{ "messages": [...] }`
  - validator gate enforces format + safety rules
  - fallback returns deterministic persona text if anything fails

## Files Added/Changed

- Added:
  - `src/chat/hybridPersona.config.js`
  - `src/chat/hybridPersona.prompt.js`
  - `src/chat/hybridPersona.service.js`
  - `src/chat/hybridPersona.validator.js`
  - `src/chat/hybridPersona.fallback.js`
  - `tests/hybridPersona.validator.test.js`
- Changed:
  - `src/utils/replyPersona.util.js` (integration point)
  - `src/config/env.js` (feature flags/config)
  - `package.json` (test command)

## Rollout Scope (Phase 1)

Allowed reply types by default:

- `waiting_birthdate_guidance`
- `pending_verify`
- `paywall`

Everything else remains deterministic persona only.

## Config

- `HYBRID_PERSONA_ENABLED=false` (default)
- `HYBRID_PERSONA_ALLOWED_TYPES=waiting_birthdate_guidance,pending_verify,paywall`
- `HYBRID_PERSONA_MODEL=gpt-4.1-mini`
- `HYBRID_PERSONA_TIMEOUT_MS=2500`

## Exact Validator Rules

Validator file: `src/chat/hybridPersona.validator.js`

Checks:

1. output parses as JSON object
2. has `messages` array
3. `1 <= messages.length <= 3`
4. each message non-empty after trim
5. each message contains Thai chars
6. no emoji/icons
7. no markdown-like formatting (` ``` `, leading `- * # \``)
8. each message length <= `maxCharsPerMessage`
9. none of `forbiddenPhrases` appears
10. if `requiredPhrases` configured, **at least one** required phrase must appear

On any failure: reject AI output and fallback.

## Fallback Behavior

Fallback file: `src/chat/hybridPersona.fallback.js`

- If disabled / type not allowed / timeout / invalid JSON / rule violations:
  - return deterministic persona messages already generated in code
  - no flow interruption
  - no state change
  - no routing/payment behavior change

## Integration Points

Integrated at `generatePersonaReplyMeta()` in `src/utils/replyPersona.util.js`.

Flow:

1. deterministic persona pattern + slot pick runs first
2. hybrid service attempts rewrite only if allowed
3. validated AI output replaces text only
4. if not valid/allowed, deterministic messages are returned

## Sample AI Input/Output

### waiting_birthdate_guidance

Input payload (example):

```json
{
  "persona": "Ajarn Ener",
  "replyType": "waiting_birthdate_guidance",
  "state": "waiting_birthdate",
  "userMessage": "สแกนพลังงาน",
  "goal": "guide the user back to the required birthdate step",
  "requiredPhrases": ["14/09/1995", "14/09/2538"],
  "forbiddenPhrases": ["ผลสแกน", "โอน", "จ่ายเงิน", "payment", "admin"],
  "styleRules": {
    "thaiOnly": true,
    "casualPolite": true,
    "maxMessages": 3,
    "maxCharsPerMessage": 90,
    "noEmoji": true,
    "noIcons": true
  }
}
```

Output (valid):

```json
{
  "messages": [
    "ตอนนี้ขอวันเกิดก่อนนะ",
    "พิมพ์วันเกิดมาได้เลย 14/09/1995 หรือ 14/09/2538"
  ]
}
```

### pending_verify

Input payload (example):

```json
{
  "persona": "Ajarn Ener",
  "replyType": "pending_verify",
  "state": "pending_verify",
  "userMessage": "จ่ายเงิน",
  "goal": "tell user slip is in verification queue and keep user waiting calmly",
  "requiredPhrases": [],
  "forbiddenPhrases": ["จ่ายเงินซ้ำ", "โอนใหม่", "ผลสแกน", "payment"],
  "styleRules": {
    "thaiOnly": true,
    "casualPolite": true,
    "maxMessages": 3,
    "maxCharsPerMessage": 90,
    "noEmoji": true,
    "noIcons": true
  }
}
```

Output (valid):

```json
{
  "messages": [
    "ตอนนี้สลิปรอตรวจอยู่ครับ",
    "รออัปเดตในแชตนี้ได้เลย ยังไม่ต้องส่งซ้ำ"
  ]
}
```

### paywall

Input payload (example):

```json
{
  "persona": "Ajarn Ener",
  "replyType": "paywall",
  "state": "payment_required",
  "userMessage": "",
  "goal": "gentle paywall bridge after preview, invite payment command without hard sell",
  "requiredPhrases": ["จ่ายเงิน"],
  "forbiddenPhrases": ["ผลสแกนละเอียด", "การันตี", "admin"],
  "styleRules": {
    "thaiOnly": true,
    "casualPolite": true,
    "maxMessages": 3,
    "maxCharsPerMessage": 90,
    "noEmoji": true,
    "noIcons": true
  }
}
```

Output (valid):

```json
{
  "messages": [
    "รอบฟรีวันนี้ครบแล้วนะ",
    "ถ้าพร้อมดูต่อ พิมพ์ จ่ายเงิน ได้เลย"
  ]
}
```

## Safety Confirmation

- Routing remains deterministic and code-controlled.
- Payment flow remains deterministic and code-controlled.
- Scan result generation/Flex remains deterministic and untouched.
- Hybrid AI affects only message phrasing for allowed non-scan reply types.

