# รายงานสืบเคส chat quality วันที่ 20 ต.ค. 2569 (2 เคส) — read-only บน Pro (กบอนุมัติ 21 ต.ค. 2026)

**ขอบเขต:** U3ea20a6… ช่วง 00:44–01:06 ไทย · Ud4e7b36… ช่วง 17:48–18:08 ไทย · อ่าน `line_conversation_messages`, `scan_uploads`, `scan_jobs/requests`, `outbound_messages`, `conversation_state`, `app_users`, `free_policy_audit` + โค้ด `a97ce86` · ไม่ส่งข้อความ ไม่ replay ไม่แก้ข้อมูล/config ไม่ deploy · UID/ข้อมูลส่วนตัว mask
**ข้อจำกัดหลักฐาน:** log ของ web container (webhook/orchestrator/consult) ในสองช่วงนี้ **สูญหายแล้ว** — container `ener-scan-pro` ถูก recreate 20 ต.ค. 12:58Z (deploy a97ce86) และใช้ json-file log ต่อ container · worker-delivery/scan log ยังอยู่แต่ไม่มีบรรทัดของ 2 ผู้ใช้นี้ (ไม่มี outbound/job ในช่วง) → ข้อสรุปที่ต้องพึ่ง log webhook ระบุว่า "ยังพิสูจน์ไม่ได้"

## 1. ข้อเท็จจริงจาก DB (เวลาไทย)
### เคส A — U3ea20a6… (บัญชีสร้าง 12 ก.ค. 2026 · ไม่เคยซื้อแพ็ก · remaining 0 · สแกนล่าสุดสำเร็จ 17 ต.ค. 12:52 · นโยบายฟรี ณ เวลานั้น = `new_customer` ตั้งแต่ 18 ต.ค. 17:00 → บัญชีเก่าไม่เข้าเกณฑ์ทดลองฟรี)
| เวลา | ฝั่ง | replyType / source | ข้อความ |
|---|---|---|---|
| 00:54:20.9 | bot | `free_quota_exhausted_deterministic` / flow | การ์ด paywall "เติมสิทธิ์เพื่อสแกนองค์ใหม่…" |
| 00:54:39.3 | user | — | "ไว้ก่อน" |
| 00:54:55.3 | bot | `idle_post_scan` / flow | "ส่งรูปมาได้เลย อาจารย์จะดูให้ทีละชิ้น" |
| 00:55:17.8 | bot | `free_quota_exhausted_deterministic` / flow | การ์ด paywall (ข้อความเดิม) |
| 00:55:42.4 | user | — | "ดูฟรีไหมครับ" |
| 00:56:00.2 | bot | `consult_unavailable` / flow (template) | "ตอนนี้ยังตอบคำถามนี้ไม่ได้ครับ" |
| 00:56:53.8 | bot | `free_quota_exhausted_deterministic` / flow | การ์ด paywall (ข้อความเดิม) |
- ไม่มีแถว `scan_uploads` / `scan_jobs` / `outbound_messages` ของผู้ใช้นี้ในช่วง · `conversation_state`: flow_state/payment_state = null (true idle) · ข้อความ user ที่ถูกบันทึกทั้งวัน = 2 ข้อความข้างบนเท่านั้น
### เคส B — Ud4e7b36… (บัญชีสร้าง 21 ก.ค. 2026 · ไม่เคยซื้อ · remaining 0 · ผลสแกนล่าสุดส่งถึง 2 ต.ค. · ไม่มี job สำเร็จในตาราง scan_jobs ปัจจุบัน)
| เวลา | ฝั่ง | replyType / source | ข้อความ |
|---|---|---|---|
| 17:58:33.0 | bot | `free_quota_exhausted_deterministic` / flow | การ์ด paywall |
| 17:58:40.6 | user | — | "ไว้ก่อน" |
| 17:58:47.2 | bot | `gemini_front_consult` / **llm** (consult) | "ครับ ไว้ก่อนได้เลย ส่งมาเมื่อไหร่ก็ได้ครับ" |
| 17:58:48.9 | bot | `myscans_card` / flow | `[ส่งการ์ดผลสแกนของฉันแล้ว]` |
| 17:59:38.9 | bot | `myscans_card` / flow | `[ส่งการ์ดผลสแกนของฉันแล้ว]` |
| 18:00:02.4 | bot | `myscans_card` / flow | `[ส่งการ์ดผลสแกนของฉันแล้ว]` |
- ไม่มี upload/job/outbound ในช่วง · ข้อความ user ที่บันทึกทั้งวัน = "ไว้ก่อน" ข้อความเดียว
### ภาพรวมทั้งระบบ 20 ต.ค. (ไม่ระบุตัวตน)
- 00:00–02:00 ไทย: bot 24 ข้อความ (llm 3 · flow 8 · worker 9) · `consult_unavailable` 1 (= เคส A) · `gemini_front_consult` 3 → consult **ไม่ได้ล่มทั้งระบบ** ในชั่วโมงนั้น
- ทั้งวัน: `consult_unavailable` 1 · `gemini_front_consult` 9 · `idle_post_scan` 1 (= เคส A) · paywall 9 · ผู้ใช้ 8 ราย

