# Ener Scan — สังเคราะห์คำตอบ 3 AI + เทียบโค้ดจริง → ลำดับลงมือทำ (28 ส.ค. 2026)

อ้างอิง brief: `docs/ai/plans/ener-ai-selfhost-brief.md` · ตัวเลขจาก production 21–28 ส.ค. (232 สแกน, 5,002 LLM calls, ≈ $10/สัปดาห์)
คำตอบที่สังเคราะห์: AI-1 (ไทย, มี Hybrid Decision Matrix + RunPod), AI-2 (ไทย, เน้น Tier 0 + shadow 2–4 สัปดาห์), AI-3 (จีน, เน้น PaddleOCR + SakThai embedding + Vast/RunPod)

---

## 1. จุดที่ทั้ง 3 ตัวเห็นตรงกัน (และผมเห็นด้วย)

| ประเด็น | ฉันทามติ |
|---|---|
| ลำดับ | **Tier 0 (ลด call ในโค้ด) ก่อน** เพราะแทบไม่มีความเสี่ยง แล้วค่อย Tier 1 (CPU) และ Tier 2 (GPU serverless) |
| verifier 5 → ≤1 | ใช้ตัวจับคู่ในเครื่อง (LightGlue inliers + similarity) ตัดสิน same/different ให้ชัด ส่ง LLM เฉพาะก้ำกึ่ง และส่งแค่ top-1/2 |
| forensic | heuristic ในเครื่อง (EXIF, FFT/moiré, ขอบจอ/UI, ELA) กรองก่อน เหลือก้ำกึ่งให้ LLM และใช้ mini แทน 4.1 |
| คำอ่านตัวจริง (deepScan.draft) | **ห้ามย้ายลง CPU เครื่องนี้** ต้องเป็น GPU (Qwen2.5-VL-7B) และต้องผ่าน shadow + human blind test ก่อน |
| TTS | เก็บ ElevenLabs สำหรับ voice note ถึงลูกค้า · ทดลอง Piper/Kokoro สำหรับคลิป FB/YouTube |
| GPU | ที่ 1k–5k สแกน/เดือน ใช้ serverless (RunPod/Modal) คุ้มกว่าเช่าเครื่องรายเดือน · ห้ามใส่โมเดลใหญ่บน VPS ปัจจุบัน |
| rollout | shadow → A/B (10→50→100%) → เก็บ fallback ไป API เดิมเสมอ · วัด false match ต้อง ~0% |

## 2. สิ่งที่ทั้ง 3 ตัวเข้าใจคลาดจากโค้ดจริง (สำคัญ ต้องแก้ก่อนใช้คำแนะนำ)

**2.1 "similarity 0.93" ที่ verifier เห็น ไม่ใช่ DINOv2** — ในโค้ดมี 2 เส้นทางแยกกัน

| เส้นทาง | recall ด้วย | ตัดสินด้วย | สถานะจริง |
|---|---|---|---|
| **2G** `tryVisionReidBaselineReuse` | DINOv2 (sidecar `/embed`, recall ≥ 0.60, ≤ 6 candidates) | **LightGlue inliers: ≥ 25 = same (ไม่เรียก LLM) · 12–24 = LLM arbiter · < 12 = different (ไม่เรียก LLM)** | **มี gate แบบที่ AI เสนออยู่แล้ว** |
| **2D** `tryCrossAccountEmbeddingBaselineReuse` | text embedding ของ "descriptor" ที่ vision LLM เขียน (OpenAI text-embedding-3-small, recall ≥ 0.45 แบบหลวม, pool ≤ 5 + recent 4) | **LLM verifier ทุก candidate ไม่มี LightGlue** | **นี่คือที่มาของ 5.1 calls/สแกน** |

ดังนั้น threshold "DINOv2 ≥ 0.88 / ≤ 0.65" ที่ AI เสนอ ใช้กับ 2D ตรง ๆ ไม่ได้ (คนละ embedding) — วิธีที่ถูกคือ **เอา gate ของ 2G ไปใส่ในลูป 2D** (รูป candidate อ่านได้อยู่แล้วผ่าน `readScanImageFromStorage(bucket, path)` แบบที่ 2G ใช้) และ **ข้าม candidate ที่ 2G เพิ่งตัดสินว่า inliers ต่ำไปแล้ว** (ตอนนี้ 2D เอามาถาม LLM ซ้ำ)

