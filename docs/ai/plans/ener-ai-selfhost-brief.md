# Ener Scan — เอกสารสรุประบบสำหรับขอไอเดีย "ย้าย AI มารันบนเซิร์ฟเวอร์ตัวเอง"

เอกสารนี้เขียนให้ AI/ที่ปรึกษาภายนอกอ่านได้โดยไม่ต้องเห็นโค้ด ทุกตัวเลขวัดจริงจากระบบ production ช่วง 21–28 ส.ค. 2026 ยกเว้นที่ระบุว่าเป็นประมาณการ

---

## 1. ระบบคืออะไร

**Ener Scan** เป็นบริการบน LINE Official Account (ภาษาไทย) ลูกค้าส่งรูป "วัตถุมงคล" (พระเครื่อง เครื่องราง หิน/คริสตัล กำไล) เข้ามาในแชท ระบบจะ

1. ตรวจว่ารูปเป็นวัตถุมงคลชิ้นเดียวจริงไหม (ไม่ใช่รูปคน/หลายชิ้น/ของอื่น)
2. ตรวจว่าเป็นภาพถ่ายของจริง ไม่ใช่ถ่ายจากหน้าจอ รูปโหลดจากเน็ต หรือรูปตัดต่อ
3. ตรวจว่าเคยสแกนชิ้นเดียวกันนี้มาก่อนไหม (ทั้งของลูกค้าคนเดิมและข้ามบัญชี) เพื่อไม่อ่านซ้ำและใช้ผลเดิม
4. เขียน "คำอ่านพลังงาน" ภาษาไทยเฉพาะบุคคล (คะแนน 6 แกน เช่น เมตตา คุ้มครอง หนุนดวง + คำอธิบาย) ทำเป็นการ์ดรูป (PNG) และรายงานเว็บ
5. ส่งกลับใน LINE พร้อม voice note เสียงโคลนของเจ้าของ (อาจารย์) และคลิปสั้นอัตโนมัติขึ้น Facebook page / YouTube Shorts
6. คุยต่อในแชทได้ (ถามเรื่องพลัง แพ็ก สิทธิ์ ฯลฯ) มี 2 บทบาท: "แอดมิน" ตอบเรื่องบริการ/เงิน และ "อาจารย์" ตอบเรื่องพลังจากผลอ่าน
7. ระบบชำระเงิน: สแกนฟรี 1–2 ครั้ง/วัน แพ็ก 29/49/399 บาท จ่ายผ่าน PromptPay โอนแล้วส่งสลิปในแชท ระบบอ่านสลิปและอนุมัติ

ปริมาณ: ~230 สแกน/สัปดาห์ (~1,000/เดือน) ผู้ใช้ active ~70 คน/สัปดาห์ เป้าหมายโต 10 เท่า

## 2. สถาปัตยกรรมตอนนี้

- **แอปหลัก**: Node.js (Express) 1 process + worker 3 ตัว (scan / delivery / maintenance) รันใน Docker
- **ข้อมูล**: PostgreSQL (ผ่าน PostgREST) + Redis (คิว งานสแกน dedupe cache สถานะแชท)
- **ไฟล์**: Cloudflare R2 (รูป การ์ด เสียง คลิป)
- **ช่องทาง**: LINE Messaging API (รับ/ส่ง), Telegram (แจ้งเตือนแอดมิน), Facebook Graph API, YouTube Data API (ผ่านบริการย่อย ener-ai)
- **สื่อ**: ffmpeg สร้างคลิปซูมการ์ด 5 วินาที + ใส่เพลง (รันในเครื่อง ไม่ใช่ AI)
- **AI ในเครื่องที่มีแล้ว**: บริการ `ener-vision` (Python/FastAPI/torch, CPU) ให้ 2 อย่าง
  - `/embed` = DINOv2 `vits14` embedding vector ของรูป
  - `/match` = SuperPoint + LightGlue จับคู่จุดเด่นระหว่าง 2 รูป คืนจำนวน inliers
  - ใช้ RAM ~700 MB, จำกัด torch 2 threads, CPU พีค ~180% ตอนสแกน
