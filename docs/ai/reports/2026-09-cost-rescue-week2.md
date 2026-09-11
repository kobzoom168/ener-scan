# Cost Rescue — Week 2: LightGlue Offline Shadow (read-only) · 11 ก.ย. 2026

> Pro ไม่ถูกแตะ (คง `0bb11bc`) · ไม่มี canary · ไม่มี implementation · ไม่มีการเปิด same-reuse · instrumentation อยู่บน staging เท่านั้น รอ Codex review

## 1. Verdict (เลือกหนึ่ง)

# 🔴 STOP verifier optimization

เหตุผลรวบยอด: replay จริงครบ 971 คู่ **ประหยัดได้ $0.27/เดือนสุทธิ (≈10 บาท) = 9% ของเกณฑ์ $3/เดือน** และต้องจ่าย **latency +4.18 วิ/คู่ ใน 95.5% ของ call ที่ยังต้อง fallback ไป LLM อยู่ดี** (per-job จาก 19.3 วิ → ~40 วิ) · pair-cache ไม่มี savings (exact repeat = 0) · **ไม่มี confirmed false reuse — แต่ไม่ช่วยให้คุ้ม**

## 2. Replay summary (971/971 คู่ · concurrency 1 · นอก request path · ไม่เรียก LLM ใหม่)

| คลาส | คู่ | % | LLM ว่า same | LLM ว่า different |
|---|---|---|---|---|
| high_same (inliers ≥25) | 15 | 1.5% | **15** | **0** |
| ambiguous (12–24) | 148 | 15.2% | 0 | 148 |
| insufficient_geometry (<12, **ห้ามตีเป็น different**) | 808 | 83.2% | 0 | 808 |
| unusable | 0 | 0% | — | — |

inliers distribution: 0–4 = 102 (10.5%) · 5–11 = 706 (72.7%) · 12–24 = 148 (15.2%) · ≥25 = 15 (1.5%)

**Agreement กับคำตัดสิน LLM ที่บันทึกไว้ (comparator เท่านั้น ไม่ใช่ ground truth): 971/971 = 100%** — LightGlue จับ same ได้ครบทุกคู่ที่ LLM เคยตอบ same (15/15) และไม่มีคู่ใดที่ LightGlue ว่า same แต่ LLM ว่า different

## 3. Disagreement review

**high_same × llmDifferent = 0 คู่ → ไม่มีคู่ที่ต้อง adjudicate**
ผลพลอยได้ด้านความเป็นส่วนตัว: **ไม่มีการเปิด/ดาวน์โหลดรูปลูกค้าเพื่อตรวจเลยในงานนี้** จึงไม่ได้สร้าง temp directory ใด ๆ (แผน `mktemp -d` + ลบราย path เตรียมไว้แต่ไม่ถูกใช้)

หมายเหตุตามกติกา: ถ้าอนาคตจะทำ canary จริง **15 คู่ high_same ต้องให้กบ spot-check ยืนยันด้วยตาก่อน** — การตรวจโดย Claude เป็น `review_assist` เท่านั้น ไม่นับเป็น ground truth และรอบนี้ยังไม่ได้ทำเพราะ verdict = STOP

## 4. แยกผลตามมุมมองและ object family

**view: `view_unknown` ทั้ง 971 คู่** — ข้อมูลที่เก็บไม่มี view/angle/quality metadata และตามกติกา **ห้าม infer front/front, front/back หรือ low-quality จาก inliers/rawMatches** จึงจัดเป็น unknown ทั้งหมด (ถ้าต้องการมิตินี้จริง ต้อง instrument view label ที่ต้นทาง ซึ่งเป็นงานแยก)

| object family | คู่ | high_same | ambiguous | insufficient |
|---|---|---|---|---|
| sacred_amulet | 856 | 15 | 146 | 695 |
| unknown (job ไม่ได้ enroll baseline) | 115 | 0 | 2 | 113 |

## 5. การเงิน (ห้ามเรียก $6.9 ทั้งก้อนว่า savings)

ฐาน: verifier LLM 5 วัน = **$1.139 / 971 calls → $0.001173 ต่อ call** (ทั้งก้อน = $6.9/เดือน คือ *เพดานสูงสุดทางทฤษฎี* ไม่ใช่เงินที่ลดได้)

| รายการ | ค่า |
|---|---|
| calls avoided (S1: bypass ที่ high_same + break loop ของ job นั้น) | **44 / 971 = 4.5%** (13 jobs) |
| — ถ้านับเฉพาะ call ตัวเองไม่ break | 15 |
| fallback calls (ยังต้องเรียก LLM) | **927 / 971 = 95.5%** |
| observed saving (5 วัน) | **$0.0516** |
| projected monthly saving (×~6) | **$0.31/เดือน** (11 บาท) |
| CPU ที่ต้องจ่ายเพิ่ม | 4,063 CPU-วินาที/5วัน → **6.77 CPU-ชม./เดือน** ≈ $0.04 (1.4 บาท, คิดจาก VPS 600฿ ÷ 4 vCPU × 730 ชม.) |
| **net saving หลัง fallback + compute** | **$0.27/เดือน (≈10 บาท) = 9% ของเกณฑ์ $3** |
| เทียบเพดานที่ Codex ประมาณไว้ ($0.11 จาก 15 calls) | ของจริงสูงกว่าเล็กน้อยเพราะ break loop ช่วยได้อีก 29 calls |

