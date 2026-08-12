# CODEX REVIEW — สมุดตรวจงาน Ener Scan

อัปเดตล่าสุด: 12 ส.ค. 2026  
เจ้าของเอกสาร: Codex ใช้ตรวจและเสนอความเห็นให้ Claude  
ขอบเขต: บันทึกสิ่งที่กบเคยถาม, สิ่งที่ Codex ตรวจพบ, สิ่งที่แก้แล้ว และจุดที่ต้องตรวจต่อ

> ไฟล์นี้เป็นดัชนีการ review ไม่ใช่ source of truth ของ production
> ก่อนตรวจทุกครั้งให้อ่าน `STATE.md`, `LOG.md`, `BACKLOG.md` และยืนยันกับโค้ด/commit จริงเสมอ

## วิธีใช้รอบถัดไป

1. ดู branch, working tree และ commit ล่าสุดก่อน
2. อ่านหัวข้อ "งานที่ยังเปิด" ในไฟล์นี้
3. เทียบคำกล่าวอ้างของ Claude กับ diff และ test ที่เกี่ยวข้อง ห้ามรับจากข้อความสรุปอย่างเดียว
4. แยกผลเป็น `ยืนยันแล้ว`, `แก้บางส่วน`, `ยังไม่ทำ`, `เห็นต่างโดยมีเหตุผล`
5. ห้ามเสนอเรื่องเดิมซ้ำ ถ้าแก้แล้วและไม่มี regression
6. หลังตรวจ ให้เติม Review Ledger ด้านล่างพร้อม commit และหลักฐาน test

## ภาพรวมระบบที่เกี่ยวกับการตรวจ

- Ener Scan เป็น LINE OA ลูกค้าส่งรูปพระ/เครื่องราง/กำไลหิน แล้วได้รับรายงานพลัง คะแนน/เกรด และเสียง
- ฟรีวันละ 1 ชิ้น มีสิทธิ์แบบชำระเงิน รายละเอียดราคาและสถานะ LIVE ให้ยึด `STATE.md` และ DB override ไม่ยึดข้อความเก่าในแชท
- flow persona เป้าหมายมี 2 บทบาทในห้อง LINE เดียว:
  - `admin`: รับรูป, ขอข้อมูล, แจ้งคิว/เวลา, สิทธิ์, โปร, QR และการชำระเงิน ห้ามอ่านหรือตีความพลัง
  - `ajarn`: อ่านพลังและให้คำแนะนำเชิงวิชา ห้ามพูดเรื่องเงินหรือชวนจ่ายทุกกรณี
- handoff เป้าหมาย: แอดมินแจ้งว่าจะเรียนถาม → อาจารย์ตอบ; ไม่จำเป็นต้องเกริ่นซ้ำทุกข้อความเมื่อยังอยู่ในช่วงอาจารย์ตอบต่อเนื่อง
- ข้อจำกัดด้านข้อความ: ห้ามขู่ให้กลัว, FOMO ปลอม, การันตีผล, อวยเกินหลักฐาน หรือทำให้สองบทบาทดูเป็นละครหลอกลูกค้า
- scan flow เป็น asynchronous มี webhook ingestion, scan worker, outbound delivery, conversation history, Redis state และ Telegram monitoring

## เรื่องที่กบเคยให้ Codex ตรวจ/เสนอ

### A. คะแนนและคำอ่านพลัง

- ตรวจสูตรคะแนนเดิมและที่มาของคะแนนเมื่อส่งพระ
- พบเดิมว่า hash `% 25 - 9` ให้ช่วง `-9..+15` ไม่ใช่ ±10 ทำให้คะแนนเฉลี่ยถูกดันขึ้น
- พบปัญหาเลขสองเจ้าของ: LLM ออก `energyScore` พร้อมกับสูตร deterministic อีกชุด
- พบ `mainEnergyLabel` nudge และตัวอย่าง prompt แนว "ปังมาก...ฟันธง" ขัดกติกาห้ามอวย
- แผนที่เคยเสนอและกบ/Claude รับไป: hash สมมาตรขนาดเล็ก, เลขชุดเดียว, LLM ห้ามสร้างคะแนนเอง, ตัด nudge, เก็บ score breakdown ฝั่ง admin และใช้สูตร overall ใหม่แบบ shadow ก่อน
- เอกสารหลัก: `docs/ai/plans/ener-scoring-v4.md`
- สถานะล่าสุดที่ทราบ: scoring v4 อยู่ shadow บน staging ต้อง calibrate จากรูปจริง 10–20 ชิ้นก่อนพิจารณา production
- รอบหน้าตรวจ: distribution, คะแนนต่ำ/สูง, stable seed ของชิ้นเดิม, evidence contribution, collision, coherence และยืนยันว่าไม่เปลี่ยนรายงานเก่า