## 2. กลไกจากโค้ด (a97ce86) ที่พิสูจน์ได้
1. **การ์ด paywall ไม่มีข้อความ user นำหน้า = เหตุการณ์ "รูป"** — `sendFreeQuotaExhaustedPaywallViaGateway` ถูกเรียกจาก 3 จุดเท่านั้น และทั้ง 3 อยู่ในเส้นรูป (`handleImageMessage` pre_object_check `lineWebhook.js:3843`, `finalizeAcceptedImage` :3569, finalize_image :2762) · เส้น pre_object_check ปฏิเสธ **ก่อนดาวน์โหลดรูป/สร้าง upload** จึงไม่มีแถว `scan_uploads` · webhook บันทึก user เฉพาะ **ข้อความตัวอักษร** (`handleTextMessage` :5243) → เหตุการณ์รูป/ปุ่มไม่ถูกบันทึก · LINE reply token ใช้ได้ครั้งเดียว → การ์ด 3 ใบ = inbound 3 ครั้ง → **เคส A ส่งรูป 3 ครั้ง (00:54:20 / 00:55:17 / 00:56:53) และได้ paywall ทุกครั้งตามนโยบาย new_customer (บัญชีเก่า ไม่เข้าเกณฑ์)** · เคส B ส่งรูป 1 ครั้ง 17:58:33
2. **`[ส่งการ์ดผลสแกนของฉันแล้ว]` = placeholder ใน log ของการ์ด Flex "ผลสแกนของฉัน" ที่ส่งผ่าน reply token** (`handleHistoryCommand` :2134–2171) — ตัวจุดชนวน: ข้อความ exact `"ดูผลเก่า"` (`HISTORY_EXACT` ใน `exactUtilityCommand.service.js:18`) ซึ่งเป็น **ปุ่ม quick-reply บนการ์ด paywall เอง** (`freeQuotaPaywallReply.service.js:95` `HISTORY_COMMAND_TEXT = "ดูผลเก่า"`) · dispatcher utility command อยู่ **ก่อน** บรรทัดบันทึก user (:5068 → `if (consumed) return;` :5120 ก่อน :5243) → ข้อความ "ดูผลเก่า" ของลูกค้า **ไม่ถูกบันทึก** แต่การ์ดถูกบันทึก · reply token ครั้งเดียว → การ์ด 3 ใบ = ลูกค้ากดปุ่ม "ดูผลเก่า" 3 ครั้ง (17:58:48 / 17:59:38 / 18:00:02) → **"ส่งการ์ดซ้ำโดยไม่ได้รับคำขอ" เป็น false positive จากช่องโหว่การบันทึก** ไม่ใช่ส่งจริงซ้ำ (ส่งจริง 3 ครั้งตามคำขอ 3 ครั้ง)
3. **"ไว้ก่อน" ใน true idle** — `semanticCatcher` จับเป็น intent `wait_tomorrow` (:274) แต่ `ALLOWLIST` อนุญาตให้ consume เฉพาะ state `paywall_offer_single` (:18–30) · เคส A/B อยู่ใน idle (flow/payment state null) → ไม่ consume → ไปเส้น true idle `replyIdleTextNoDuplicate(allowIdleDirectConsult=true)` (:8774) → orchestrator idle bypass `tryConsultReply("consult_idle_direct")` → **B: consult ตอบ** ("ครับ ไว้ก่อนได้เลย…") · **A: consult ไม่ตอบ** (`idle_bypass_consult_null`) และ "ไว้ก่อน" ไม่ใช่คำถาม (`isQuestionLike` = false) → `onConsultUnavailable` คืน null → fallback deterministic `idle_post_scan` = "ส่งรูปมาได้เลย" ซึ่ง **ขัดกับที่ลูกค้าเพิ่งปฏิเสธ** · สาเหตุที่ consult ของ A คืน null (`empty`/timeout/`budget_exhausted`/guard) **พิสูจน์ไม่ได้** เพราะ log webhook หาย — แต่ไม่ว่าเหตุใด เส้น fallback ปัจจุบันตอบผิดบริบทเสมอเมื่อ consult ไม่ตอบ
4. **"ดูฟรีไหมครับ"** — เป็นคำถาม (`isQuestionLike` จับ "ไหม") · consult null อีกครั้ง → `buildConsultUnavailableText` → ไม่ใช่คำถามเรื่องชิ้นล่าสุด → `honest` = "ตอนนี้ยังตอบคำถามนี้ไม่ได้ครับ" (template, source flow) · **ไม่มี deterministic router สำหรับคำถาม "ฟรีไหม"** ก่อนถึง consult (มีเฉพาะ info command "วิธีใช้/สแกนพลังงาน" และ packageQuestion เรื่องราคา/สิทธิ์เหลือ) ทั้งที่ระบบมีข้อเท็จจริงครบ: นโยบาย `new_customer` + บัญชีเก่า → สแกนใหม่ไม่ฟรี · ผลเก่าดูฟรีได้เสมอ (`buildSoftCloseCopy`, paywall copy เองก็บอก) · **ประเด็น Codex:** บริบท "ดูฟรี" ของลูกค้า = ส่งรูปใหม่ 2 ครั้งแล้วโดน paywall → น่าจะหมายถึง "สแกนใหม่ฟรีไหม" (ไม่ใช่ดูผลเก่า) แต่คำตอบที่ถูกคือตอบทั้งสองแง่ในประโยคเดียวโดยไม่เดา
5. **"ตอนนี้ยังตอบคำถามนี้ไม่ได้ครับ" ไม่ใช่หลักฐานเผยความเป็น AI** — ต้นทางคือ template `CONSULT_UNAVAILABLE_TEXT` (source `flow`, ไม่ใช่ llm) · เกณฑ์ตรวจติด "ภาษาดูเป็น AI" จากความกำกวม ควรปรับเกณฑ์ให้ดู `source` ก่อน (รายงานมี source แล้วแต่ตัวตัดสินไม่ใช้)

