# สรุปงาน 20–21 ส.ค. 2026 — ระบบแบน · คุณภาพแชท · quota ledger

> สถานะ ณ 21 ส.ค. 2026 · branch `staging` @ `2321581` · pro อยู่ที่ sync `9a19b87` (= ระบบแบน 995d469)
> รายละเอียดรายรอบอยู่ใน `docs/ai/LOG.md` · คิวถัดไปใน `docs/ai/BACKLOG.md` หมวด "🎯 คิวคุณภาพแชท"

## 1. ขึ้น pro แล้ว (20 ส.ค.)
| สิ่งที่ขึ้น | รายละเอียด |
|---|---|
| ระบบแบน ID + monitor | Codex GO หลังรีวิว 14 รอบ · migration 054 (append-only) apply บน pro แล้ว · blue-green deploy สำเร็จ · smoke จริงผ่านครบ (ban/unban ด้วย uid สังเคราะห์, audit row, workers, Telegram) |
| ของที่มาพร้อมก้อนนี้ | exact utility (ประวัติ/จัดชุด) ก่อน payment lanes · in-flight bypass · เกตอันดับคนไม่จ่าย · identity classifier · idle bypass + AI-chain telemetry |
| คำสั่งแอดมินใหม่ใน LINE | `งานแบนค้าง` · `ปลดงานแบนค้าง <uid> <opId>` (นอกจาก แบน/ยืนยันแบน/ปลดแบน/ดูแบน) |

## 2. อยู่บน staging — รอ Codex GO แล้ว deploy (ยังไม่ขึ้น pro)
### 2.1 Incident cron รายงานคุณภาพแชท (20 ส.ค. 06:37)
- **สาเหตุที่พิสูจน์แล้ว**: hermes (บอท EneraibotV2 บนเครื่อง dev) เรียก OpenRouter/gemini-2.5-flash เจอ 504 upstream timeout ครบ 3 retries และ**ไม่มี model fallback เลย** · ข้อความซ้ำเกิดจาก **scheduler ซ้อน 2 ตัว** (ticker ใน hermes 06:30 + host crontab 06:32 ตั้งแต่ 23 ก.ค.) — อธิบายรายงานคู่ทุกวันก่อนหน้า
- **แก้ทันที**: ลบ host crontab ตัวซ้ำแล้ว (เช้า 21 ส.ค. มารายงานเดียว = ได้ผล)
- **Pipeline ใหม่ใน ener-scan** (แทน hermes หลังขึ้น pro): `chatQualityCurated.util.js` (เกณฑ์กบ + fallback chain ต่อ model typed + degraded report ห้ามทิ้งทั้งวัน) · `chatQualityReportOutbox.util.js` (lease strict fail-closed + renew compare-token + sent marker ต่อ chunk/channel + notification idempotent) · หน้าต่าง retry 06:00–11:00
- ข้อจำกัดที่ระบุตรง ๆ: at-least-once — crash หลัง Telegram รับก่อน save marker ส่งซ้ำได้ (Telegram ไม่มี idempotency key)

### 2.2 ชุดแก้จาก Codex raw log 19–20 ส.ค.
| # | ปัญหา | แก้ |
|---|---|---|
| P0-1 | ลูกค้าถามอันดับซ้ำแล้วโดนเงียบ (dedupe เทียบ copy) | gateway รู้จัก inbound messageId — suppress เฉพาะ redelivery · ranking semanticKey รวม requestedRank |
| P0-2 | job ค้าง `delivery_queued` 62/85 ทั้งที่ส่งแล้ว | เกตเก็บข้อมูลชิ้น re-enqueue โดยไม่มี `related_job_id` → แก้ให้เดินทางครบ · postDelivery idempotent · backfill SQL ใช้ **actual-delivery evidence** (outbound re-enqueue + scanResultId ตรง result_id — held outbound ห้ามนับ) ≈703 งาน |
| P1-3 | copy อ่อน/สัญญาเวลา | ack → "รับรูปแล้ว" · gate ask/unsupported/ไว้ก่อน/YT push/synergy = โทนแข็ง เสียงแอดมิน ไม่มี ครับ/เดี๋ยว/นาที/emoji |
| P1-4 | greeting/closing กิน AI | closing normalization (ๆ/คับ/คำเรียกท้าย/emoji) · greeting → "สวัสดี" · greeting+คำขอทั่วไปไม่มีหัวข้อ → "ระบุเรื่องที่ต้องการถาม" — AI=0 ทั้งหมด คำถามพ่วง/มีหัวข้อไม่โดนกลืน |