### B. Persona แอดมิน → อาจารย์

- กบตัดสินใจแล้วว่าต้องแยกสองบทบาท ไม่ต้องย้อนกลับไปเสนอ persona เดียว
- Codex เคยเสนอชุดข้อความ 5 จังหวะ, รูปแบบเปิดข้อความอาจารย์, handoff ที่ไม่ทำซ้ำเกินไป, edge cases และเส้นจิตวิทยาที่ห้ามข้าม
- เหตุจริงที่ต้องแก้: อาจารย์เคยเสนอขายระหว่างลูกค้าเพียงถามคำถาม ทำให้เสียความขลังและลูกค้าไม่พอใจ
- release criterion สำคัญ: ต้องกันก่อนส่ง ไม่ใช่เพียงแจ้ง Telegram หลังลูกค้าเห็นแล้ว

### C. Flow scan และ conversation monitoring

- ตรวจการรับรูป, pre-scan acknowledgement, multi-image, object-info gate, delivery history, dangling handoff, payment QR metadata และ human delay
- กบต้องการใช้ Hermes Agent/ระบบเดิม monitor flow chat และส่งสรุป Telegram ทุกวัน
- สิ่งที่ monitor ควรเห็น: transcript ครบ, speakerRole/replyType/source, อาจารย์พูดเงิน, handoff ค้าง, ข้อความวน, ลูกค้าด่า/ทวง, scan/result latency, report ข้ามลำดับ และคำตอบผูกผิดชิ้น

### D. Growth และ conversion

- กบเคยถามเรื่องฐาน LINE OA ราว 400 คน, การหาลูกค้าจาก Facebook Ads, ทำอย่างไรให้คนยอมจ่าย และเป้าหมาย 10,000 คนใน LINE
- แนวคิดต้องรักษากติกา: conversion เป็นหน้าที่แอดมิน/ระบบ ไม่ใช่อาจารย์; ห้ามใช้ความกลัว, scarcity/FOMO ปลอม หรือคำรับประกัน
- ก่อนทำ growth เพิ่ม ควรวัด funnel อย่างน้อย: add → ส่งรูป → ได้ผล → ถามต่อ → paywall → intent → จ่ายสำเร็จ → กลับมาใช้ซ้ำ และแยก source/campaign

## สิ่งที่ยืนยันว่าแก้แล้วบน staging

### Commit `db2fef8`

- เพิ่ม conversation history ของ `pre_scan_ack` และ marker `scan_result` พร้อม metadata
- เพิ่ม QR path metadata ฝั่งแอดมิน
- ปรับ multi-image ครั้งที่ 2 ให้ไม่ตำหนิและบอกว่ารูปเพิ่มไม่หักสิทธิ์
- ตัด emoji ที่หลุดในข้อความแนบรูป
- เพิ่ม priority rule: paywall เป็นข้อยกเว้นเดียวที่แอดมินเสนอทางจ่ายได้

### Commit `5eeff5c`

- `detectDanglingHandoff` ไม่นับ `speakerRole=consult`; สำเร็จเฉพาะ `ajarn` หรือ `replyType=scan_result`
- no-tag หลัง metadata rollout ไม่นับเป็นคำตอบ ป้องกัน metadata regression ถูกซ่อน
- history insert ของ ack/result เปลี่ยนเป็น `await`
- marker ผลสแกนย้ายมาหลัง delivery สำเร็จทันที ก่อน hooks และ quota notice
- multi-image copy หลักเปลี่ยนเป็นเสียงแอดมิน ไม่มี emoji และ test ตรงกับ runtime
- pre-scan ack ทั้ง 10 variants ตัดคำสัญญาเวลาสั้นเกินจริง ใช้ 2–3 นาทีหรือข้อความกลาง ๆ
- Codex รันยืนยันเฉพาะจุด: `chatQualityDeterministic` 7/7 และ `multiImageRejection` 5/5 ผ่าน

## งานที่ยังเปิด — ต้องตรวจซ้ำก่อน persona split ขึ้น production

### Blocker หลัก

- **C2 pre-send money guard:** ก่อนส่งข้อความที่เป็นเสียงอาจารย์ ต้อง block/re-route เมื่อพบคำการเงิน ปัจจุบัน alert หลังบันทึกอย่างเดียวยังไม่พอ
- **C3 role router:** resolve แต่ละคำตอบเป็น `ajarn`, `admin` หรือ `mixed`; mixed ต้องแยกข้อความหรือส่งกลับให้แอดมิน ไม่ควรติดป้ายรวมแบบคลุมเครือ
- **H6 handoff state ใน Redis:** ผูก handoff กับคำถาม/turn จริง ป้องกัน scan result หรือคำตอบคนละเรื่องมาปิด dangling handoff ผิดตัว
- ลำดับที่ Claude เสนอ: role router → pre-send guard → Redis handoff state → จึงค่อยพิจารณาให้ consult เข้า detector

