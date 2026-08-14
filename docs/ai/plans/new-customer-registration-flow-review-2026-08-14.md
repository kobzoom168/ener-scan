# New Customer Registration Flow Review — 14 ส.ค. 2026

สถานะ: **IMPLEMENTED ON STAGING ที่ `7c66720` — ยังมี blockers ก่อน deploy Pro**

## Codex review — commit `7c66720` (14 ส.ค. 2026)

ยืนยันจากโค้ดแล้วว่า flow หลักทั้ง 8 ข้อถูกนำไปทำบน staging: follow แบบ registration-first, durable hold, รูปที่สองไม่ตั้งใจ overwrite, pending description, LIFF/chat completion transition, resume token, chat fallback, cooldown, cleanup ledger และ telemetry พื้นฐาน

อย่างไรก็ตาม ยังไม่ควรขึ้น Pro จนปิดประเด็นต่อไปนี้:

1. **Blocker — resume ลบ hold หลังฟังก์ชัน `finalizeAcceptedImage()` return ไม่ใช่หลัง scan ingest สำเร็จจริง**
   - ฟังก์ชันนี้คืน `void` ทั้งกรณีเข้าคิว scan, paywall, abuse lock, slip route และ validation/rejection หลายชนิด
   - `maybeHandlePreRegResume()` เรียก `consumeHoldAfterIngest()` ทันทีเมื่อไม่มี exception จึงอาจลบ metadata/ไฟล์ แม้ลูกค้าเพียงเจอ paywallหรือรูปไม่ได้เข้า scan job
   - ต้องเปลี่ยน contract ให้คืน typed outcome เช่น `scan_enqueued | payment_held | slip_handled | rejected | failed` และ consume pre-reg hold เฉพาะ outcome ที่มี durable owner ของรูปแล้วเท่านั้น พร้อม test behavior ไม่ใช่ source-order

2. **Blocker — success notification dedupe ก่อนยืนยัน delivery**
   - `sendRegistrationSuccessFlow()` จอง dedupe key ก่อน `client.pushMessage()` หาก LINE push ล้ม ลูกค้าจะไม่ได้การ์ด resume และ retry ถูก suppress 24 ชั่วโมง
   - ใช้ delivery-aware/idempotent state: pending → sent หลัง gateway ยืนยัน หรือ clear dedupe เมื่อส่งล้ม และมี retry/alert

3. **High — hold รูปแรกยังมี race ข้าม container**
   - `holdFirstImage()` ทำ `peek → upload → save` โดยไม่มี lock/CAS รูปสองรูปที่เข้าพร้อมกันอาจเห็นว่าไม่มี hold ทั้งคู่ แล้วรูปหลัง overwrite metadata รูปแรกและสร้าง orphan
   - ต้อง lock ต่อ uid ก่อน peek/upload/save หรือใช้ atomic claim; หลังได้ lock ให้ re-check hold และเพิ่ม concurrent test จริง

4. **High — upload สำเร็จแต่ save metadata ล้มทำให้ไฟล์ orphan นอก ledger**
   - ปัจจุบัน `ledgerAdd()` เกิดหลัง `saveHold()` ถ้า upload สำเร็จแต่ Redis save ล้ม จะ return failed โดยไม่มี ledger cleanup
   - จด ledger ทันทีหลัง upload ก่อน save หรือชดเชยด้วย delete เมื่อ save ล้ม พร้อม telemetry/test

5. **High — resume lock TTL 120 วินาทีสั้นกว่าเวลาสแกนที่ประกาศ 1–3 นาที**
   - หากงานเกิน 120 วินาที ปุ่มเดิมอาจเริ่มรอบสองก่อนรอบแรก consume
   - ใช้ lock TTL ครอบ worst case พร้อม heartbeat/renewal หรือแยก idempotency key ของ scan enqueue ที่ durable

6. **Test gap — 14 scenarios ส่วนสำคัญหลายข้อพิสูจน์ด้วย source-text order**
   - ยังไม่มี integration/contract test ที่ยืนยัน typed scan outcome, paywall แล้ว hold ไม่หาย, push failure retry ได้, concurrent images มี owner เดียว, upload-save compensation และ resume timeout ไม่ทำซ้ำ

ข้อสังเกตไม่เป็น blocker: `REGISTRATION_REQUIRED_FIELDS` ถูกประกาศเป็น SSOT แต่ gate และ LIFF ยังเขียนเงื่อนไขสามช่องซ้ำเอง จึงยังมีโอกาส drift ควรย้าย `isComplete` เป็น helper เดียวที่ทุกเส้นเรียกจริง

## เคสจริง

ลูกค้าใหม่ Add LINE → ได้ welcome + registration card + how-to card → กด `เข้าใจแล้ว` → ระบบบอก `ส่งรูปชิ้นแรกมาได้เลยครับ` → ลูกค้าส่งรูปพระและพิมพ์ชื่อพระ → ระบบส่ง registration card ซ้ำ 2 ครั้ง → ลูกค้าบล็อก OA

