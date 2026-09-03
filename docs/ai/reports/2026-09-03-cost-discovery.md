# Phase Cost Discovery — ผลตรวจย้อนหลัง (3 ก.ย. 2026, read-only)

ตามพรอมป์ Codex: ยังไม่แตะ threshold/model/output/production decision ใด ๆ · รอบนี้ = หลักฐาน + ติดตั้งตัวเก็บข้อมูล

## 1. ปริศนา "untagged 49%" — ไขแล้ว: เป็นข้อมูลประวัติศาสตร์ ไม่ใช่รอยรั่วปัจจุบัน

- ระบบติดป้าย attribution (`user` = callSite) **ตั้งแต่ 13–14 ส.ค.** (commits f0f1444 + 0aa8a9c "cost audit ①/instrumentation")
- CSV แยกตามวัน: ก่อน 14 ส.ค. tagged = **0** ทุกวัน · ตั้งแต่ 14 ส.ค. untagged เหลือ ~9–10% ของ calls
- **หลังติดป้าย (14 ส.ค.–3 ก.ย., 21 วัน): $34.37 → run-rate ≈ $49/เดือน** (ไม่ใช่ $65)
- untagged ที่เหลือ = **$0.73 จาก $34.37 (2% ของเงิน)**: text-embedding-3-small 1,753 calls ($0.00) + เศษ call เล็ก
- untagged Opus/DeepSeek/Gemini ก้อนก่อนหน้า = **ener-ai (Python คนละระบบบนเครื่องเดียวกัน: วิดีโอ YouTube/brainstorm)** ใช้ OpenRouter key เดียวกัน
- → ข้อเสนอของ AI ภายนอก "ติด tag แล้วประหยัด $15–30" **ไม่มีอยู่จริง** (Codex ทักถูก: tagging ไม่ใช่เงินที่ลด — และมันติดไปแล้ว)

## 2. Verifier (objectSameIdentityVerifier) — วัดจากของจริง

หน้าต่างสังเกต 7.5 ชม. หลัง deploy วันนี้ (log เก่าหายเพราะ container ถูกสร้างใหม่ตอน deploy — ดูข้อ 5):
- 15 runs ของเส้นทาง 2D: **5 runs no_candidates (0 LLM calls) · 10 runs ยิง LLM ครบทุก candidate rank 1→5 รวม 48 calls**
- ผล: **verifier_rejected_all 10/10 · ACCEPTED 0 · REUSE_HIT 0** — ในหน้าต่างนี้ทุก call สูญเปล่า 100%
- อัตรา ≈ 150–200 calls/วัน สอดคล้องบิล (avg 208/วัน) — ยืนยันว่าก้อนนี้มาจาก pro worker-scan จริง ไม่ใช่ process แปลกปลอม
- Root cause ตรงกับที่วิเคราะห์ไว้: recall ของ 2D ใช้ text-embedding descriptor แบบหลวม (threshold ~0.45, สูงสุด ~5+ candidates) แล้ว **LLM verify ทุกตัว ไม่มี LightGlue gate ไม่มี pair-cache**
- เพดานเงินที่ลดได้จากจุดนี้ (ถ้า gate/cap สำเร็จ): ~$5.4/21วัน ≈ **$7–8/เดือน** — ไม่ใช่หลักสิบเหรียญ
- ส่วนแบ่งของ 2G arbiter (LightGlue 12–24 inliers → LLM) ยังแยกไม่ได้จาก tag เดียวกัน → collector ใหม่เก็บ event VISION_REID_* แล้ว

## 3. cost ต่อ job (จากข้อมูลที่มี — ยังไม่แยก free/paid ได้)

