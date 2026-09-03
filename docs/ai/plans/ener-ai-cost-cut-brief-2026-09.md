# Ener Scan — ลดค่า AI ให้มากที่สุด (brief สำหรับถาม AI ภายนอก · 3 ก.ย. 2026)

คุณคือที่ปรึกษาสถาปัตยกรรม AI/infra ช่วยวิเคราะห์และเสนอแผนลดค่าใช้จ่าย AI ของระบบนี้ให้เหลือน้อยที่สุด
ตอบเป็นภาษาไทย เรียงตาม "เงินที่ลดได้จริง ÷ ความเสี่ยงต่อคุณภาพ" และระบุสิ่งที่ต้องติดตั้ง/งบเพิ่มให้ชัด

## 1. ระบบคืออะไร

LINE OA "Ener Scan" — ลูกค้าส่งรูปพระเครื่อง/วัตถุมงคล → ระบบอ่าน "พลัง" ออกรายงาน HTML + แชทถามต่อได้
- ราคา: ฟรี 1 สแกน/วัน · 29฿ 1 ครั้ง · 49฿ 4 ครั้ง/24ชม · 399฿ 30 ครั้ง/30วัน
- ปริมาณจริง 30 วันล่าสุด (production): **สแกนสำเร็จ 389 ครั้ง = free 166 / paid 223** (~13/วัน)
- มีระบบเสริม: โพสต์ FB อัตโนมัติ (แคปชัน LLM), วิดีโอ YouTube รายวัน (สคริปต์เสียง LLM + TTS ElevenLabs), แชทหลังสแกน

## 2. เครื่องที่มี

- VPS เดี่ยว: 4 vCPU, RAM รวม 8GB (**ว่างจริง ~3GB**), ดิสก์เหลือ ~16GB, **ไม่มี GPU**
- มี sidecar vision อยู่แล้วบนเครื่อง: **DINOv2 embedding + LightGlue matcher** (จำวัตถุเดิมข้ามรูป ใช้งานจริงบน production)
- Stack: Node ESM + Postgres/PostgREST + Redis · เรียก LLM ผ่าน OpenRouter ทั้งหมด

## 3. ค่าใช้จ่ายจริง (OpenRouter CSV เต็ม 30 วัน: 5 ส.ค. – 3 ก.ย. 2026)

**รวม $65.51 (~2,360฿) · เฉลี่ย $2.18/วัน · 33,040 calls**
(หมายเหตุ: เดือนนี้มี traffic ทดสอบ staging ปนอยู่ด้วย เพราะใช้ key เดียวกัน — ตัวเลขจริงของลูกค้าล้วนต่ำกว่านี้เล็กน้อย)

แยกตาม model:

| model | calls | cost | ใช้ทำอะไร |
|---|---|---|---|
| gpt-4.1 (เต็ม) | 8,364 | **$35.84** | objectCheck (จำแนก/คัดกรองวัตถุ หลาย variant), deepScan.draft (ร่างคำอ่าน), imageForensic (จับรูปถ่ายจากจอ), + ก้อนไม่ติดป้าย |
| gpt-4.1-mini | 16,184 | **$18.74** | objectSameIdentityVerifier (ยืนยันวัตถุเดิม $5.43/4,369 calls), stableFeatureExtract, objectEmbedding.descriptor, deepScan, + ไม่ติดป้าย |
| claude-opus-4.8 | 570 | **$9.34** | แชทตอบลูกค้า (persona อาจารย์), voiceScript (สคริปต์คลิป), consult |
| deepseek-v4-flash | 4,192 | $0.90 | แคปชัน FB/ข้อความบริการ |
| gemini-2.5-flash(+lite) | 656 | $0.69 | จำแนกวัตถุ second-opinion, parse ข้อมูลลูกค้า |
| text-embedding-3-small | 3,074 | ~$0 | embedding descriptor |

call-site ที่กินเงินสุด (จาก tag ที่มี): objectCheck.strict $6.91 · deepScan.draft $5.99 · objectSameIdentityVerifier $5.43 · imageForensic.screen_check $4.03 · stableFeatureExtract $2.50 · objectCheck.crystal_family $2.38 · descriptor $1.48 · voiceScript $1.36

## 4. สิ่งที่วิเคราะห์ไว้แล้วรอบก่อน (ฉันทามติ 3 AI + เทียบโค้ดจริง — ยังไม่ได้ลงมือ)