- **ระบบแยก**: ener-ai (FastAPI: อัปโหลด YouTube/Facebook, หน้าแอดมิน), n8n + Temporal (auto post), เว็บ my-ener.uk (static)

## 3. เซิร์ฟเวอร์ที่มี (ข้อจำกัดสำคัญ)

| รายการ | ค่า |
|---|---|
| ผู้ให้บริการ | VPS (Contabo) เครื่องเดียว |
| CPU | 4 vCPU AMD EPYC Genoa |
| RAM | 7.5 GB (ใช้อยู่ ~2 GB ว่าง ~3–4 GB) |
| GPU | ไม่มี |
| ดิสก์ | 75 GB ใช้ไป 79% เหลือ ~16 GB |
| Containers | ~15 ตัว (pro + staging + legacy + sidecar + n8n/temporal + postgres) |

ข้อจำกัดที่ต้องคิด: โมเดลที่ต้องการ RAM > 3 GB หรือ GPU รันในเครื่องนี้ไม่ได้โดยไม่กระทบแชทที่รันอยู่ ถ้าจะทำจริงจังต้องเพิ่มเครื่อง/เช่า GPU/ใช้ serverless

## 4. AI ภายนอกที่ใช้อยู่ทั้งหมด (วัดจริง 7 วัน 21–28 ส.ค. 2026 บน production)

สแกนสำเร็จ 232 ชิ้น, LLM รวม **5,002 calls** (≈ 21.5 calls ต่อสแกน), input **10.7 ล้าน tokens**, output 0.36 ล้าน tokens

### 4.1 ต่อ 1 สแกน (ลำดับที่เรียก)

| ลำดับ | ชื่อ call | ทำอะไร | โมเดล | calls/7d | calls/สแกน | input tokens/7d | ประมาณ $/สัปดาห์ |
|---|---|---|---|---|---|---|---|
| 1 | objectCheck.strict | ดูรูปแล้วตอบว่า "เป็นวัตถุมงคลชิ้นเดียวที่รองรับไหม" (JSON) | gpt-4.1 (vision) | 513 | 2.2 | 1.24M | 2.49 |
| 1b | objectCheck.crystal_family / low_shadow / permissive / bracelet_form | ตรวจซ้ำกรณีหิน/คริสตัล, กรณีคะแนนต่ำ, กำไล | gpt-4.1 (vision) | ~330 | 1.4 | ~0.39M | 0.93 |
| 2 | imageForensic.screen_check | ตรวจว่าถ่ายจากจอ / AI-generated / ตัดต่อ บังคับให้ชี้หลักฐานที่เห็น (moiré, ขอบจอ, UI, halo) | gpt-4.1 (vision) | 241 | 1.0 | 0.35M | 1.07 |
| 3 | objectSameIdentityVerifier | ดู 2 รูป (รูปใหม่ vs รูปเดิมในคลัง) ตอบว่า "ชิ้นเดียวกันไหม" ทำหลัง embedding recall ได้ candidate มา 5 ตัว | gpt-4.1-mini (vision) | **1,186** | **5.1** | **3.41M** | 1.46 |
| 4 | objectEmbedding.descriptor | ให้ vision LLM เขียน "คำบรรยายเอกลักษณ์ที่ไม่ขึ้นกับมุม" ของชิ้น เพื่อไปทำ embedding | gpt-4.1-mini (vision) | 468 | 2.0 | 1.13M | 0.48 |
| 5 | text-embedding-3-small | แปลงคำบรรยายข้อ 4 เป็น vector สำหรับ recall | OpenAI embeddings | 467 | 2.0 | 16k | ~0 |
| 6 | stableFeatureExtract | สกัด "ลักษณะคงที่" ของชิ้น (วัสดุ รูปทรง ลาย) เป็นข้อมูลกลางสำหรับ cache/ใช้ซ้ำข้ามบัญชี | gpt-4.1-mini (vision) | 438 | 1.9 | 1.43M | 0.68 |
| 7 | deepScan | อ่านรูปให้คะแนน/แกนพลังแบบ structured (output สั้นมาก ~4 tokens/call = JSON ตัวเลข) | gpt-4.1-mini (vision) | 394 | 1.7 | 0.91M | 0.36 |
| 8 | deepScan.draft | **เขียนคำอ่านภาษาไทยตัวจริง** ที่ลูกค้าอ่าน (นี่คือสินค้า) | gpt-4.1 (vision) | 210 | 0.9 | 0.56M | 1.63 |
| 9 | fbCaption / ytShortCaption | แคปชันโพสต์ Facebook / YouTube (ห้ามบอกประเภทวัตถุ มี sanitizer) | deepseek-v4-flash | 448 / 20 | 2.0 | 0.21M | 0.05 |
| 10 | voiceScript | สคริปต์เสียงอาจารย์สรุปชิ้นนี้ (ก่อนส่ง TTS) | claude-opus-4.8 | 22 | 0.1 | 16k | ~0.4 |
| 11 | TTS เสียงโคลน | แปลงสคริปต์เป็นเสียงโคลนของเจ้าของ (voice note + เสียงในคลิป YouTube/FB) | **ElevenLabs** (v3 voice clone) | 22 voice note + ~229 คลิป | ~1 | นอก log | subscription |

