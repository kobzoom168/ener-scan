# Scoring v4 (evidence_score_v4) — ตรวจแล้ว รอกบคัดข้อ (11 ส.ค. 2026)

ที่มา: Codex review ระบบคะแนน → กบส่งต่อ "เราจะไม่ทำตามทุกอย่าง สรุปก่อน"
Claude ตรวจโค้ดยืนยันข้อกล่าวหาหลักจริงทั้ง 3:
1. amuletScores.util.js:213 `(fnv1a32 % 25) - 9` = ช่วง -9..+15 mean +3 (comment เขียน ±10) → hash ดันคะแนนขึ้นทั้งระบบโดยไม่ตั้งใจ
2. mainEnergyLabel nudge (บรรทัด 135/221) = circular: LLM เลือกพลังเด่น → สูตรบวกแกนนั้น → ระบบสรุปว่าแกนนั้นเด่น
3. deepScanJson.prompt.js:131 LLM ออก energyScore เอง (ซ้อนกับสูตร 6 แกน = หลาย source of truth) + :42 ตัวอย่างโทน "ปังมาก...ฟันธงเลย" ขัดกฎห้ามอวย

## Claude คัดแล้ว (รอกบเคาะ)

### ✅ ทำ (P0 คุ้มสุด เสี่ยงต่ำ)
- แก้ตัวอย่างโทน "ปังมาก" ใน deepScanJson.prompt (ขัดกฎห้ามอวยที่เคาะ 24 ก.ค. — แก้ได้ทันทีไม่ต้องรอ v4)
- v4: hash level ใหม่สมมาตร ±3 + distribution test 10k seeds · hash เหลือหน้าที่เดียว = แก้คะแนนชน
- v4: deterministic engine เป็นเจ้าของเลขชุดเดียว — LLM ห้ามออก energyScore/เลือกแกนก่อนสูตร · primary/secondary derive จาก 6 แกน · narrative เห็นเลขล็อกแล้วห้ามเปลี่ยน
- v4: ตัด mainEnergyLabel nudge (ปิดเฉพาะ formula ใหม่)
- กติกาเหล็ก: formulaVersion ใหม่ใช้กับชิ้นใหม่เท่านั้น · รายงาน/baseline เก่าห้ามแตะ · feature flag rollback ได้

### 🟡 ทำแบบย่อ (P1 คัดบางข้อ)
- slug whitelist validator → นอกชุด = unknown + clamp confidence + telemetry (ถูกและกันพังจริง)
- score breakdown ต่อแกนเก็บฝั่ง admin/QA (ตอบข้อร้องเรียนได้ว่าแต้มมาจากไหน — เข้าคู่ monitor v2)
- readingConfidence แยกจากคะแนนพลัง — เริ่มแค่เก็บ+โชว์ 1 บรรทัดในรายงาน ไม่รื้อ UI
- สูตร overall ใหม่ (55/25/20 coherence) = shadow mode เทียบ v3 อย่างเดียวก่อน ห้ามสลับจนกว่า calibration ชัด

### ⏸ พัก (ใหญ่/เสี่ยง/ยังไม่คุ้ม)
- evidence schema 13 ช่องใหม่ (surfaceCondition/patina/ฯลฯ) — extractor ต้องออก field เพิ่ม = cost ต่อ scan ขึ้น ค่อยทำหลัง v4 นิ่ง
- รื้อ multi-angle enrollment · รื้อ compatibility (stable compat เพิ่งนิ่ง เลขลูกค้าห้ามขยับ) · golden fixtures 30-50 ชิ้น (ต้องรอรูปจริงจากกบ)
- personalization ตามวัย: คุมแค่ความยาว/ระดับภาษา ไม่เปลี่ยนความอวย — เอาไว้แก้พร้อมรอบ prompt

### Rollout ตาม Codex (เห็นด้วย)
evidence_score_v4 + เก็บ formulaVersion/extractorVersion · shadow 3-7 วัน ไม่โชว์ลูกค้า · สรุป distribution เข้า Telegram · เปิดเฉพาะชิ้นใหม่ · ห้าม recalc เก่า

Full prompt ต้นฉบับของ Codex: อยู่ในแชทกบ 11 ส.ค. (รายละเอียด P1/P2 ครบ) — เอากลับมาอ่านตอนลงมือ


## สถานะ implement (11 ส.ค. 2026 เย็น — staging เท่านั้น, กบเคาะขอบเขตแล้ว)
- ✅ ทำครบตามเคาะ: prompt "ปังมาก" แก้แล้ว (วัยคุมแค่ความยาว/ระดับภาษา/ตัวอย่างชีวิต) · slug whitelist validator log-only (STABLE_FEATURE_SLUG_INVALID) · evidence_score_v4 เลนพระเท่านั้น (hash สมมาตร ±3 บันทึก collisionNudge แยก + ตัด mainEnergyLabel nudge + breakdown ต่อแกน + readingConfidence จาก knownLayers) · shadow overall 55/25/20 log SCORE_V4_SHADOW_OVERALL · baseline จำ scoringMode ของชิ้น (reuse ใช้ transform ตรงรุ่น) · public mapper ตัด scoreBreakdown ก่อนถึงลูกค้า
- Flag: AMULET_SCORE_V4_ENABLED (default ปิด = v3 เดิมเป๊ะ ปิดกลับได้ทันที) — เปิดเฉพาะ staging
- เทสต์ 10 ตัวรวม invariant fixture ล็อก v3/v1 เลขเดิมเป๊ะ + distribution 10k seeds

## Distribution comparison (synthetic 10k, 11 ส.ค.)
| | v3 ปัจจุบัน | v4 + transform ใหม่ (PRELIM band 46-70) |
|---|---|---|
| median | 7.1 | 6.9 |
| p10 / p90 | 6.1 / 8.1 | 6.0 / 7.7 |
| ต่ำกว่า 6 | 4.8% | 9.3% |
| 8 ขึ้นไป | 13.5% | 4.1% |
| เกรด A | 34.3% | 19.1% |
- บทเรียนสำคัญ: ถอด hash level แล้วความต่างระหว่างชิ้นแคบลงมาก — v4 กับ transform เดิมบีบทุกชิ้นเหลือ ~6.8 (B 87%) → ต้องมี v4 transform เอง (band 46-70) และ**ต้อง calibrate ด้วย scan จริงช่วง shadow ก่อนเปิดลูกค้า** (synthetic สุ่ม uniform ไม่ตรง distribution จริงที่เทไปทาง thai_amulet)
- shadow overall (coherence) ยังสเกลต่ำ (median 3.8) — ใช้เทียบเชิงรูปทรง distribution เท่านั้น อย่าเพิ่งตีความค่าสัมบูรณ์
- ถัดไป: เก็บ SCORE_V4_SHADOW_OVERALL + เทียบ v3/v4 จาก scan จริงบน staging → ปรับ band → ค่อยคุยเปิด pro
