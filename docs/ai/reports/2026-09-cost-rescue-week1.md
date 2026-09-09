# Cost Rescue — Week 1: objectCheck + verifier (read-only) · 9 ก.ย. 2026

## 1. Executive verdict

**สมมติฐาน "objectCheck มี call ซ้ำ" ตกไปด้วยข้อมูลจริง** — ไม่มี exact duplicate เลยใน 215 jobs (แต่ละ variant รัน ≤1 ครั้ง/job เสมอ, mean=1.0 ทุกตัว) สิ่งที่ดูเหมือนซ้ำคือ (ก) shadow-sampling ที่ตั้งใจเปิดไว้วัดผล และ (ข) crystal_family ที่เป็น lane-check แยกเจตนาแต่ field ทับซ้อนกับ strict/permissive · เงินที่ลดได้จริงแบบปลอดภัยรอบนี้ **~$3.9/เดือน (≈140฿)** ต่ำกว่าเกณฑ์คุ้ม implement เมื่อเทียบ effort 2–4 วัน · ฝั่ง verifier: **การตัด top-1/top-2 อันตรายเกินไป** (การจับคู่สำเร็จ 64% เกิดหลัง rank 1) — ทางที่ถูกคือ LightGlue gate (แทน LLM ต่อ candidate โดยไม่ตัด candidate) ซึ่งต้อง shadow วัดรอบหน้า
**Recommendation (เลือกหนึ่ง): NO-GO objectCheck แล้วไปตรวจ verifier** — สัปดาห์หน้าเสนอ shadow replay LightGlue-gate บน verifier (จุดที่เงินจริงอยู่: $6.9/เดือน)

## 2. Coverage / data quality (หน้าต่าง 4–8 ก.ย. = 5 วันเต็ม, Pro เท่านั้น)

- collector duplicate keys = **0** · cost duplicate genIds = 55 (dedupe แล้ว ไม่นับซ้ำ) · pending ค้าง 1 · dead-letter 0
- cost join rate = **99.28%** (missing 29 rows จาก 4,025 — generation ยัง settle ไม่ทัน/ขอบหน้าต่าง)
- ตัดออก: staging 2 · smoke ทั้งหมด · test-account (Ufe02fff full-UID) · jobs นอกหน้าต่าง 148
- **ข้อจำกัดที่พบ 1 (สำคัญ): objectCheck ที่ webhook ingestion ไม่มี jobIdPrefix 280 calls/5วัน** (contextReason=non_scan — เกตรูปรันก่อนสร้าง job รวมรูปที่ถูกปฏิเสธจนไม่เกิด job) → cost ก้อนนี้ตกใน non-scan bucket ทำให้ objectCheck ต่อ job undercount · ควรเพิ่ม pre-job context (messageId) รอบ instrumentation หน้า
- ข้อจำกัด 2: ไม่มี ground truth การจับคู่ — "accepted" คือคำตัดสิน LLM เอง (ตามสเปก: recall@k แท้จริง "วัดไม่ได้")
- ข้อจำกัด 3: latencyMs มีในข้อมูลแต่ยังไม่วิเคราะห์เชิงลึกรอบนี้

## 3. Cost by accessSource × callSite (5 วัน, jobs ใน jobs.csv join จริง)

jobs: created 215 · delivered 187 (free 167 / paid 20) · failed 28 · scan cost **$5.48** · non-scan (แชท/แคปชัน/pre-job gate) **$1.55 แยก denominator**
cost/created **$0.0255** · /delivered $0.0293 · /free-delivered $0.0283 · /paid-delivered $0.0379

Top (free ครองสัดส่วน — free = $4.72 = 86% ของ scan cost):
| callSite (free) | calls | USD |
|---|---|---|
| deepScan.draft | 146 | 1.138 |
| objectSameIdentityVerifier | 811 | 0.985 |
| imageForensic.screen_check | 171 | 0.758 |
| stableFeatureExtract | 301 | 0.464 |
| objectCheck.crystal_family | 151 | 0.442 |
| objectCheck.strict | 181 | 0.341 |

## 4. ObjectCheck duplicate taxonomy (จากโค้ด + ข้อมูล ไม่ใช่ชื่อ callSite)

ลำดับจริงในโค้ด: `strict` (ทุกใบ) → ถ้าก้ำกึ่ง → `permissive` (second-stage ตั้งใจ, 13 calls) → ถ้าผ่านเกต → `crystal_family` (lane-check ทุกใบที่ผ่าน, 175) → ถ้า family=crystal → `bracelet_form` (5) · `low_shadow.*` = shadow-sampling 10% เทียบ prompt ประหยัด (36 calls)

