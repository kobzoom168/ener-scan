# Profitability Preview v2 — แก้ตาม semantics Codex (3 ก.ย. 2026 · read-only · ยังไม่มี engine/scheduler/Telegram)

Config ที่ใช้ (owner_config): SERVER_MONTHLY_THB=600 · LINE_OA_MONTHLY_THB=1300 · USD_THB_REPORT_RATE=36.00 (source=owner_config) · TEST_LINE_USER_IDS=[Ufe02fff…] (**รอกบยืนยันว่ามีเพิ่มไหม — คำถามเดียวที่ค้าง**)

## 1. ผลตรวจ semantics ที่ Codex สั่ง (วัดจริงทั้งหมด)

- **Economic duplicates = 0**: slip_ref / provider_payment_id / payment_ref / slip_message_id ไม่มีค่าซ้ำใน paid เลยสักกลุ่ม → ไม่มีรายการต้อง flag review
- **amount≠expected (audit แยก)**: 3 แถว — จ่ายจริงรวม 98฿ แต่ expected รวม 527฿ (จ่ายขาดแต่ถูกอนุมัติ) · แสดงเป็น auditMismatchCount=3 ไม่แตะรายได้หลัก (รายได้ = amount จริง)
- **legacy `succeeded`**: 3 แถว 29฿ (มี.ค.) → legacyUnclassifiedCount=3, Amount=29฿ — ไม่รวม primary revenue
- **line_user_id ครบ 100%** ใน paid → unique payer ใช้ line_user_id ไม่ต้อง fallback
- **Refund: refundDataAvailable=false** — ระบบไม่มี SSOT refund · ตัวเลขทุกบรรทัดคือ **grossApprovedRevenue** · หมายเหตุถาวร: "ยังไม่รวมเงินคืนที่อาจเกิดนอกระบบ"
- **Inferred historical delivery**: dq ทั้งระบบ 1,179 แถว → **1,162 มีหลักฐานส่งจริง** (outbound kind=scan_result, status=sent, related_job_id ตรง; kind แยกจาก scan_failure และ held ไม่ใช่ sent จึงถูกกรองโดยนิยาม) · เหลือ 17 แถวไม่มีหลักฐาน (นอกหน้าต่าง 63 วัน/test) — ในตาราง 9 สัปดาห์ล่าสุด **dqNoEvid=0 ทุกสัปดาห์**

## 2. ตาราง 9 สัปดาห์ (จันทร์เวลาไทย · ตัด test ทุก metric · fixed alloc รายวันข้ามเดือนจริง)

| สัปดาห์ | grossApprovedRev | tx | payers | mix (pkg_code) | delivered auth+infer | failed | AI (mixed*) | fixed alloc | ส่วนต่างโดยประมาณ |
|---|---|---|---|---|---|---|---|---|---|
| 29 มิ.ย. | 245฿ | 5 | 1 | 49×5 | 40+0 | 0 | (ไม่มีข้อมูล) | 443฿ | ❓ |
| 6 ก.ค. | 882฿ | 18 | 6 | 49×18 | 263+0 | 38 | (ไม่มีข้อมูล) | 429฿ | ❓ |
| 13 ก.ค. | 892฿ | 8 | 7 | 49×5·29×1·อื่น×2 | 511+0 | 64 | (ไม่มีข้อมูล) | 429฿ | ❓ |
| 20 ก.ค. | 245฿ | 5 | 5 | 49×5 | 353+0 | 62 | (ไม่มีข้อมูล) | 429฿ | ❓ |
| 27 ก.ค. | 989฿ | 21 | 8 | 49×19·29×2 | 429+0 | 48 | (ไม่มีข้อมูล) | 434฿ | ❓ |
| 3 ส.ค. | 1,268฿ | 12 | 6 | 49×9·29×1·399×2 | 326+169 | 35 | $16.78≈604฿ | 429฿ | **+235฿** |
| 10 ส.ค. | 490฿ | 10 | 4 | 49×9·399×1 | 55+393 | 40 | $20.47≈737฿ | 429฿ | **−676฿** |
| 17 ส.ค. | 539฿ | 11 | 4 | 49×11 | 57+260 | 30 | $12.39≈446฿ | 429฿ | **−336฿** |
| 24 ส.ค. | 294฿ | 6 | 3 | 49×6 | 30+217 | 27 | $10.28≈370฿ | 429฿ | **−505฿** |
| 31 ส.ค. (บางส่วน) | 294฿ | 6 | 4 | 49×6 | 31+117 | 14 | $5.59≈201฿ | 441฿ | (ยังไม่จบสัปดาห์) |

\* AI = environmentMixed=true (Pro+Staging+dev-test ปน, key เดียวยุคนั้น) · coverage 2026-08-05 → 2026-09-03 · "ส่วนต่างโดยประมาณจากข้อมูลที่มี" ไม่ใช่กำไรสุทธิ (ไม่มีข้อมูล refund/fee)
test activity แยก (สำหรับตรวจระบบ): testTx รวมช่วงนี้ = 1 (49฿ สัปดาห์ 6 ก.ค.) · testScans = 77

## 3. เดือนสิงหาคม — estimate range (ห้ามอ่านเป็นบัญชีปิดเดือน)

- grossApprovedRevenue ส.ค. = **2,885฿** (45 tx · 12 payers) — จะ "ยืนยัน" ได้เมื่อ test list ครบ
- AI ส.ค.: CSV เริ่ม 5 ส.ค. (ขาด 1–4 ส.ค.) → **estimated range**: observed $61.36≈2,209฿ · base +ประมาณ 1–4 ส.ค. = $76.36≈**2,749฿** · high +20% ≈ 3,299฿ — ทั้งหมด environmentMixed
- Fixed เต็มเดือน = 1,900฿
- **ส่วนต่างโดยประมาณ ส.ค.: best −1,224฿ · base −1,764฿ · worst −2,314฿** → 🔴 เข้าเนื้อทุกกรณี (กว้างกว่าที่เคยพูด −1,100 เพราะรอบนี้รวม AI เต็มก้อน mixed — ของจริงฝั่ง Pro ล้วนจะรู้จากหน้าต่างวัดใหม่)
- แนวโน้มสำคัญกว่า: payers ก.ค. 22 → ส.ค. 12 คน · รายรับ/สัปดาห์ 900→294฿

## 4. พร้อมสำหรับเฟส C/D เมื่อ:
1. กบตอบ test-uid list (คำถามเดียว)
2. Codex ตรวจ preview v2 นี้ → เคาะ calculation engine + outbox