- jobs สร้างจริง 14 ส.ค.–3 ก.ย.: **pro 937 · staging 28** (รวม dedup/failed; delivered pro ≈ 13/วัน)
- เงินเฉพาะ tag สายสแกน 21 วัน ≈ $31.0 ÷ 965 jobs ≈ **$0.032/job ≈ 1.2฿** (เพดานบน — รวม staging tests)
- ตัวเลข "$0.17 หรือ 6฿/สแกน" ของ AI ภายนอก **สูงเกิน ~5 เท่า** (เอาบิลทั้งเดือนรวมช่วงก่อนติดป้าย+แชท+วิดีโอ หารเฉพาะ delivered)
- แชท+consult+voiceScript+fbCaption ≈ $3.4/21วัน
- แยก free/paid ต่อ call ยังทำไม่ได้ — LLM_USAGE ไม่มี accessSource/jobId → ต้องเพิ่ม (ดูข้อ 6)

## 4. hash-before-AI — ยืนยัน: จริง

sha256 exact + phash dedup ทำงานที่ webhook ingestion **ก่อนสร้าง scan job** (พิสูจน์แล้วช่วงงาน P0-E/P0-F: SCAN_SHA256_DEDUP_HIT / SCAN_IMAGE_DEDUP_HIT เกิดก่อน pipeline และไม่เรียก LLM สแกนซ้ำ) → ข้อเสนอ "เพิ่ม SHA/pHash cache ลด $3–7" ของ AI ภายนอก = ของที่มีอยู่แล้ว

## 5. ช่องโหว่ instrumentation ที่เจอจริง + สิ่งที่ติดตั้งแล้ววันนี้

- **docker logs หายทุกครั้งที่ deploy** (ผูกกับ container) → เทียบบิลย้อนหลังกับ log ไม่ได้
- ติดตั้ง **collector ฝั่ง host (read-only)**: `/root/llm-usage-collect.sh` + cron ทุก 10 นาที → `/root/llm-usage/YYYY-MM-DD.jsonl` (เก็บ 30 วัน) — จับ LLM_USAGE + VERIFIER_RESULT/ACCEPTED + REUSE_HIT/SKIPPED + VISION_REID_* จากทุก container ener-scan (pro/staging/เก่า) พร้อมชื่อ container · ไม่แตะโค้ด production · dedupe ตอนวิเคราะห์ด้วย genId

## 6. สิ่งที่ต้องทำเพิ่มเพื่อปิด Discovery (เสนอ — รอเคาะ)

1. **(กบ, 5 นาที)** สร้าง OpenRouter key แยก 3 ใบ: `Ener-Scan-Pro` / `Ener-Scan-Staging` / `Ener-AI` — ผมใส่ .env แต่ละระบบให้ (บิลแยกคอลัมน์ api_key_name ทันที)
2. **(โค้ด instrumentation-only, ไม่แตะ decision)**: เติม `env:` prefix + jobIdPrefix ใน user tag · เพิ่ม accessSource/jobId/candidateCount/attempt ใน LLM_USAGE · tag embeddings (`objectEmbedding.vector`) · invariant warn เมื่อ call สายสแกนไม่มี jobId → deploy staging ก่อน, Pro รอ GO
3. เก็บข้อมูล 3–7 วัน → รายงาน: pair ซ้ำ/retry, cache hit, cost แยก free/paid, ส่วนแบ่ง 2G vs 2D → แล้วค่อยเสนอ Shadow Plan (pair-cache, top-k cap, LightGlue gate) ตามเกณฑ์ Codex

## 7. แก้ตัวเลขเป้าหมาย

- ฐานจริงตอนนี้ $49/เดือน (ไม่ใช่ $65) · เป้า Codex $30–40 = ลด $9–19 จากฐานจริง
- ก้อนที่วัดแล้วว่าลดได้: verifier ~$7–8 (gate/cap) + forensic ~$3–4 (heuristic ก่อน) + objectCheck cascade ~$4–6 + รวม feature calls ~$2 → **$30–35/เดือน เอื้อมถึงด้วยงานที่มีหลักฐานแล้ว** · ต่ำกว่านั้นต้องรอผล shadow
