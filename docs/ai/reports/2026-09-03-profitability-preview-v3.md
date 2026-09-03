# Profitability Preview v3 — ปิด 3 read-only blockers (3 ก.ย. 2026 · ยังไม่มี engine/outbox/scheduler)

## B1 — Historical delivery ด้วย actual-evidence predicate (แก้แล้ว)

Predicate ใหม่ (ตามสเปก): job dq นับ "ส่งจริง" เฉพาะเมื่อมี **released outbound**: kind=scan_result · status=sent · `related_job_id IS NULL` · line_user_id ตรง job · `payload.scanResultId = job.result_id` · payload.error ≠ true — **ห้ามนับแถว held original (related_job_id=job.id) เดี่ยว ๆ** ตามที่ Codex ชี้

ข้อเท็จจริงที่รองรับ predicate: outbound sent scan_result ที่มี payload.scanResultId มี 1,158 แถว และ **1,151 ใน 1,158 คือแถว related NULL (released) พอดี** — แถวส่งตรงปกติยุคนั้นไม่มี scanResultId ใน payload → การ match ด้วย user+resultId จำกัดอยู่ที่ released rows โดยธรรมชาติ ไม่มี false match จากแถวส่งตรง

**ผลจำแนก dq ทั้งหมด 1,178 แถว:**

| หมวด | จำนวน | ความหมาย |
|---|---|---|
| actualDelivered (released) | **1,151** | ลูกค้าได้รายงานจริง (ตอบคำถามแล้วระบบปล่อย) |
| heldOnly | **10** | ถูกถามข้อมูลแล้ว**ไม่เคยได้รายงาน** (เหยื่อบั๊กยุคก่อน P0-F) |
| noEvidence | **17** | ยุค มี.ค.–เม.ย. (กลไก outbound คนละยุค) |

(ต่างจาก v2 ที่นับ 1,162 — เกินมา 11 แถวคือ held/ซ้อน ที่ predicate เก่านับผิดจริงตามที่ Codex เตือน)

**Timeline spot-check 22 jobs (สุ่ม)**: pattern สอดคล้อง 100% — actual: held(markSent) แล้ว released ตามหลัง **1–38 นาที** (ลูกค้าตอบคำถาม → ปล่อยรายงาน) · heldOnly: มี held ไม่มี released (ส.ค. กระจาย ~1–3/สัปดาห์ รวม 10) · noEvid: ทุกตัวอย่างเป็น มี.ค.–เม.ย.

**ตารางสัปดาห์ (คอลัมน์ delivery แก้แล้ว, ตัด test):**

| สัปดาห์ | delivAuth | actualReleased | heldOnly | noEvid |
|---|---|---|---|---|
| 3 ส.ค. | 326 | 166 | 3 | 0 |
| 10 ส.ค. | 55 | 391 | 2 | 0 |
| 17 ส.ค. | 57 | 259 | 1 | 0 |
| 24 ส.ค. | 30 | 215 | 2 | 0 |
| 31 ส.ค. (บางส่วน) | 32 | 114 | 2 | 0 |

(สัปดาห์ก่อน 3 ส.ค.: delivered ปกติทั้งหมด ไม่มี dq — บั๊กเริ่มสัปดาห์ 3 ส.ค.)

## B2 — Test-account reconciliation (ตรงเป๊ะ)

Query ใช้ **full UID** จาก config (เทียบกับ prefix แล้วต่างกัน 0 แถว):

| เดือน | tx | amount |
|---|---|---|
| 2026-03 | 29 | 1,872฿ |
| 2026-04 | 106 | 5,194฿ |
| 2026-05 | 6 | 294฿ |
| 2026-06 | 15 | 735฿ |
| 2026-07 | 1 | 49฿ |
| **รวม** | **157** | **8,144฿** ✓ |

→ 156 รายการอยู่ มี.ค.–มิ.ย. นอกหน้าต่าง 9 สัปดาห์จริง · testTx=1 ใน preview ถูกต้อง ไม่ใช่ UID หลุด

## B3 — amount≠expected 3 แถว: จำแนกแล้ว (read-only ไม่แตะ state)

| แถว | ข้อมูล | จำแนก |
|---|---|---|
| 3b20b355 (21 มี.ค.) | amount 0 / expected 99 · แอดมินอนุมัติ · **บัญชีทดสอบ** | **test** |
| f6dbd2e8 (18 ก.ค.) | จ่าย 49 แต่ลงแพ็ก 29 (expected 29) · ลูกค้าจ่าย 49×2 รายการวันเดียว อีกแถวลงแพ็ก 49 ปกติ | **data_error (ป้ายแพ็กผิดฝั่งจ่ายเกิน)** — ไม่ใช่ leakage รายได้บันทึกตามเงินจริง |
| 5cbe5a5a (12 ส.ค.) | จ่าย 49 / expected 399 ได้แพ็ก 399_30scans_30d (unlock 720 ชม.) · ลูกค้าประจำหนักมาก (49฿ × 20 รายการ ก.ค.–ส.ค. ≈ 980฿) จ่าย 49 สองไม้วันนั้น ไม้หนึ่งถูกอนุมัติเป็นแพ็กใหญ่ · ไม่มี slip_amount (ไม่ใช่ OCR อ่านผิด) ดูเป็น approve-as โดยเจตนา | **unknown → เอียงไป legitimate_discount (แอดมินอัปเกรดให้ลูกค้าประจำ)** — **รอกบยืนยัน**: จำได้ไหมว่ากดให้แพ็ก 399 กับลูกค้าประจำคนนี้เมื่อ 12 ส.ค.? ถ้าไม่ใช่ = underpayment leak จะเปิด incident |

## คำถามค้างกบ (2 ข้อสั้น ๆ)
1. นอกจาก Ufe02fff… มี LINE ID ทดสอบอื่นไหม (ยืนยัน list)
2. เคส 5cbe5a5a: กบตั้งใจอัปเกรด 49→399 ให้ลูกค้าประจำเองหรือเปล่า

Revenue/AI/fixed-alloc/สรุปธุรกิจ คงตาม v2 (ส.ค. gross 2,885฿ · ส่วนต่างโดยประมาณติดลบทุก scenario · ต้องทำทั้งลด AI และเพิ่มลูกค้าจ่าย)