## 3. สรุปสาเหตุ — **ไม่ใช่สาเหตุเดียวกัน** (ตาม Codex)
| รายงานว่า | ความจริง | ระดับ |
|---|---|---|
| A: การ์ด paywall ซ้ำ 3 ครั้ง/10 นาที "บอทวน" | ลูกค้าส่งรูป 3 ครั้ง ระบบตอบ paywall ถูกต้องตามนโยบาย (ไม่วน) · แต่ถ้อยคำซ้ำเป๊ะทุกครั้งไม่รับรู้ว่าลูกค้าพยายามซ้ำ | ไม่ใช่บั๊ก flow · ปรับถ้อยคำได้ (ต่ำ) |
| A: หลัง "ไว้ก่อน" ชวนส่งรูป | **บั๊กจริง**: deferral ใน idle ไม่ถูก consume (ALLOWLIST เฉพาะ paywall state) + consult ไม่ตอบ → fallback nudge ส่งรูป | สูง (ขัดบริบท) |
| A: "ดูฟรีไหม" → "ตอบไม่ได้" | **บั๊กจริง**: ไม่มี router deterministic สำหรับคำถามฟรี/สิทธิ์ + consult ไม่ตอบ → honest fallback ที่ไม่ให้ข้อเท็จจริงที่ระบบมี | สูง |
| A: ส่งการ์ดขายซ้ำหลังถามฟรี | การ์ดที่ 00:56:53 มาจากรูปใบที่ 3 ไม่ใช่ตอบคำถาม | ไม่ใช่บั๊ก |
| B: การ์ดผลสแกนซ้ำ 3 ครั้งโดยไม่ได้ขอ | **false positive**: ลูกค้ากดปุ่ม "ดูผลเก่า" 3 ครั้ง (ข้อความ user ไม่ถูกบันทึกเพราะ dispatcher return ก่อน log) · ส่งจริง 3 = ขอ 3 | ช่องโหว่การบันทึก/เกณฑ์ |
| B: "ไว้ก่อน" | consult ตอบถูกต้อง | ผ่าน |
| A: ข้อความเป็น AI | template ไม่ใช่ LLM | เกณฑ์ตรวจผิด |