**2.2 Slip OCR ไม่ใช่ลำดับแรก** — AI-2/AI-3 ให้ OCR สลิปเป็นอันดับ 1 แต่ใช้จริงแค่ 7 calls/สัปดาห์ (≈ $0.02) ย้ายได้แต่ผลด้าน "ลดค่าใช้จ่าย" ≈ 0 คุณค่าคือลด dependency เท่านั้น ลำดับควรตามเงินจริง: verifier > objectCheck (4.1) > draft > forensic > descriptor/stableFeature

**2.3 แคปชัน/ข้อความบริการ ย้ายลง LLM เล็กในเครื่องไม่คุ้ม** — deepseek-v4-flash + gemini-flash รวมกัน ≈ $0.1/สัปดาห์ แต่ Qwen 1.5B บน CPU กิน RAM 1.5 GB จาก 3 GB ที่ว่าง และช้า 1–4 วิ ต่อข้อความ (แชทต้องตอบไว) → ไม่ทำ

**2.4 ตัวเลข GPU ของ AI-3 บางค่าไม่สมจริง** (Vast V100 $0.01/ชม.) ใช้ช่วงของ AI-1/AI-2 แทน: RunPod/Modal serverless ≈ $5–30/เดือนที่ 1–3k สแกน

**2.5 ดิสก์** — เหลือ 16 GB: PaddleOCR (~0.3 GB) / Piper (~0.1 GB) ลงได้ · โมเดล GGUF หลาย GB ไม่ควรลงเครื่องนี้ (AI-1 ชี้ถูก)

## 3. ลำดับลงมือทำ (เรียงตามเงินที่ลดได้ ÷ ความเสี่ยง)

### Tier 0 — แก้โค้ด ไม่ติดตั้งอะไรใหม่ (ทำบน staging ได้ทันที)

| # | งาน | สเปกสั้น | ลด/สัปดาห์ (ประมาณ) | ความเสี่ยง |
|---|---|---|---|---|
| **T0-1** | **2D verifier gate** | ในลูป candidate ของ 2D: (1) ข้าม candidate ที่ 2G ตัดสินแล้ว (2) รัน sidecar `/match` กับ candidate ที่เหลือ → inliers ≥ 25 same / < 12 different โดยไม่เรียก LLM (3) ก้ำกึ่ง 12–24 ส่ง LLM **เฉพาะ top-1** (4) shadow log ทุกคู่: sim, inliers, LLM verdict เดิม vs ใหม่ | **-3.4M tokens, ≈ -$1.3** (5.1 → ~0.5 call/สแกน) | ต่ำ: LightGlue gate ตัวเดียวกับ 2G ที่ใช้อยู่แล้ว · วัด false match จาก shadow ก่อนสลับ |
| **T0-2** | รวม descriptor + stableFeature | 2 calls (gpt-4.1-mini, รูปเดียวกัน) → 1 call JSON เดียว {descriptor, stableFeatures} | -1.1M tokens, ≈ -$0.5 | ต่ำ: prompt merge + test parse |
| **T0-3** | forensic prefilter + mini | heuristic ในเครื่อง (EXIF software tag, FFT moiré, ขอบจอ/UI strip, halo/ELA) ให้คะแนน → ชัดว่าจริง/ชัดว่าจอ ข้าม LLM · ก้ำกึ่งส่ง **gpt-4.1-mini** แทน 4.1 | ≈ -$0.7–0.9 | กลาง: ผิวมันวาว/คริสตัลอาจ false positive → ใช้เป็น "ข้าม LLM" เฉพาะฝั่ง "ชัดว่าจริง" ก่อน ฝั่งปฏิเสธยังให้ LLM ยืนยัน |
| **T0-4** | objectCheck variants | crystal_family / low_shadow / permissive / bracelet_form (~330 calls, ≈ $0.9) รวมเป็น 1 call ที่คืนทุก field หรือเรียกเฉพาะเมื่อ strict ตอบก้ำกึ่ง | ≈ -$0.5–0.8 | กลาง: ต้องดู precision ของหิน/กำไล |
| T0-5 | text-embedding → local | SakThai / bge-m3-small บน CPU (~0.3 GB) แทน text-embedding-3-small | ≈ $0 (16k tokens) แต่ตัด dependency | ต่ำ: ต้อง re-embed คลังเดิม (index ใหม่) |