### 4.2 แชท/บริการอื่น (เรียกเฉพาะเมื่อลูกค้าพิมพ์ หรือเป็นงานเบื้องหลัง)

| ชื่อ call | ทำอะไร | โมเดล | calls/7d |
|---|---|---|---|
| planner | วางแผนว่าข้อความลูกค้าควรเข้าเส้นทางไหน (JSON action) | gemini-2.5-flash | 19 |
| consult | ตอบคำถามพลัง/คำแนะนำในบทบาทอาจารย์ โดยมีผลอ่านจริงของลูกค้าเป็นบริบท (prompt ~35k chars) | deepseek-v4-flash | 56 |
| phrasing / stateSafeClarifier / semanticCatcher / objectInfoParse | เรียบเรียงข้อความบริการ / ถามกลับเมื่อกำกวม / จับความหมายข้อความสั้น / แยกช่อง "ชื่อพระ วัด ปี" จากข้อความลูกค้า | gemini-2.5-flash | ~60 |
| synergyReport | เนื้อความ "จัดชุดพลัง" จากคลังลูกค้า 1 call/คน/วัน (cache 26 ชม.) | deepseek-v4-flash | 65 |
| chatQuality | ตรวจคุณภาพแชทรายวัน (monitor ภายใน ไม่ถึงลูกค้า) | deepseek-v4-flash | 47 |
| slipVisionClassifier / slipOcrExtractor | อ่านสลิปโอนเงิน ตรวจว่าเป็นสลิปจริง ดึงยอด/เวลา/เลขอ้างอิง | gpt-4.1-mini (vision) | 7 |
| smartRejection | ข้อความปฏิเสธแบบสุภาพให้แอดมิน (เฉพาะแอดมิน) | claude-opus-4.8 | 2 |

งานแชททั้งหมดมีงบ **ไม่เกิน 3 AI calls ต่อ 1 ข้อความลูกค้า** บังคับที่ transport แล้ว และคำถามเรื่องราคา/แพ็ก/สิทธิ์ตอบแบบ deterministic (AI = 0) แล้ว

### 4.3 ค่าใช้จ่ายประมาณการ (list price, USD ต่อ 1M tokens)