หลักฐานภาพจากเจ้าของ: ลูกค้าส่งรูปสมเด็จและข้อความ `สมเด็จแหวกม่าน หลวงพ่อกวย วัดโฆสิตาราม` แต่ระบบไม่ acknowledge รูป/ชื่อพระ กลับแสดงการ์ดลงทะเบียนซ้ำ

หมายเหตุ: ภาพหนึ่งเคสยังพิสูจน์ไม่ได้ว่าการวนเป็นสาเหตุเดียวของการ block แต่ flow มี friction และคำสั่งขัดกันชัดเจน

## Root cause จากโค้ด

1. `handleFollowEvent` ใน `src/routes/lineWebhook.js` ส่งพร้อมกัน:
   - welcome text
   - registration Flex (เมื่อ gate เปิด)
   - how-to Flex พร้อมปุ่ม `เข้าใจแล้ว เริ่มเลย`
2. `maybeHandleHowtoAck` ใน `src/services/welcome/howtoFlow.service.js` ตอบ `ส่งรูปชิ้นแรกมาได้เลยครับ ฟรีวันละ 1 ชิ้น` โดยไม่ตรวจ registration state จึงชวนส่งรูปทั้งที่ gate จะบล็อก
3. `finalizeAcceptedImage` ตรวจ `shouldBlockForRegistration()` ก่อน `setPendingImage()` เมื่อ block แล้ว return ทันที รูปที่ลูกค้าส่งจึงไม่ถูกพักเพื่อ resume
4. text handler ตรวจ registration gate ก่อน intent/AI ทุกครั้ง ข้อความชื่อพระที่ส่งต่อมาจึงไม่ถูกเก็บ แต่ trigger registration card ซ้ำ
5. `shouldBlockForRegistration` fail-open หลังเกิน 3 blocks ซึ่งขัด requirement เจ้าของที่ต้องการข้อมูลลูกค้าใหม่ และไม่ได้เป็น fallback เก็บข้อมูลแบบอื่นอย่างชัดเจน
6. LIFF save สำเร็จ push ว่า `ส่งรูป...มาได้เลย` แต่ไม่มี pending pre-registration image ให้ resume ลูกค้าจึงต้องส่งรูปใหม่

## Flow เป้าหมาย

### A. Add friend — ยังไม่ลงทะเบียน

ส่งเพียง:

1. welcome สั้นในเสียงแอดมิน
2. registration card ใบเดียว

ยังไม่ส่ง how-to card และยังไม่บอกให้ส่งรูป จน registration สำเร็จ

ตัวอย่าง:

> สวัสดีครับ ผมแอดมิน Ener Scan  
> ก่อนส่งรูป ขอข้อมูลสำหรับผูกผลอ่านกับเจ้าของสักครู่นะครับ ใช้ประมาณ 1 นาที แล้วส่งรูปชิ้นแรกได้ฟรีเลยครับ

CTA แนะนำ: `กรอกข้อมูลเพื่อเริ่มอ่านพลัง` แทน `ลงทะเบียนกับอาจารย์`

### B. Registration สำเร็จ

- ส่ง success acknowledgement
- จากนั้นส่ง how-to 5 ขั้น
- ถ้าไม่มีรูปค้าง: ชวนส่งรูป
- ถ้ามีรูปค้าง: แจ้งว่ารับรูปเดิมไว้แล้วและให้เริ่ม/ระบบ resume โดยไม่ต้องส่งใหม่

### C. ส่งรูปก่อนลงทะเบียน

- รับและเก็บรูปแบบ durable ก่อน gate (storage/DB/Redis metadata; ห้ามพึ่ง process memory อย่างเดียว)
- ผูก `pendingRegistrationImageId`, LINE message id, thumbnail และเวลาหมดอายุ
- ตอบชัดว่า `รับรูปไว้แล้ว ไม่ต้องส่งซ้ำ`
- ส่ง registration card เพียงครั้งเดียว
- หลัง registration สำเร็จ resume รูปเดิม หรือให้ปุ่ม deterministic `เริ่มอ่านรูปนี้`

ตัวอย่าง:

> รับรูปสมเด็จไว้แล้วครับ ยังไม่ต้องส่งซ้ำ  
> เหลือกรอกข้อมูลเจ้าของอีกขั้นเดียว จากนั้นแอดมินส่งรูปนี้ให้อาจารย์ทันทีครับ

### D. ลูกค้าพิมพ์ชื่อ/รายละเอียดก่อนลงทะเบียน

- เก็บเป็น `pendingDescription` ผูกกับ pending image
- ไม่ส่ง Flex ใบใหญ่ซ้ำทุกข้อความ
- ตอบ reminder สั้นพร้อม quick reply/ปุ่มเปิดฟอร์ม

