# Ener Scan — ลดการพึ่ง AI ภายนอก / ย้ายมารันในเซิร์ฟเวอร์ (ร่างข้อเท็จจริง 28 ส.ค. 2026)

> เอกสารนี้ = ข้อเท็จจริงที่วัดจริงจาก Pro (`ener-scan-pro`, 21–28 ส.ค. 2026) + ข้อจำกัดเครื่อง เพื่อให้กบเอาไปถาม AI ตัวอื่นขอไอเดีย · ตัวเลขค่าใช้จ่ายเป็น**ประมาณการจาก list price** (ไม่ได้ดึงจาก billing จริง) · ยังไม่มีการตัดสินใจ/ไม่แตะโค้ด

## 1. เครื่องที่มีตอนนี้ (ener VPS — Contabo)
- CPU 4 vCPU (AMD EPYC Genoa) · RAM 7.5 GB (ใช้ ~2 GB ว่าง ~3–4 GB) · **ไม่มี GPU** · ดิสก์ 75 GB ใช้ไป 79% (เหลือ ~16 GB)
- รันอยู่แล้ว: ener-scan (pro+staging+legacy ×4 containers แต่ละชุด), ener-ai (FastAPI), ener-vision (sidecar), n8n+temporal (autopost), redis, postgrest, postgres
- **AI ที่รันในเครื่องแล้ว (self-hosted)**: `ener-vision` (uvicorn :8077) = DINOv2 `vits14` embedding (`/embed`) + SuperPoint/LightGlue matching (`/match`) · torch จำกัด 2 threads · ใช้ RAM ~700 MB, CPU พีค ~180% ตอนสแกน

## 2. AI ภายนอกที่ใช้จริง — 7 วันล่าสุดบน Pro (จาก log `LLM_USAGE`)
สแกนสำเร็จ 232 ชิ้น (scan_results) · ผู้ใช้ 72 คน · **LLM 5,002 calls · 10.7M input tokens · 0.36M output tokens ≈ 21.5 calls ต่อสแกน**

| callSite | model | calls/7d | in tokens | out tokens | ต่อสแกน | ประมาณ $/สัปดาห์ |
|---|---|---|---|---|---|---|
| objectSameIdentityVerifier | gpt-4.1-mini | 1,186 | 3.41M | 58k | 5.1 | ~1.46 |
| objectCheck.strict | gpt-4.1 | 513 | 1.24M | 1.5k | 2.2 | ~2.49 |
| objectEmbedding.descriptor | gpt-4.1-mini | 468 | 1.13M | 16k | 2.0 | ~0.48 |
| text-embedding-3-small (untagged) | openai | 467 | 16k | 0 | 2.0 | ~0.00 |
| fbCaption | deepseek-v4-flash | 448 | 191k | 38k | 1.9 | ~0.04 |
| stableFeatureExtract | gpt-4.1-mini | 438 | 1.43M | 66k | 1.9 | ~0.68 |
| deepScan | gpt-4.1-mini | 394 | 912k | 1.6k | 1.7 | ~0.36 |
| imageForensic.screen_check | gpt-4.1 | 241 | 351k | 47k | 1.0 | ~1.07 |
| objectCheck.crystal_family | gpt-4.1 | 221 | 255k | 17k | 1.0 | ~0.65 |
| deepScan.draft (คำอ่านหลัก) | gpt-4.1 | 210 | 560k | 64k | 0.9 | ~1.63 |
| synergyReport / consult / chatQuality / ytShortCaption | deepseek-v4-flash | 65 / 56 / 47 / 20 | ~1.0M รวม | ~30k | — | ~0.15 |
| objectInfoParse / planner / semanticCatcher / clarifier / phrasing | gemini-2.5-flash | 77 รวม | ~51k | ~8k | — | ~0.04 |
| objectCheck.low_shadow.* / permissive / bracelet | gpt-4.1 | 107 รวม | ~135k | ~3k | — | ~0.28 |
| voiceScript / smartRejection | claude-opus-4.8 | 24 | 17k | 3.6k | — | ~0.5 |
| imageForensic.thumb_touch / slipVision / slipOcr | gpt-4.1 / mini | 20 | ~31k | ~0.8k | — | ~0.07 |
| **รวม LLM** | | **5,002** | **10.7M** | **357k** | **21.5** | **≈ $10–11/สัปดาห์ ≈ $40–45/เดือน (~1,400–1,600 ฿)** |

ราคาที่ใช้คำนวณ (list, USD/1M tokens): gpt-4.1 2/8 · gpt-4.1-mini 0.4/1.6 · text-embedding-3-small 0.02 · deepseek-v4-flash ~0.14/0.28 (ประมาณ) · gemini-2.5-flash 0.3/2.5 · claude-opus-4.8 ~15/75 (ประมาณ)