### Object-info gate / concurrent scans

- ไม่บล็อกลูกค้าสแกนชิ้นถัดไประหว่างเกตค้าง เพราะเคยทำให้ลูกค้าสแกนจำนวนมากโดนถามซ้ำหลายรอบ
- ก่อนเปิด flow รอบใหม่บน production ต้องมี:
  - thumbnail ของชิ้นที่กำลังถาม
  - `relatedScanResultId` หรือ correlation id บน card/reply
  - telemetry `out_of_order_delivery` และ `answer_bound_to_wrong_item` หรือสัญญาณเทียบเท่า
  - ทดสอบ A รอข้อมูล → B ส่งผลก่อน → ลูกค้าตอบข้อความทั่วไป ว่าคำตอบยังผูก A ถูกต้อง

### Test hygiene

- full suite ล่าสุดที่ Claude รายงาน: 952 pass / 19 fail; ยังไม่ใช่ suite เขียว
- ห้ามใช้เพียง "จำนวน fail เท่า baseline" เพราะ regression ใหม่อาจแทน test เก่าที่กลับมาผ่านโดยยอดรวมเท่าเดิม
- ควรทำ exact known-fail manifest หรือแยก `test:unit-clean` ที่ต้องผ่าน 100% ออกจาก integration ที่ต้องใช้ Redis/DB จริง
- เมื่อ review ให้เทียบชื่อ test ที่ fail ไม่ใช่เทียบเพียงจำนวน

### จุดเล็กที่ต้องยืนยัน

- `META_ROLLOUT_MS` ตั้งไว้ `2026-08-12T00:00:00+07:00` แต่ comment ระบุเริ่มบันทึกบน pro เย็น 11 ส.ค.; ต้องยืนยันว่าเป็นเวลา deploy จริงหรือ intentional grace period
- M10 human delay เป็น product decision ของกบ; ข้อเสนอค้างคือยกเว้น QR, ยืนยันชำระ, error/status และข้อความที่ต้องตอบทันที
- M12 บังคับทุก outbound ผ่าน gateway ที่ require metadata ยังเป็น refactor รอบถัดไป

## แนวทางตรวจเมื่อ Claude ส่งสรุปมา

- หา commit ที่อ้างถึงและตรวจ `git show --stat` + diff เฉพาะไฟล์
- ตรวจทั้ง implementation และ test; test ที่แก้ expected อย่างเดียวไม่พิสูจน์ behavior
- รัน targeted tests ด้วย dummy env โดยห้ามอ่านค่า `.env` จริง
- ตรวจตำแหน่ง side effect ด้วย เช่น "ส่ง LINE สำเร็จ → บันทึก history → hooks/notice"
- สำหรับ detector ให้ทดสอบอย่างน้อย: admin ตามหลัง, ajarn ตามหลัง, consult, no-tag ก่อน/หลัง rollout, เกินเวลา, ข้อความคนละงาน และข้อมูลไม่เรียงเวลา
- สำหรับ persona ให้ทดสอบ adversarial เช่น คำถามพลังมีคำว่า "ราคา", คำถามเงินปนพลัง, paywall side question และข้อความ mixed
- ห้าม deploy production เว้นแต่กบสั่งชัดเจน

## Review Ledger

| วันที่ | ผู้ตรวจ | Commit/ขอบเขต | ผล | ค้าง |
|---|---|---|---|---|
| 12 ส.ค. 2026 | Codex | scoring/flow/persona รอบแรก | พบ score bias, เลขสองเจ้าของ, nudge, history/tag/handoff gaps | scoring v4 calibration, persona hardening |
| 12 ส.ค. 2026 | Codex | `db2fef8` | รับบางส่วน; พบ consult/no-tag false success, history fire-and-forget, stale multi-image test | แก้ใน `5eeff5c` |
| 12 ส.ค. 2026 | Codex | `5eeff5c` | targeted tests ผ่าน; 4 จุดแก้ตรงข้อเสนอ | C2/C3/H6, C1 card correlation, test baseline, rollout cutoff |

## กติกาการอัปเดตไฟล์นี้

- สิ่งที่ deploy แล้วต้องระบุ `LIVE pro` พร้อม commit/date; คำว่า staging ห้ามตีความว่า production
- เมื่อรายการเสร็จ ให้ย้ายจาก "งานที่ยังเปิด" ไป "ยืนยันว่าแก้แล้ว" พร้อมหลักฐาน
- ถ้า Claude เห็นต่าง ให้เก็บเหตุผลและผลตัดสินของกบ ไม่ลบประวัติ
- อย่าใส่ secret, LINE user id เต็ม, ข้อมูลลูกค้า หรือค่าจริงจาก `.env`