gpt-4.1 = 2 / 8 · gpt-4.1-mini = 0.4 / 1.6 · text-embedding-3-small = 0.02 · deepseek-v4-flash ≈ 0.14 / 0.28 · gemini-2.5-flash = 0.3 / 2.5 · claude-opus-4.8 ≈ 15 / 75

**รวม LLM ≈ $10–11 ต่อสัปดาห์ ≈ $40–45 ต่อเดือน (~1,500 บาท) ที่ ~1,000 สแกน/เดือน ≈ 1.5 บาท/สแกน**
ยังไม่รวม ElevenLabs (subscription) และ margin ของ OpenRouter (บาง call วิ่งผ่าน OpenRouter เป็นสะพานสำรองเมื่อเครดิต OpenAI หมด)

### 4.4 ข้อสังเกตจากตัวเลข

- **~60% ของ token ใช้กับงาน "จับคู่/ตรวจซ้ำ/ทำ fingerprint"** (ข้อ 3–6) ไม่ใช่คำอ่าน โดยเฉพาะ objectSameIdentityVerifier ที่ถูกเรียก 5 ครั้ง/สแกน แม้ตัว LightGlue ในเครื่องตอบไปแล้วว่า inliers ต่ำทุก candidate
- คำอ่านตัวจริง (deepScan.draft) กินแค่ ~$1.6/สัปดาห์
- ระบบมี cache ข้ามบัญชี (phash / DINOv2 similarity / sha) และ shadow-eval telemetry อยู่แล้ว ใช้ต่อยอดวัดผลได้

## 5. สิ่งที่รันในเครื่องแล้ว (ไม่ใช่ AI ภายนอก)

- DINOv2 embedding + LightGlue matching (`ener-vision`)
- phash / sha256 dedupe รูป
- ffmpeg ทำคลิป, การ์ด PNG (Node canvas)
- กติกา deterministic ในแชทจำนวนมาก (regex/route ก่อนถึง LLM)

## 6. เป้าหมายของเจ้าของ

"ลดการใช้ AI ภายนอกให้มากที่สุด อะไรติดตั้งบนเซิร์ฟเวอร์ตัวเองได้ให้ติดตั้ง" ด้วยเหตุผล 2 อย่าง: ค่าใช้จ่าย และไม่อยากพึ่ง API ภายนอก (เคยเจอเครดิต OpenAI หมดแล้วระบบล้มทั้งเส้น) **เงื่อนไข: คุณภาพ "คำอ่าน" ภาษาไทยที่ลูกค้าเห็นห้ามตก** เพราะคือตัวสินค้า

## 7. สิ่งที่คิดไว้แล้ว (ยังไม่ตัดสินใจ อยากได้ความเห็นแย้ง/เพิ่ม)

| ระดับ | แนวคิด | ต้องมี |
|---|---|---|
| Tier 0 แก้โค้ด | ลด verifier 5 → ≤1 call โดยให้ LightGlue/DINOv2 ตัดสินโซนชัด ส่ง LLM เฉพาะก้ำกึ่ง · รวม descriptor + stableFeature เป็น call เดียว หรือแทนด้วย DINOv2 vector ล้วน · forensic ทำ heuristic ในเครื่องก่อน (EXIF, FFT/moiré, ขอบจอ) · ลด gpt-4.1 → mini ในจุดที่เป็น JSON classification | ไม่ต้องติดตั้งอะไร |
| Tier 1 CPU-only | OCR สลิป (PaddleOCR/Tesseract ไทย) · screen/edit detection ด้วย OpenCV + ONNX เล็ก · TTS ไทยในเครื่อง (Piper ฯลฯ) แทน ElevenLabs · LLM เล็ก 1.5–3B (Ollama/llama.cpp) สำหรับแคปชัน/ข้อความบริการ | RAM ว่างจริง ~3 GB, CPU ร่วมกับแชท |
| Tier 2 ต้อง GPU | vision LLM (เช่น Qwen2.5-VL 7B) ทำ objectCheck + forensic + คำอ่าน · LLM ไทยสำหรับ consult | GPU ≥16 GB VRAM (เช่า serverless / เครื่องที่บ้านต่อ tunnel) |