บริการภายนอกอื่นที่มีค่าใช้จ่าย (นอก LLM): **ElevenLabs** (เสียงโคลนกบ: voice note 22 ชิ้น/7 วัน + คลิป YouTube/FB 229 คลิป/7 วัน — ค่าใช้จ่ายตาม subscription ไม่ได้อยู่ใน log) · OpenRouter margin · (LINE/R2/Telegram ไม่ใช่ AI)

**ข้อสังเกตสำคัญ:** ค่า LLM รวมจริง ๆ ไม่แพง (~1,500 ฿/เดือน ที่ ~1,000 สแกน/เดือน ≈ 1.5 ฿/สแกน) — ของแพงกว่าน่าจะเป็น ElevenLabs + ค่า VPS · แต่ **ความเสี่ยงคือการพึ่งพา** (API ล่ม/ขึ้นราคา/โมเดลถูกถอด) และ **สัดส่วน call ที่เป็นงาน "จับคู่/ตรวจซ้ำ" (ไม่ใช่คำอ่าน) กินถึง ~60% ของ token** — ตรงนี้ย้ายลงเครื่องได้โดยไม่กระทบคุณภาพคำอ่าน

## 3. สายงานต่อ 1 สแกน (ลำดับที่เรียก AI)
1. webhook: `objectCheck.strict` (gpt-4.1 vision) — รูปนี้เป็นวัตถุมงคลชิ้นเดียวไหม → **1 call**
2. worker-scan: `imageForensic.screen_check` (gpt-4.1 vision) — ถ่ายจากจอ/ตัดต่อ? → **1 call**
3. worker-scan: re-ID = `ener-vision` (local LightGlue ×4 candidates) + `objectSameIdentityVerifier` (gpt-4.1-mini vision ×5 candidates จาก embedding recall) → **~5 calls** ← ตัวกิน token อันดับ 1
4. worker-scan: `objectEmbedding.descriptor` (mini) + `text-embedding-3-small` + `stableFeatureExtract` (mini) → **~6 calls** (คำบรรยายวัตถุ/ฟีเจอร์คงที่ เพื่อ dedupe/cache ข้ามบัญชี)
5. worker-scan: `deepScan` (mini) → `deepScan.draft` (gpt-4.1) = **คำอ่านตัวจริง** → **~2.6 calls**
6. delivery: `fbCaption` (deepseek) + ElevenLabs voice + คลิป (ffmpeg local) → **~2 calls**
7. แชท: planner/consult/phrasing (gemini/deepseek) เฉพาะเมื่อลูกค้าพิมพ์ (งบ ≤3/เทิร์น) — สัดส่วนเล็ก

## 4. อะไรย้ายลงเครื่องได้ (เรียงตามคุ้ม/เสี่ยงน้อย → มาก)
### Tier 0 — ลด call โดยไม่ต้องติดตั้งอะไร (แก้โค้ด/เกณฑ์) — ประหยัด ~40–50% ของ token
- **sameIdentityVerifier 5 calls/สแกน → ≤1**: ให้ LightGlue/DINOv2 (local) ตัดสินก่อน (inliers ≥ accept = same, similarity < ต่ำสุด = different) ส่งให้ LLM เฉพาะโซนก้ำกึ่ง 1 ตัว · ตอนนี้ LLM ถูกเรียกแม้ local บอก "inliers_too_low" ทุก candidate
- **descriptor/stableFeature/embedding**: cache ตาม phash/DINOv2 ก่อนเรียก (มี crossAccountBaselineReuse อยู่แล้ว — ขยายเกณฑ์) · รวม 3 prompt เป็น 1 call
- **forensic.screen_check**: ทำ heuristic local ก่อน (EXIF, moiré/FFT, ขอบจอ, ขนาดไฟล์) → เรียก gpt-4.1 เฉพาะสงสัย
- ลด model: objectCheck.strict gpt-4.1 → gpt-4.1-mini (ทดลอง A/B ความแม่น) · deepScan.draft คงไว้ (คือสินค้า)

### Tier 1 — รันบนเครื่อง 4 core/7 GB ได้จริง (ไม่ต้อง GPU)
- **OCR สลิป**: PaddleOCR / Tesseract-tha (แทน slipOcr/slipVision — วันนี้ใช้น้อยอยู่แล้ว)
- **Screen/edit detection**: OpenCV heuristics + โมเดล ONNX เล็ก (แทนหรือกรองหน้า gpt-4.1)
- **Embedding**: มี DINOv2 อยู่แล้ว → ใช้แทน text-embedding + descriptor สำหรับ recall (ไม่ต้องขอ LLM บรรยาย)
- **TTS**: Piper (ไทย) / Coqui XTTS (CPU ช้า) แทน ElevenLabs — **คุณภาพเสียงโคลนกบจะตก** ต้องฟังก่อนตัดสิน
- **Caption/แคปชัน/รายงาน synergy สั้น**: template + LLM เล็ก (Qwen2.5-1.5B/3B Q4 ผ่าน Ollama ใช้ RAM ~2–3 GB) — เสี่ยงเรื่องภาษาไทย/โทน ต้องมี guard เดิม
- ⚠️ ข้อจำกัด: RAM เหลือ ~3 GB และ CPU 4 core ใช้ร่วมกับ node 12 containers + torch sidecar — โมเดล >3B จะแย่ง CPU จนแชทช้า

