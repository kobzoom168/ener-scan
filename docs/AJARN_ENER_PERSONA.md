# Ajarn Ener — non-scan conversation persona

## 1. Architecture summary

| Layer | Role |
|--------|------|
| **Persona rules** | `AJARN_ENER_PERSONA_RULES` in `src/config/personaEner.th.js` — tone, avoid/prefer phrasing (authoring guide; not runtime-enforced). |
| **Conversation patterns** | Per reply `type`: ordered **slots** (e.g. `OPEN` → `ASK` → `CONTINUE`, or `ASK` → `OPEN` → `EXAMPLE`). Same logical content, different rhythm. |
| **Content pools** | Short Thai lines per **slot**; no emoji; avoid stiff CS phrasing (“กรุณา…”, “โปรด…”). |
| **Delivery** | `generatePersonaReply(userId, type)` → **1–3** strings. Multi-bubble sends use `replyTextSequenceOrSingle` / `sendTextSequence` (existing randomized delays between bubbles). |

Scan result text, Flex rendering, and payment **business logic** are unchanged.

---

## 2. Files added / changed

| File | Action |
|------|--------|
| `src/config/personaEner.th.js` | **Added** — rules + `PERSONA_REPLY_CONFIG` |
| `src/utils/replyPersona.util.js` | **Added** — `pickPattern`, `pickSlotVariant`, `generatePersonaReply`, memory clear |
| `src/utils/replyCopy.util.js` | **Updated** — all listed types use persona + helpers for slip/pending ref lines |
| `src/config/replyVariants.th.js` | **Slimmed** — only `birthdate_update_*` still on `pickVariant` |
| `src/routes/lineWebhook.js` | **Updated** — sequence send for birthdate errors + second-image reminder |
| `src/utils/webhookText.util.js` | **Updated** — `buildBirthdateErrorMessages`, `buildWaitingBirthdateImageReminderMessages` |
| `src/config/conversationPatterns.th.js` | **Removed** (merged into persona) |
| `src/utils/conversationPattern.util.js` | **Removed** (replaced by `replyPersona.util.js`) |
| `docs/CONVERSATION_PATTERNS.md` | **Superseded** by this doc |

---

## 3. Persona config structure

```text
PERSONA_REPLY_CONFIG[type] = {
  maxMessages?: number,        // default 3, approved_intro uses 1
  patterns: string[][],       // e.g. [["OPEN","ASK","CONTINUE"], ["ASK","EXAMPLE"], ...]
  pools: {
    SLOT_NAME: string[],      // Thai lines; paywall CTA may include "{{AMOUNT}}"
  },
}
```

Types implemented:  
`waiting_birthdate_initial`, `waiting_birthdate_guidance`, `waiting_birthdate_invalid_format`, `waiting_birthdate_invalid_date`, `waiting_birthdate_out_of_range`, `waiting_birthdate_image_reminder`, `before_scan`, `paywall`, `awaiting_slip`, `pending_verify`, `pending_verify_block_scan`, `pending_verify_payment_again`, `approved_intro`.

---

## 4. Pattern system

- **`pickPattern(userId, type)`** — chooses next pattern array, **skips** same serialized pattern as last time for `userId` + `type`.
- **Slots** are filled in order up to `maxMessages` (and pattern length).
- **`pickSlotVariant(userId, type, slot)`** — picks a line from `pools[slot]`, **skips** same pool index as last pick for `userId` + `type` + `slot`.
- **`generatePersonaReply(userId, type)`** — runs pattern + slot picks → `string[]`.

Legacy alias: **`generateConversation`** = `generatePersonaReply` (same args).

---

## 5. Repetition control

1. **Pattern:** `lastPatternSigByUser` key `userId:type` → last serialized pattern (`OPEN-ASK-CONTINUE`).
2. **Slot line:** `lastSlotIndexByUser` key `userId:type:slot` → last chosen index in that pool.

Clear in tests: `clearPersonaMemory()` (also `clearConversationPatternMemory()` alias).

---

## 6. Example outputs (illustrative; exact lines vary)

| Type | Example bubbles |
|------|------------------|
| `waiting_birthdate_initial` | `["รับภาพแล้วครับ", "ขอวันเกิดก่อนนะ", "ลองแบบนี้ได้ 14/09/1995 หรือ 14/09/2538"]` |
| `waiting_birthdate_guidance` | `["ยังรอวันเกิดอยู่นะ", "พิมพ์วันเกิดมาก่อน"]` + example on last if needed |
| `waiting_birthdate_invalid_format` | `["รูปแบบยังไม่ตรงที่ผมอ่านได้", "ลองพิมพ์ใหม่อีกทีได้", "14/09/1995 หรือ 14/09/2538"]` |
| `before_scan` | `["รอสักครู่นะ", "โอเค เดี๋ยวผมดูให้เลย"]` |
| `paywall` | After `{{AMOUNT}}` inject: `["รอบฟรีวันนี้หมดแล้วนะ", "ถ้าจะดูละเอียดกว่านี้ ผมมีผลเต็มให้", "ราคา 99 บาท\n\nถ้าพร้อม พิมพ์ จ่ายเงิน ได้เลย"]` |
| `awaiting_slip` | `["รอสลิปอยู่ครับ", "โอนแล้วส่งรูปเดียวในแชตนี้ได้เลย"]` |
| `pending_verify` | `["รับสลิปแล้วนะ กำลังตรวจอยู่", "มีอัปเดตจะบอกในแชตนี้"]` |
| `approved_intro` | `["ผ่านแล้วครับ สิทธิ์พร้อมใช้งานแล้ว"]` (single bubble; body still from `buildPaymentApprovedText`) |

Birthdate flows **ensure** a date-like example line if the generated bubbles don’t already contain one (`ensureBirthdateExampleInMessages` in `replyCopy.util.js`).

---

## 7. Consistency

Non-scan replies for the types above are now generated from **one** config (`personaEner.th.js`) with shared tone rules, **pattern rotation**, and **slot anti-repeat**, so they read as **one calm human (Ajarn Ener)** typing short LINE messages—not random one-off strings, not scripted CS.

---

## Integration

```javascript
import { generatePersonaReply } from "../utils/replyPersona.util.js";
const lines = generatePersonaReply(userId, "waiting_birthdate_initial");
```

Or via `replyCopy`:

```javascript
import { waitingBirthdateInitialMessages } from "../utils/replyCopy.util.js";
```