**Latency (จุดตัดสินจริง):** LightGlue **4.18 วิ/คู่** (median 4.11 · p95 5.30) vs LLM verifier **3.86 วิ/คู่** (median 3.35 · p95 5.31) → ใกล้เคียงกัน แปลว่า S1 ไม่ได้แทนที่เวลา แต่ **บวกเพิ่ม**: คู่ที่ต้อง fallback จ่าย 4.18 + 3.86 = 8.04 วิ · ต่อ scan จาก ~19.3 วิ → **~40 วิ worst case** เพื่อแลกกับ 10 บาท/เดือน

**S2 pair-cache: exact repeat = 0 ใน 5 วัน → ไม่มี savings ปิดเรื่องนี้ ไม่สร้างต่อ** (sha256 dedup ต้นน้ำกันรูปซ้ำก่อนถึง verifier อยู่แล้ว)
**S3 combined = S1** (เพราะ S2 = 0) ไม่มี double-count

**Effort/payback:** implement gate + 2 feature flags + canary + adjudication + rollback ≈ 2–4 วันคน → payback จาก $0.27/เดือน = ไม่มีวันคุ้ม

## 6. ประโยชน์อื่นนอกจากลดเงิน (ตอบตามที่ขอ)

- **LightGlue พบ same ที่ LLM พลาดหรือไม่: ไม่พบ** — high_same ทั้ง 15 คู่คือคู่เดียวกับที่ LLM ตอบ same อยู่แล้ว จึงไม่มี quality win ด้านการค้นพบเพิ่มในหน้าต่างนี้
- **False reuse risk: ไม่พบ confirmed false reuse** (high_same × llmDifferent = 0) — แต่ย้ำว่านี่เทียบกับ LLM decision ไม่ใช่ ground truth และ positives มีแค่ 15 คู่ ซึ่งเล็กเกินกว่าจะสรุปความปลอดภัยระยะยาว
- **สิ่งที่ได้จริง (เชิงความรู้):** threshold `inliers ≥ 25` ที่เส้น 2G ใช้อยู่ **ดูตั้งไว้เหมาะสม** — ในหน้าต่างนี้ไม่มี false positive และไม่ตัดของจริงทิ้ง · และยืนยันว่า 72.7% ของคู่ candidate อยู่ที่ inliers 5–11 ซึ่งต่ำกว่า arbiter band มาก (คู่ที่ไม่เกี่ยวข้องกันจริง ๆ ตามคำตัดสิน LLM)
- **คำถามเปิดที่ยังตอบไม่ได้ (ไม่ใช่ข้อเสนอ):** การ *แทน* LLM ด้วย LightGlue ทั้งหมดจะแตะเพดาน $6.9/เดือนและ latency พอ ๆ กัน แต่ต้องมี ground truth จริง + ตัวอย่างภาพต่างมุม/หน้า-หลัง ซึ่งหน้าต่างนี้ไม่มีเลย (positives 15 คู่ทั้งหมดเป็น geometry ชัด) — **ห้ามใช้ผลชุดนี้เป็นเหตุผลเปิด automatic reuse**

## 7. Instrumentation (Phase B) — สถานะ

commit `b743f3a` (instrumentation แยกจาก analysis `b5e9da7`) บน **staging เท่านั้น**:
`opaquePairId` (pv1 = sha256(imageSha|candidateId), ไม่มี UID) · `preJobRef` (pj1 = hash(messageId)) + `PRE_JOB_GATE_TERMINAL` typed สำหรับ cost ที่เกิดก่อนสร้าง job · 2G `VISION_REID_LIGHTGLUE_RESULT` + candidateIdPrefix/pair/matcherVersion · collector allowlist

- tests: `tests/lightglueShadowInstr.behavior.test.js` 4/4 (transport call count ไม่เปลี่ยน · telemetry ไม่ถึง provider · no-PII · opaquePairId stable/versioned) · llmTelemetry + flowRole 43/43 · **full gate EXIT=0 ไม่มี fail ใหม่**
- staging smoke ผ่าน: `preJobRef` + `opaquePairId` ไหลลง LLM_USAGE ครบ, `contextReason=pre_job`
- **ข้อเสนอ:** เก็บ instrumentation ไว้ได้เพราะปิด coverage gap ที่ Week 1 พบ (280 scan calls/5วัน ไม่มี job context) และไม่กระทบ behavior — **แต่ยังไม่ deploy Pro จนกว่า Codex จะตรวจรายงานนี้**

## 8. Reproducibility & safety

- `scripts/analysis/lightglue_offline_replay.mjs` — `--selftest` hermetic ไม่มี network · กติกา "ห้ามตี different" อยู่ใน classify + ถูกทดสอบ · concurrency 1 โดยโครงสร้าง · output มีแค่ id prefix + ตัวเลข (ไม่มีรูป/UID/prompt/path)
- ไม่แตะ DB (path เตรียมจาก psql aggregate ล่วงหน้า) · ไม่เรียก LLM ใหม่ · รันใน container นอก request path
- ยืนยัน: **Pro = `0bb11bc` ไม่ถูกแตะ** ตลอดงาน

## 9. หลัง STOP — งานถัดไปคือฝั่งรายได้ (ไม่เขียนระบบจริง)

ปิดสายลดต้นทุน verifier แล้วย้ายไปหารายได้ตามที่ตกลง: **สัมภาษณ์ลูกค้า 5–8 คน + ทดสอบ mockup หิ้ง** (รายละเอียดในข้อเสนอแยก) — เหตุผลเชิงตัวเลข: ลดต้นทุนทั้งสายที่เหลือได้เต็มที่ ~$4–8/เดือน (150–300 บาท) ขณะที่ช่องว่างขาดทุนจริงอยู่ที่ ~775–1,100 บาท/เดือน → ต้องมาจากรายได้เท่านั้น