**รวม Tier 0 ≈ -$3–3.5/สัปดาห์ (30–35%) และ calls/สแกน 21.5 → ~9** โดยคำอ่านไม่ถูกแตะเลย

### Tier 1 — CPU-only บน VPS นี้ (RAM ว่าง ~3 GB ต้องเผื่อแชท)

| งาน | ทำ | เหตุผล |
|---|---|---|
| Piper หรือ Kokoro TTS สำหรับ **คลิป** FB/YouTube (~229/สัปดาห์) | ✅ ทดลอง blind test ก่อน | ลดเครดิต ElevenLabs ส่วนใหญ่ · voice note ถึงลูกค้า (22/สัปดาห์) ยังใช้ ElevenLabs |
| PaddleOCR + PromptPay QR decode สำหรับสลิป | ✅ ทำได้ ลำดับท้าย | ลด dependency ไม่ใช่ลดเงิน |
| LLM เล็กสำหรับแคปชัน/บริการ | ❌ ไม่ทำ | ข้อ 2.3 |

### Tier 2 — GPU serverless (RunPod/Modal) — ต้องกบเคาะงบและเปิดบัญชี

1. เปิด endpoint Qwen2.5-VL-7B (Q4_K_M, VRAM ~8–10 GB; L4/4090) จ่ายตามวินาที
2. **shadow 2–4 สัปดาห์**: ทุกสแกนให้ Qwen ทำ objectCheck + forensic + คำอ่าน คู่ขนาน ไม่ส่งลูกค้า เก็บ (a) ตรง/ไม่ตรงกับ gpt-4.1 ในการจำแนก (b) คำอ่านไทย: human blind test 50 ชิ้น/สัปดาห์ + LLM-judge
3. ผ่านเกณฑ์ (คุณภาพ ≥ เดิม, latency p95 < 8 วิ) → A/B 10→50→100% เริ่มจาก objectCheck/forensic ก่อน คำอ่านสุดท้าย
4. เก็บ OpenAI เป็น fallback อัตโนมัติเมื่อ endpoint ช้า/ล้ม
ประมาณค่าใช้จ่าย ณ 1–3k สแกน/เดือน: $5–30/เดือน (เทียบ OpenAI ตอนนี้ ≈ $40–45/เดือน) — ตัวเลขต้องวัดจริงหลัง shadow

### ไม่ย้าย (ตรงกันทั้ง 3 ตัว + ผม)
deepScan.draft บน CPU · ElevenLabs voice note ถึงลูกค้า · consult/synergy (งานเขียนไทยสร้างสรรค์) · claude-opus ที่ใช้ 2–22 calls/สัปดาห์ · โมเดล > 3B บน VPS นี้

## 4. ตัวชี้วัดที่ต้องมีก่อน/หลัง (เก็บได้จาก telemetry ที่มีแล้ว)

- LLM calls/สแกน และ $/สแกน (จาก LLM_USAGE ต่อ callSite) — เป้า Tier 0: 21.5 → ≤ 9 calls, 1.5 → ≤ 1 บาท
- false match / false split ของ verifier ใหม่ vs verdict LLM เดิม (shadow log ใน T0-1) — เป้า false match ≈ 0
- forensic: อัตราข้าม LLM + false positive บนชิ้นผิวมัน
- คุณภาพคำอ่าน (เฉพาะ Tier 2): blind test + LLM-judge ≥ เดิม
- latency p50/p95 ต่อสแกน และ fallback rate

## 5. สิ่งที่ต้องกบเคาะ

1. **เริ่ม Tier 0 บน staging เลยไหม** (T0-1 → T0-2 → T0-3 → T0-4 ตามลำดับ ทีละตัว มี shadow log ก่อนสลับ) — ไม่ต้องซื้อ/เช่าอะไร
2. **Tier 2**: จะเปิดบัญชี RunPod/Modal ทดลอง shadow ไหม (งบ ~$10–20/เดือนช่วงทดลอง)
3. **TTS**: ยอมให้คลิป FB/YouTube ใช้เสียงสังเคราะห์ในเครื่องแทนเสียงโคลนไหม (voice note ถึงลูกค้ายังเป็นเสียงโคลน)