| ประเภท | calls/5วัน | USD/5วัน | จัดเป็น |
|---|---|---|---|
| strict ครั้งแรก | 208 | 0.406 | จำเป็น |
| permissive | 13 | 0.032 | intentional second-stage (ห้ามรวม — รันเฉพาะก้ำกึ่ง) |
| crystal_family | 175 | 0.508 | **overlapping fields** — permissive มี supportedFamilyGuess อยู่แล้ว แต่เส้นทางหลัก (strict ผ่านเลย) ไม่มี field นี้ |
| bracelet_form | 5 | 0.013 | intentional conditional |
| low_shadow.* | 36 | 0.062 | **exact duplicate purpose โดยตั้งใจ** (การทดลองของตัวเอง) |
| retry after failure | 0 | 0 | failed_calls = 0 ทั้งหน้าต่าง |

## 5. Proposed shared-result contract (ถ้าจะทำในอนาคต)

`{ supportedObject, objectCategory(family: amulet|crystal|bracelet|other), objectCount, imageQuality, screenshotSignal, hasCasing, shapeHint, confidence, reasonCodes[] }`
Consumers: processScanJob (gate decision) · lane routing (objectCategory ← ตอนนี้อยู่ใน crystal_family) · forensic (screenshotSignal ← ตอนนี้แยก call ใน imageForensic) · reject copy (reasonCodes)
รวมได้: strict+objectCategory (ตัด crystal_family) · **ห้ามรวม**: permissive (conditional โดยเจตนา), forensic เต็ม (คนละภารกิจ ความเสี่ยงจับภาพจอ)

## 6. Counterfactual replay (production ไม่ถูกแตะ, output ลูกค้าเดิม 100%)

| Scenario | calls avoided/5วัน | USD/5วัน | ต่อเดือน (×6.08) | disagreement/เสี่ยง |
|---|---|---|---|---|
| S0 baseline | — | 5.48 scan | ~33.3 | — |
| S1 ปิด low_shadow (รวม pre-job ~29 calls) | ~65 | ~0.12 | **~$0.75** | 0 (เป็น telemetry ล้วน) — แต่ควรปิดเมื่อการทดลอง shadow สรุปแล้วเท่านั้น |
| S2 ยุบ crystal_family เข้า strict contract | 175 | 0.508 | **~$3.1** | ต้อง regression lane หิน/กำไล (precision เดิมมาจาก prompt เฉพาะ) + fallback call เมื่อ field ขาด (ประมาณ 5–10%) |
| S3 aggressive (strict+permissive+family เดียว) | +13 | +0.032 | +$0.2 | เปลี่ยนพฤติกรรมเกตก้ำกึ่ง — **วัดเท่านั้น ห้ามเสนอ live** |

ไม่มี double-count: S1/S2/S3 คนละก้อน · downstream ไม่หาย (การ์ด/รายงานไม่ผูกกับ call เหล่านี้)

## 7. Verifier candidate analysis (ฐาน = LLM calls จริง ไม่ใช่ RESULT events ซึ่งรวม LightGlue ของ 2G)

- 187 LLM runs · **931 calls · $1.139/5วัน (~$6.9/เดือน)** · cost/call $0.00122 · candidateCount = 5 เกือบทุก run (186/187)
- ผล: accepted 14 runs (7.5%) · rejected-all 173 (92.5%)
- **accepted ที่ rank>1 = 9/14 (64%) · rank>2 = 7/14 (50%)** → "recall@1 โดยใช้คำตัดสิน LLM เป็น proxy" ≈ 36% เท่านั้น (ground truth แท้ไม่มี — วัดไม่ได้ตามสเปก)

| Counterfactual | saved/เดือน | เสียอะไร |
|---|---|---|
| top-1 only | ~$5.5 | เสีย 64% ของการจับคู่สำเร็จ → false "ชิ้นใหม่" เพียบ **ไม่ปลอดภัย** |
| top-2 only | ~$4.2 | เสีย 50% **ไม่ปลอดภัย** |
| pair-cache (exact pair เคยตัดสิน) | ≤~$4.5 upper bound | key ปัจจุบัน (candidateIdPrefix) ไม่มี uploader → ต้อง instrument pair id ก่อนถึงวัดจริงได้ |