## 4. ข้อเสนอแพตช์ (ยังไม่ทำ รอกบ/Codex เคาะ) — เรียงตามผล/ความเสี่ยง
| # | แพตช์ | จุด | regression ที่ต้องเขียนก่อน |
|---|---|---|---|
| P1 | **deferral ใน idle ต้องไม่ชวนส่งรูป**: ก่อนเข้า true-idle consult ถ้า `hasWaitTomorrow(text)` (หรือ intent `wait_tomorrow` จาก catcher) → ตอบ `buildSoftCloseCopy(policy)` แบบ deterministic (AI=0) แล้วจบ · ไม่พึ่ง consult | `lineWebhook.js` ก่อน :8774 (หรือเพิ่ม `idle` ใน ALLOWLIST ของ `wait_tomorrow` + handler) | unit: idle + "ไว้ก่อน" (consult null) → ข้อความ soft close ไม่มี "ส่งรูปมาได้เลย" · policy daily/new_customer/none ให้ถ้อยคำถูก · consult available ก็ยังได้ deterministic (คงที่) |
| P2 | **router deterministic คำถาม "ฟรี/สิทธิ์"** ใน idle และ paywall: จับ `/ฟรี(ไหม|มั้ย|หรือเปล่า|ได้ไหม)|ดูฟรี|สแกนฟรี/` → ตอบจาก `free_policy_status(uid)` + entitlement จริง: (ก) ผลเก่าดูได้ฟรีเสมอ + ปุ่ม "ดูผลเก่า" (ข) สแกนใหม่: daily → ฟรีวันละ N / new_customer → บัญชีนี้ไม่เข้าเกณฑ์ทดลอง (หรือเหลือ X ครั้ง) / none → ต้องเลือกแพ็ก · AI=0 · ไม่สัญญาเกินนโยบาย | ใหม่ `src/services/lineWebhook/freeQuestionReply.util.js` + เรียกจาก `deterministicInfoCommand` lane (:5125) | unit ต่อนโยบาย × บัญชีเก่า/ใหม่/trial เหลือ · ข้อความบอกทั้ง "ผลเก่าฟรี" และสถานะสแกนใหม่ · ไม่มีคำว่า "ตอบไม่ได้" · ห้ามอ้างฟรีรายวันนอกโหมด daily (ซ้ำกับ guard เดิม) |
| P3 | **บันทึก user ให้ครบ**: log ข้อความ user ก่อน dispatcher utility (ย้าย `insertLineConversationMessage(userId,"user",text)` ขึ้นต้น `handleTextMessage` แบบ void) และบันทึกเหตุการณ์รูป/sticker/postback เป็น user row สั้น ๆ (`[รูป]`, `[สติกเกอร์]`, `[ปุ่ม: …]`) พร้อม metadata `{eventType, messageId}` | `lineWebhook.js` :5243 → ต้นฟังก์ชัน · `handleImageMessage` ต้น | unit: "ดูผลเก่า" → มี user row + myscans_card row · รูปโดน paywall → user row `[รูป]` ก่อน paywall · chat-quality detector เห็นคู่ user→bot ครบ |
| P4 | **เกณฑ์ chat quality**: (ก) "ข้อความซ้ำ" ต้องนับเฉพาะ bot ที่ไม่มี user event คั่น **หลัง P3** (ตอนนี้ตัดสินไม่ได้) (ข) "ภาษาดูเป็น AI" ใช้ `source` ก่อน: `flow`/template ไม่นับ (ค) `myscans_card` placeholder ไม่นับเป็น "ส่งโดยไม่ได้ขอ" ถ้ามี user row "ดูผลเก่า" คั่น | `chatQualityDeterministic.util.js` + prompt | unit จากทั้ง 2 เคสนี้เป็น fixture (mask) |
| P5 | **ถ้อยคำ paywall เมื่อโดนซ้ำใน 10 นาที**: ครั้งที่ ≥2 ใช้ข้อความสั้น "ยังใช้สิทธิ์ใหม่ไม่ได้เหมือนเดิมครับ ถ้าอยากดูผลเก่ากด ดูผลเก่า หรือเลือกแพ็กด้านล่าง" (dedupe ด้วย Redis key ต่อ uid 10 นาที) | `freeQuotaPaywallReply.service.js` | unit: ครั้งแรกการ์ดเต็ม ครั้งที่ 2 ข้อความสั้น · ปุ่มเดิมครบ |
| P6 | **หลักฐาน ops**: เก็บ log web แบบคงทน (json-file `max-size/max-file` + ส่ง stdout ไป journald หรือไฟล์ /var/log/ener-scan-pro/) และ/หรือบันทึก `orchestrator.reason`/`consultOutcome` ลง `metadata_json` ของ bot row — ไม่งั้นเคสแบบ A พิสูจน์ต้นเหตุ consult null ไม่ได้อีก | compose/ops (ต้องอนุมัติแยก: แตะ config Pro) | — |
**ลำดับเสนอ:** P1 + P2 (แก้พฤติกรรมที่ลูกค้าเจอจริง) → P3 + P4 (ให้รายงานเชื่อถือได้) → P5 → P6 (ops) · ทุกข้อ AI=0 ไม่เพิ่ม LLM call · ไม่แตะนโยบายฟรี/ราคา · staging ก่อน Pro ตามกติกาเดิม

## 5. สิ่งที่ยังพิสูจน์ไม่ได้ (ต้องมี P6 ก่อน)
- consult ของเคส A คืน null เพราะ timeout (`GEMINI_CONSULT_TIMEOUT_MS`), `empty`, งบ AI ต่อเทิร์นหมด หรือ guard chain — log webhook ช่วง 00:54–00:56 ไทย ไม่มีแล้ว
- จำนวนรูปที่เคส A ส่ง = 3 เป็นการอนุมานจาก reply token ใช้ครั้งเดียว + เส้นโค้ดที่เรียก paywall มีเฉพาะเส้นรูป (ไม่มีแถว upload เพราะถูกปฏิเสธก่อนดาวน์โหลด)