## 8. คำถามที่อยากได้คำตอบ

1. จากโครงสร้างข้อ 4 งานไหนควรย้ายลงเครื่อง CPU-only ก่อน ใช้โมเดล/ไลบรารีอะไร ระบุ RAM และ latency ที่คาดได้ต่อรูป
2. วิธีลด objectSameIdentityVerifier จาก 5 → ≤1 call/สแกน ด้วย LightGlue inliers + DINOv2 similarity: เสนอเกณฑ์ตัดสิน (same / different / ambiguous) และวิธีวัด false match/false split
3. forensic "ถ่ายจากจอ/ตัดต่อ/AI-generated" ทำในเครื่องได้แค่ไหน อะไรต้องเหลือให้ vision LLM
4. TTS ภาษาไทยที่ self-host ได้และใกล้เสียงโคลน ElevenLabs ที่สุดบน CPU (หรือ GPU เล็ก) พร้อมข้อจำกัดด้านคุณภาพ
5. ถ้าจะให้ vision/LLM ในเครื่องเขียนคำอ่านเอง ต้องใช้ GPU เท่าไหร่ โมเดลไหนภาษาไทยดี ตัวเลือกเช่าแบบจ่ายตามจริงที่คุ้มที่ 1,000–5,000 สแกน/เดือน
6. ลำดับทำที่ปลอดภัย (shadow → A/B → สลับ) และตัวชี้วัดที่ควรเก็บก่อน/หลัง
7. อะไรที่ "ไม่ควร" ย้ายลงเครื่อง เพราะได้ไม่คุ้มเสีย

---

## English summary (for non-Thai models)

**Ener Scan** is a Thai LINE chatbot: users send a photo of a Buddhist amulet / talisman / crystal; the system (Node.js + 3 workers, Postgres/Redis, Cloudflare R2) validates the object, detects screen-captured/edited photos, deduplicates against previously scanned objects (same user and cross-account), writes a personalized Thai "energy reading" (6 scored axes + narrative), renders a card image, returns it in LINE with a cloned-voice note (ElevenLabs), and auto-posts short clips to Facebook/YouTube. Chat follow-ups use two personas (admin for service/money, "master" for readings). Payments: PromptPay slips read by vision model.

**Measured last 7 days (production):** 232 scans, 5,002 LLM calls (21.5 per scan), 10.7M input tokens, ≈ $10/week. ~60% of tokens go to matching/fingerprinting (objectSameIdentityVerifier gpt-4.1-mini 5 calls/scan, descriptor + stableFeature extraction), not to the reading itself (deepScan.draft gpt-4.1 ≈ $1.6/week). Models in use: gpt-4.1, gpt-4.1-mini, text-embedding-3-small, deepseek-v4-flash, gemini-2.5-flash, claude-opus-4.8 (tiny), ElevenLabs TTS.

**Already local:** DINOv2 vits14 embeddings + SuperPoint/LightGlue matching (CPU torch sidecar, ~700 MB RAM), phash/sha dedupe, ffmpeg clips.

**Hardware:** single VPS, 4 vCPU (EPYC), 7.5 GB RAM (~3 GB free), no GPU, ~16 GB disk free, ~15 containers already running.

**Goal:** minimize dependence on external AI APIs (cost and single-point-of-failure risk) while keeping the Thai reading quality unchanged (it is the product). Please answer questions 1–7 above: what to move on-prem first on CPU-only, how to cut the verifier to ≤1 call/scan with local matcher thresholds, how far local forensic can go, best self-hosted Thai TTS, GPU requirements and pay-per-use options for a local vision/LLM reading pipeline at 1k–5k scans/month, a safe rollout (shadow → A/B), and what should NOT be moved.