ข้อสรุป verifier: อย่าตัด candidate · เงินจริงอยู่ที่ **แทน LLM ด้วย LightGlue gate ต่อ candidate** (แบบเส้น 2G ที่ใช้อยู่แล้ว) — ต้อง shadow replay ที่มี local matcher จริง = ขอบเขตสัปดาห์หน้า · false reuse ถือร้ายแรงสุดตามสเปก

## 8. Savings รวม (rate 36 THB/USD, owner_config)

| แบบ | USD/เดือน | บาท |
|---|---|---|
| observed window (5 วัน จริง) | S1+S2 = $0.57 | 20฿ |
| conservative (S1 หลังจบการทดลอง shadow) | $0.75 | 27฿ |
| base (S1+S2 สำเร็จ ไม่มี fallback บาน) | $3.9 | 140฿ |
| upper bound (S1+S2+S3+pair-cache เต็ม) | ~$8.6 | 310฿ |

ไม่นับ: SHA/pHash (มีแล้ว) · tagging (ไม่ใช่เงิน) · ไม่มี double-count accessSource×callSite

## 9. Engineering effort & payback

- S1: ปิด flag = ~0 วัน → คุ้มเสมอ **แต่รอการทดลอง shadow สรุปก่อน**
- S2: refactor contract + prompt + tests + regression lane = **2–4 วันคน** · ที่ $3.1/เดือน payback เชิงเงินหลายเดือน — **ต่ำกว่าเกณฑ์คุ้ม ($2–3/เดือนคือขั้นต่ำ, ก้อนนี้เกินนิดเดียวแต่ effort สูง)**
- Verifier LightGlue shadow (สัปดาห์หน้า): งานวัด 2–3 วัน เป้าก้อน $6.9/เดือน + คุณภาพดีขึ้น (จับคู่จาก geometry ไม่ใช่ LLM เดา)

## 10. Risks

S2: lane หิน/กำไลจำแนกพลาด → รายงานผิดสาย (ลูกค้าเห็น) · prompt ยาวขึ้นกระทบ precision ของ strict · ต้อง A/B เทียบ label เดิมก่อนสลับ · S1: ปิดก่อนสรุปการทดลอง = เสียข้อมูลที่ลงทุนเก็บมา · verifier top-k: ยืนยันแล้วว่าห้ามทำ

## 11. Recommendation

**NO-GO objectCheck (implement) — GO ตรวจ verifier ต่อ**: สัปดาห์หน้า = (1) instrument pre-job context + pair id (เล็ก) (2) LightGlue-gate **shadow replay** บน verifier candidates (read-only, sidecar local, ไม่แตะ decision) → ถ้า shadow แม่น ค่อยเสนอ canary · S1 ตั้งปฏิทินปิด flag เมื่อการทดลอง low_shadow ครบตามที่ตั้งไว้

## 12. Reproducibility

- Script: `scripts/analysis/cost_rescue_week1.py` (--help/--selftest · fixture-only ไม่มี network · dedupe k/genId · ตัด staging/smoke/test · rerun ได้ผลเดิม)
- Inputs: `/root/llm-usage/2026-09-0{4..8}.jsonl` + `cost-*.jsonl` (rsync read-only) + jobs.csv จาก psql aggregate: `SELECT left(id::text,8), date TH, access_source, status, is_test, attempt_count FROM scan_jobs WHERE created_at>='2026-09-03'` (ไม่มี uid ใน output)
- Source ที่อ่าน: objectCheck.service.js (checkSingleObjectGated/checkCrystalBraceletEligibility/runObjectCheckLowShadow) · processScanJob.service.js · tryCrossAccountEmbeddingBaselineReuse / tryVisionReidBaselineReuse / objectSameIdentityVerifier
- ไม่มี PII/secret/ข้อความลูกค้าในรายงานและ output (selftest ยืนยัน)

## 13. คำตอบสั้นตามโจทย์

"ลด call ใดได้กี่ครั้ง เท่าไร เสี่ยงอะไร คุ้มไหม": **objectCheck ลดได้จริงแค่ ~211 calls/5วัน (~$3.9/เดือน) — ไม่คุ้ม effort ตอนนี้ · verifier ตัด top-k ประหยัด $4–5.5/เดือนแต่ทำลายการจับคู่ 50–64% — ห้ามทำ · ก้อนที่คุ้มตรวจต่อคือ LightGlue gate แทน LLM ใน verifier ($6.9/เดือน + คุณภาพ) ซึ่งต้อง shadow วัดก่อน**