### Tier 2 — ต้องมี GPU (เช่า/ซื้อเพิ่ม)
- **Vision LLM local** (Qwen2.5-VL-7B / InternVL) แทน objectCheck + forensic + deepScan(mini) — ต้อง GPU ≥16 GB VRAM: เช่า on-demand (RunPod/Vast ~$0.3–0.6/ชม.) หรือ serverless per-call · หรือเครื่อง GPU เล็กที่บ้าน (RTX 3060 12GB) เปิด tunnel มาที่ VPS
- **คำอ่านหลัก (deepScan.draft) ด้วย LLM local**: ทำได้ทางเทคนิค แต่ **คุณภาพภาษาไทย/ความสม่ำเสมอ = ตัวสินค้า** ควรทำเป็น shadow เทียบก่อน (ระบบ shadow/telemetry มีแล้ว)
- คุ้มทุนเมื่อไหร่: ค่า LLM ปัจจุบัน ~$45/เดือน → GPU เช่าตลอด 24 ชม. แพงกว่า (≥$200/เดือน) · คุ้มเฉพาะ (ก) ใช้ serverless จ่ายตามจริง หรือ (ข) ยอด >5–10k สแกน/เดือน หรือ (ค) เป้าหมายคือ "ไม่พึ่งใคร" ไม่ใช่ประหยัด

## 5. คำถามที่ควรถาม AI ตัวอื่น (copy ไปถามได้เลย)
```
บริบท: แอป LINE "Ener Scan" (Node.js) รับรูปพระเครื่อง/หิน → ตรวจว่าเป็นวัตถุมงคล → ตรวจถ่ายจากจอ/ตัดต่อ → จับคู่ว่าเคยสแกนชิ้นเดิมไหม (มี DINOv2+LightGlue รันในเครื่องแล้ว) → เขียนคำอ่านพลังงานภาษาไทย → แคปชัน FB/YouTube + เสียงพูดโคลน (ElevenLabs)
วัดจริง 7 วัน: 232 สแกน, LLM 5,002 calls (21.5/สแกน), 10.7M input tokens, ~$10/สัปดาห์ (gpt-4.1, gpt-4.1-mini, deepseek-v4-flash, gemini-2.5-flash)
token ~60% ไปกับงาน "จับคู่/ตรวจซ้ำ" (objectSameIdentityVerifier 5 calls/สแกน, descriptor, stableFeature) ไม่ใช่คำอ่าน
เครื่อง: VPS 4 vCPU / 7.5 GB RAM / ไม่มี GPU / ดิสก์เหลือ 16 GB รัน ~15 containers อยู่แล้ว
เป้าหมาย: ลดการพึ่ง AI ภายนอกให้มากที่สุด (ทั้งค่าใช้จ่ายและความเสี่ยง) โดยคุณภาพ "คำอ่าน" ที่เป็นสินค้าห้ามตก
คำถาม:
1) งานไหนควรย้ายลง CPU-only ก่อน และใช้โมเดล/ไลบรารีอะไร (ระบุขนาด RAM/latency ที่คาดได้)
2) แนวทางลด objectSameIdentityVerifier จาก 5 calls/สแกน เหลือ ≤1 ด้วย local matcher + threshold — เสนอเกณฑ์และวิธีวัด false match
3) forensic (ถ่ายจากจอ/ตัดต่อ) ทำ local ได้แค่ไหน อะไรต้องเหลือให้ vision LLM
4) TTS ภาษาไทย self-host ที่ใกล้เสียงโคลน ElevenLabs ที่สุดบน CPU
5) ถ้าจะให้ vision/LLM ทำคำอ่านเองในเครื่อง ต้องใช้ GPU เท่าไหร่ ตัวเลือกเช่า serverless แบบจ่ายตามจริงตัวไหนคุ้มที่ ~1,000–5,000 สแกน/เดือน
6) ลำดับการทำที่ปลอดภัย (shadow → A/B → สลับ) และตัวชี้วัดที่ควรเก็บ
```

## 6. ยังไม่ทำ / ต้องกบเคาะ
- ทั้งหมดนี้เป็น**ข้อเสนอ** ยังไม่แตะโค้ด · Tier 0 ทำได้เลยบน staging (แก้เกณฑ์ + cache) ถ้ากบสั่ง · Tier 1 ต้องเช็ค RAM/CPU headroom ก่อนติดตั้ง (แนะนำวัด `docker stats` 24 ชม.) · Tier 2 ต้องตัดสินใจเรื่องงบ GPU
- ต้องเอาตัวเลข billing จริง (OpenAI/OpenRouter/ElevenLabs dashboard เดือน ส.ค.) มาเทียบกับประมาณการนี้ก่อนตัดสินใจ