ตัวอย่าง:

> รับชื่อพระไว้แล้วครับ — สมเด็จแหวกม่าน หลวงพ่อกวย  
> เหลือกรอกข้อมูลเจ้าของอีกขั้นเดียว แล้วแอดมินส่งรูปนี้ให้อาจารย์ครับ

### E. เปิด LIFF ไม่ได้/ไม่ถนัด

- ห้าม fail-open เงียบ ๆ หาก requirement ยังบังคับข้อมูล
- มี fallback ให้แอดมินเก็บข้อมูลในแชททีละช่อง: ชื่อเล่น → วันเกิด → เบอร์โทร
- ระบุเหตุผลการใช้ข้อมูลและ consent ให้ตรงการใช้งานจริง

## Copy / Trust ที่ต้องแก้

- เลิกใช้ `ปลอดภัย 100%` ซึ่งเป็นคำรับรองเด็ดขาด
- อธิบายว่าขอข้อมูลแต่ละช่องเพื่ออะไร โดยเฉพาะเบอร์โทร
- หากนำเบอร์ไปทำการตลาด ต้องมี consent แยกจากการให้บริการ
- CTA และข้อความต้องเป็นเสียงแอดมิน ไม่ใช่อาจารย์ เพราะเป็นงานข้อมูล/ระบบ

ตัวอย่าง footer:

> ใช้ชื่อและวันเกิดเพื่อผูกผลอ่านกับเจ้าของ เบอร์โทรใช้ติดต่อเรื่องสิทธิ์และบริการเท่านั้น

## Anti-loop rules

- registration Flex สูงสุด 1 ใบต่อ pending registration ในช่วง cooldown 10–30 นาที
- ข้อความถัดไประหว่าง cooldown ใช้ reminder สั้น ไม่ยิง Flex ซ้ำ
- รับ/เก็บรายละเอียดวัตถุแม้ registration ยังไม่เสร็จ
- ทุก reply ต้องบอกสถานะของรูป: `รับไว้แล้ว` / `ยังไม่มีรูป` / `ต้องส่งใหม่เพราะหมดอายุ`
- fallback หลังเปิดไม่ได้ต้องเป็น chat collection หรือ human assist ไม่ใช่ปล่อย gate ผ่านโดยไม่มีข้อมูล

## Telemetry

- `registration_card_shown`
- `registration_opened`
- `registration_step_completed`
- `registration_saved`
- `image_received_before_registration`
- `pending_registration_image_resumed`
- `pending_registration_image_expired`
- `registration_reminder_shown`
- `registration_card_suppressed_cooldown`
- `registration_chat_fallback_started/completed`
- `blocked_or_unfollowed_before_registration` (หาก LINE signal รองรับ)

KPI: follow→open, open→save, image-before-reg→save, pending-image resume success, Flex repeats/user, registration completion time และ block/unfollow หลัง prompt

## Acceptance criteria ก่อนขึ้น pro

1. Unregistered follow ไม่ได้รับคำสั่ง `ส่งรูปได้เลย` ก่อน registration
2. ส่งรูปก่อน registration แล้วระบบตอบว่ารับรูปไว้และไม่ต้องส่งซ้ำ
3. พิมพ์ชื่อพระต่อแล้วระบบเก็บรายละเอียดและไม่ส่ง Flex ซ้ำภายใน cooldown
4. Registration สำเร็จแล้วรูปเดิม resume ได้เพียงครั้งเดียว ไม่หายและไม่สแกนซ้ำ
5. หลาย container/restart ระหว่าง flow แล้ว pending image ยังอยู่
6. LIFF save/cache bust race ไม่ส่ง registration card หลังบันทึกสำเร็จ
7. LIFF เปิดไม่ได้มี chat fallback ที่จบ registration ได้
8. ไม่มี `ปลอดภัย 100%`; privacy/consent copy ตรงการใช้งานจริง
9. มี tests: follow registered/unregistered, image-before-reg, text-after-image, duplicate event, cooldown, expiry, LIFF success resume, multi-instance และ fallback

## ข้อความส่ง Claude

> เก็บงานนี้เป็น OPEN registration-flow hardening: root cause คือ follow ส่ง registration+how-to พร้อมกัน, how-to ack ชวนส่งรูปทั้งที่ยังติด gate, image gate return ก่อน setPendingImage จึงทิ้งรูป, text ชื่อพระ trigger Flex ซ้ำ และ after-3 fail-open ขัด requirement ข้อมูลลูกค้าใหม่ ให้ปรับเป็น registration-first onboarding, durable pending image+description ก่อน gate, resume หลัง LIFF save, Flex cooldown+short reminder, chat fallback แทน silent fail-open และ telemetry/acceptance criteria ตามเอกสารนี้ โดยยังไม่ลงมือจนเจ้าของเคาะ
