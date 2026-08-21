# เฟส 2 — LLM customer-output contract: ผล replay 20-21 ส.ค. 2026

สาขา `tone-hard` (ยังไม่ merge / ยังไม่ deploy) · commit 863a798 + 5c0bcc4

## 1. ปิด P0 ทั้ง 6 ข้อของ Codex

| P0 | สิ่งที่ทำ | หลักฐาน |
|---|---|---|
| 1 fail-closed | `enforceLlmCustomerOutput` จับ throw/timeout/ว่างเอง · call แรกล้ม = fallback ทันที · retry ล้ม = fallback จาก violations รอบแรก · ถอด `catch { return out }` ใน consult | test "P0-1 fail-closed" (3 โหมดล้ม × ยืนยัน transport ของ model = 0) |
| 2 typed evidence | `extractClaims` + `verifyClaims` ตรวจค่าจริงรายหมวด · report ID ไม่ปลดล็อก provenance · KB ID ไม่ปลดล็อกคะแนน/พลัง · ID เปล่าไม่พอ | test "P0-2 ID เปล่าปลดล็อกไม่ได้" |
| 3 fixtures จริง | 6 เคสจาก log ถูก reject ครบ: คะแนน 75 · ดวงวันนี้ 75 เลข 7 สีแดง · ตอบมาเป็นหมื่นรอบ · เคยดูมากกว่า 3,689 ชิ้น · แรงสุด 8.9 · วัด ประสาทบุญญาวาส ปีเก่า | test "fixtures จริง 20-21 ส.ค." |
| 4 router contract | `buildIntentContract(ctx, phase1)` สร้าง userIntent/userAskedAdvice/requiredNextAction/expectedRole ก่อนเรียกโมเดล · metadata หาย = ค่าเข้มสุด (`consult` ไม่ใช่ `ajarn`) | test "CHAT_TURN_AI_CHAIN" ท่อนหลัง |
| 5 cardinality | คำถามใน output = reject เว้น `allowQuestion===true` · คำแนะนำ 1 · ขั้นตอน 1 · yes/no ไม่ตรง = "ยังระบุไม่ได้" | test "P0-5" |
| 6 AI budget | `getCustomerAiBudget()` ผูก ALS เดียวกับ CHAT_TURN_AI_CHAIN → consult/phrasing/clarifier/smartRejection/conversationSurface เห็นยอดเดียวกัน ≤2 | test "P0-6" + "CHAT_TURN_AI_CHAIN" |

## 2. Surface ที่ผูก contract แล้ว

| surface | จุดบังคับ | ทำอะไรเมื่อผิด |
|---|---|---|
| `gemini_front_consult` | `enforceLlmCustomerOutput` | regenerate 1 ครั้ง → fallback ข้อเท็จจริง |
| `gemini_front_phrasing` | `enforceLlmCustomerOutput` + evidence จาก allowedFacts | regenerate → fallback |
| `state_safe_clarifier` | `checkLlmCustomerOutput` (JSON mode) | ตัด answer ทิ้ง เหลือ bridge deterministic |
| `smart_rejection` | `checkLlmCustomerOutput` | คืน null → copy คงที่เดิม |
| `conversation_surface` | `checkLlmCustomerOutput` | throw → caller ตกไป deterministic |

`tests/llmSurfaceInventory.test.js` สแกน `src/` ทั้งต้นไม้: ไฟล์ใดเรียกโมเดลแล้วไม่ผูก contract = fail
เว้นไฟล์ในลิสต์ "ไม่ใช่ข้อความแชท" (18 ไฟล์ — JSON สกัดข้อมูล / รายงาน / โพสต์ FB / คลิป YouTube)
และไฟล์ในลิสต์ที่มี transport หาลูกค้าด้วย ต้องมีหมายเหตุ `llm-not-customer-chat:` อธิบายว่าเอาต์พุตโมเดลไม่ไหลเข้าแชท — ไม่ใช่ยกเว้นด้วยชื่อไฟล์เฉย ๆ

## 3. Prompt เขียนใหม่ (ลบกติกาที่ขัด ไม่ใช่ต่อท้าย)