### 2.3 Quota ledger (B2) — เรื่องเงิน ปิด crash window ทุกจุด
- พบระหว่างแก้ P0-2: รายงานที่โดนเกตยึด**ข้ามหัก paid quota** มาตั้งแต่ 7 ส.ค. (223 scans / 10 users) → **กบเคาะ: ไม่หักย้อนหลัง ถือเป็นค่า incident**
- Migration **055**: ตาราง `scan_quota_decrements` (job_id PK + FK) · RPC `SECURITY DEFINER` รับแค่ job_id (เจ้าของ derive จาก DB) · decrement+complete ใน transaction เดียว + ROW_COUNT rollback · ตารางห้ามเขียนตรง (REVOKE + lockdown ใน migration scripts) · sweeper ใน maintenanceWorker = owner ของ retry · `reconcile_missing_quota_ledgers` สร้าง ledger คืนจากหลักฐานการส่ง **เฉพาะ job ที่มี `quota_accounting_version = 2`** (โค้ดรุ่นใหม่ตั้งตอน delivered) → container เก่าช่วง rolling deploy / งานประวัติศาสตร์ ไม่มีวันโดนหักซ้ำ
- **ทดสอบ RPC จริงบน staging DB ผ่าน 7/7** (apply 055 บน ener_scan_staging แล้ว) — authority, user_mismatch, claim ครั้งเดียว, reconcile legacy 0 / new 1 / skip 0, mark error, effective grants, web_anon insert denied
- B1 strict lease (fail-closed เมื่อไม่มี Redis) — Codex PASS แล้ว

### 2.4 เทสต์/gate
- gate ล่าสุด **165/173 files · 17 known leaf · ไม่มี fail ใหม่** · ไฟล์เทสต์ใหม่ 4: chatQualityReportPipeline, scanDeliveredStatus.contract, hardChatCopy.contract, (+ ขยาย banSystem/nonScanReply/closingPleasantry)

## 3. ลำดับ deploy (Codex GO ยืนยันบน `2321581` — 21 ส.ค. · รอกบสั่ง "เอาขึ้น pro")
> Codex แก้ลำดับ 1 จุด: **ห้ามปิด Hermes job ก่อน native report ส่งผ่านจริง** (กันรายงานหายทั้งสองทาง)

1. apply `sql/055_scan_quota_ledger.sql` บน `ener_scan_pro`
2. sync staging → main → `deploy-ener.sh pro` (ทุก container)
3. รัน `sql/backfill_delivered_status_20260820.sql` แล้วตรวจผล
4. smoke quota ledger
5. smoke native `ener_chat_quality` ใน ener-scan ให้ส่งรายงานสำเร็จจริง
6. **แล้วค่อย**ปิด Hermes job `ener_chat_quality` ตัวเดิม

### เกณฑ์ตรวจ backfill + ledger (Codex กำหนด)
- `remaining_with_actual_evidence = 0`
- held-only 5 งานยังคง `delivery_queued`
- historical 223 scans ไม่มี ledger และไม่ถูกหักย้อนหลัง
- paid scan ใหม่ลดสิทธิ์ครั้งเดียว
- free / duplicate ไม่มี marker และไม่มี ledger

### Smoke native `ener_chat_quality` นอกหน้าต่าง 06:00–11:00 (เงื่อนไข Codex 21 ส.ค.)
รันได้ แต่ต้องพิสูจน์ **transport จริง** ไม่ใช่แค่ state:
- ใช้ outbox/reportDateTH **จริง** — ห้ามล้าง sent marker เดิม ห้าม reset outbox
- ผลลัพธ์ `skipped: "finalized"` **ไม่นับว่าผ่าน** (แปลว่ารอบนั้นถูกส่งไปแล้ว ไม่ได้พิสูจน์ช่องส่ง)
- ต้องเห็นครบ: Telegram ตอบ `ok:true` + `CHAT_QUALITY_DELIVERY_CYCLE` มี `sent:true` + sent marker ของ native pipeline ถูกเขียนลง `app_settings.chat_quality_outbox:<date>` (`delivery.telegram.sent = true`)
- ถ้ารอบของวันนั้นถูก finalize ไปแล้ว → smoke ด้วย reportDateTH ที่ native ยังไม่เคยส่ง (กบจะเห็นรายงานเพิ่ม 1 ฉบับ — แจ้งล่วงหน้า) ห้ามลบ marker เพื่อบังคับให้ส่งซ้ำ
- ปิด Hermes job **หลัง**ยืนยันครบทั้งสามอย่างเท่านั้น

## 4. ค้าง / คิวถัดไป
- **C1 grounded output guard** (`enforceGroundedChatOutput` ทุก customer-visible LLM surface) — งานโฟกัสรอบถัดไป · fixture ชุดแรก: เคส 20 ส.ค. 20:48 (มโน "พระสมเด็จวัดประสาทบุญญาวาส ปี 2506 … พลังเด่นสมดุล/เมตตา") + เคส U03877cd "พระจริงพลังย่อมดีกว่า"
- C2 language/link/role guard · C3+C5 replay จาก metadata ก่อนแก้ · Gemini object-form 429 (incident แยก — 22 ครั้ง/24 ชม.)