**Tier 0 — แก้โค้ด ไม่ติดตั้งอะไร (ลด ~30–35%):**
1. **T0-1** verifier 2D: ตอนนี้ LLM verify ทุก candidate (เฉลี่ย ~5 calls/สแกน) ทั้งที่มี LightGlue gate ใช้อยู่แล้วในเส้นทาง 2G → เอา gate เดียวกันมาคั่น (inliers ≥25 = ใช่ / <12 = ไม่ใช่ โดยไม่เรียก LLM, ก้ำกึ่งส่ง LLM เฉพาะ top-1)
2. **T0-2** รวม descriptor + stableFeature (2 calls รูปเดียวกัน) → 1 call
3. **T0-3** forensic: heuristic บนเครื่อง (EXIF/moiré/ขอบจอ) กรองก่อน + เคสก้ำกึ่งใช้ mini แทน 4.1
4. **T0-4** objectCheck หลาย variant (strict/crystal/low_shadow/permissive) → รวมเป็น call เดียว หรือเรียก variant เพิ่มเฉพาะเมื่อ strict ก้ำกึ่ง
5. เปลี่ยน text-embedding → โมเดล CPU บนเครื่อง (ตัด dependency, เงิน ~0)

**Tier 1 — CPU บนเครื่องนี้:** Piper/Kokoro TTS แทน ElevenLabs เฉพาะคลิป FB/YT (voice note ลูกค้าคง ElevenLabs) · PaddleOCR สลิป
**Tier 2 — GPU serverless (RunPod/Modal ~$5–30/เดือน):** Qwen2.5-VL-7B ทำ draft คำอ่าน — ทางเดียวที่จะเลิก external ได้จริง แต่ต้อง shadow + blind test ก่อน
**ข้อจำกัดยืนยันแล้ว:** VPS นี้รัน vision-LLM ไม่ได้ (ไม่มี GPU, RAM ไม่พอ) — "ติดตั้งบนเครื่อง" ทำได้เฉพาะงาน CPU เบา (matcher ที่มีอยู่, OCR, TTS, embedding เล็ก)

## 5. ไอเดียใหม่ที่ต้องการความเห็น: แยก free / paid

เจ้าของระบบเสนอ: **คนสแกนฟรี → ใช้ระบบบนเครื่อง/ตัวถูกให้มากที่สุด · คนจ่ายเงิน → ใช้ AI เต็มคุณภาพ**

ข้อเท็จจริงประกอบ:
- free 166 สแกน/เดือน ≈ 43% ของปริมาณ แต่รายได้ = 0 — ทุกบาทที่ลดตรงนี้คือกำไรตรง ๆ
- แต่รายงานฟรีคือหน้าร้าน: ถ้าคุณภาพต่างชัด ลูกค้าฟรีอาจไม่ convert เป็นคนจ่าย
- ตัวเลือกที่เป็นไปได้บนเครื่องปัจจุบัน (ไม่มี GPU): "free pipeline ประหยัด" = ใช้ mini ทุกจุด, ข้าม objectCheck variants, ไม่มีรอบ rewrite/draft-polish, verifier ใช้ LightGlue อย่างเดียวไม่เรียก LLM, forensic เป็น heuristic ล้วน — คำอ่านหลักยังเป็น LLM ตัวถูก (mini หรือ deepseek/gemini-flash)

## 6. คำถามที่ขอคำตอบ

1. ลำดับที่คุ้มสุดตอนนี้: ทำ Tier 0 ให้จบก่อน หรือกระโดดทำ free/paid split เลย หรือทำคู่กัน? (มีแรงทำทีละอย่าง)
2. free/paid split: ออกแบบยังไงไม่ให้รายงานฟรี "ดูถูกลง" จนเสีย conversion — จุดไหนตัดได้โดยลูกค้าไม่รู้สึก จุดไหนห้ามตัด?
3. มีวิธีลดก้อน gpt-4.1 เต็ม ($35.8 = 55% ของบิล) ที่เร็วกว่า/ง่ายกว่าที่วางไว้ไหม เช่น สลับเป็น mini + confidence-based escalation ทั้งกระดาน?
4. แชท opus 4.8 ($9.3): ควรลดเป็นรุ่นถูกเมื่อไหร่/เงื่อนไขไหน โดยไม่เสียบุคลิก "อาจารย์"?
5. ที่ปริมาณ 13 สแกน/วัน — Tier 2 (GPU serverless สำหรับ draft) คุ้มหรือยัง หรือรอปริมาณโตก่อน? จุดคุ้มทุนอยู่ตรงไหน?
6. เป้าที่สมจริง: บิล $65/เดือน กดเหลือเท่าไหร่ได้โดยคุณภาพ paid ไม่ตก? ($/เดือน หลังทำครบทุกข้อที่คุณเสนอ)