- `geminiPhrasingPrompt.js` — เขียนใหม่ทั้งบล็อก system: ตัวอย่างที่มี ครับ, "invite them warmly", "End with a soft question (สนใจไหมครับ?)", filler (เนอะ/นะ/จริงๆ), age-based warm tone → ออกทั้งหมด แทนด้วยกติกาโทนแข็ง + เพดานความยาว + กติกาข้อเท็จจริง
- `geminiConsultPrompt.js` — ลบ/แทนที่รายข้อ: "KEEP IT SHORT 2-4 lines" → 1 ประโยค ≤40 ตัวอักษร · "ลูกค้าขอบคุณ → ตอบรับสั้น ๆ เช่น ขอบคุณเช่นกันครับ" → เงียบ · "รับทราบสั้น ๆ อบอุ่น" → ตอบ รับทราบ คำเดียว · "คุยเป็นเพื่อนคุยไปเลย" → ตอบเฉพาะสิ่งที่ถาม · **ลบตัวอย่างที่เป็นต้นตอของ "ตอบเรื่องพวกนี้มาเป็นหมื่นรอบ" และมุกตอบเรื่องบอททั้ง 3 มุม** · เพิ่มบล็อกกติกาบังคับไว้หัว VOICE & FORMAT ระบุชัดว่าเหนือกติกาโทนอื่นทุกข้อในพรอมป์

## 4. Replay บทสนทนาจริง 20-21 ส.ค. (Pro, อ่านอย่างเดียว)

ดึงจาก `line_conversation_messages` ช่วง 20 ส.ค. 00:00 – 21 ส.ค. 24:00 (เวลาไทย) โดยไม่ดึง `line_user_id` (ใช้ hash 6 ตัวจัดกลุ่มบทสนทนาแทน)

| ตัวเลข | ค่า |
|---|---|
| บทสนทนา | 52 |
| ข้อความบอทที่เป็นข้อความถึงลูกค้าจริง | 203 |
| marker ระบบ (`[ส่งรายงาน...]`) ที่ไม่นับ | 104 |
| **fixed** (เคยผิดกติกา → guard ปัจจุบันจับได้) | **203** |
| **still failing** (ผิดแล้ว guard ไม่จับ) | **0** |
| already fixed (ไม่เคยผิด) | 0 |
| false positive (guard จับแต่ที่จริงถูก) | 0 |

กระจายตาม replyType: pre_scan_ack 102 · object_info_gate_ask 68 · gemini_front_consult 10 · payment_qr_instructions_bundle 3 · ที่เหลือรายละ 1-2 (slip_approved, multiple_objects, image_retake_required, scan_in_flight_wait, free_quota_exhausted, daily_pick_notify_toggle, scan_energy_helper, paywall_deferred)

ตรวจซ้ำที่ **ต้นทาง**: หยิบข้อความเก่าที่ไม่ซ้ำกัน 32 แบบ ไปค้นในซอร์สปัจจุบัน — พบ 3 ชิ้นที่ยังมี "โครงประโยคเดิม" แต่เวอร์ชันในซอร์สเป็นเวอร์ชันโทนแข็งแล้วทั้งหมด (ไม่มี ครับ/คำชวน) ที่เหลือ 29 แบบไม่มีในซอร์สอีกแล้ว → ไม่มีทางผลิตซ้ำ

รายละเอียดรายข้อความ (inbound, outbound, replyType, speakerRole, source/route, จำนวน AI call, evidence) อยู่ที่ไฟล์ replay ใน scratchpad ของ session — สรุปที่นับได้อยู่ในตารางด้านบน

## 5. Release gate

`bash scripts/test-baseline-check.sh` → **ไม่มี fail ใหม่นอก baseline** (167/173 ไฟล์, 14 leaf ที่ fail อยู่ใน `tests/known-failing.txt` ทั้งหมด)
เทสต์ใหม่: `tests/llmOutputContract.test.js` 18/18 · `tests/llmSurfaceInventory.test.js` 4/4 · `tests/turnAiChain.test.js` 10/10

## 6. ค้างก่อน merge

- **staging smoke ด้วยบัญชีจริง** — ต้องให้กบสั่ง deploy `tone-hard` ขึ้น staging ก่อน (ยังไม่ทำ เพราะกติกา: `tone-hard` ห้ามปนกับ bundle 055 ที่ GO ไว้แล้วและยังรอขึ้น Pro)
- หลัง smoke ผ่าน จึงขอ merge + deploy
