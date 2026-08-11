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
