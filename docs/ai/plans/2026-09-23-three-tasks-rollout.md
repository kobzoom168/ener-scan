# Rollout / Rollback — 3 งานบน staging (23 ก.ย. 2026)

ฐาน: **Pro HEAD `be67a98185e3b2b2379303b919c69b5c37632cde`** (ชุด optout ที่ LIVE อยู่)
branch: `release/three-tasks` · **ยังไม่ deploy Pro · ไม่ broadcast · ไม่เปิดนโยบายจริง**

| งาน | commit | สวิตช์ | สถานะสวิตช์ |
|---|---|---|---|
| 1 ลูกค้าใหม่ฟรีรวม 2 ครั้ง | `d8dcd41` | `app_settings.new_customer_trial.enabled` (Admin UI) | **OFF** · `eligible_since = null` |
| 2 ปลดล็อกคลัง/รายงานย้อนหลัง | `845c4ec` | **ไม่มีสวิตช์ — กติกาถาวร** | ผลทันทีเมื่อ deploy |
| 3 อนุมัติสลิปผ่าน Telegram | `e414938` | `TELEGRAM_SLIP_APPROVAL_ENABLED` + 4 ตัวประกอบ | **ปิด** (ยังไม่มีรายชื่อผู้อนุมัติ) |

## Migration ที่ต้อง apply (ตามลำดับ ก่อน deploy โค้ดเสมอ)
| ไฟล์ | งาน | หมายเหตุ |
|---|---|---|
| `sql/057_new_customer_trial.sql` | 1 | idempotent · ไม่ backfill · policy เริ่มต้น OFF |
| `sql/061_telegram_slip_approval.sql` | 3 | idempotent · ตาราง token/audit ถูก REVOKE จาก web_anon เข้าได้ผ่าน RPC เท่านั้น |
| `sql/062_atomic_payment_approval.sql` | 3 | atomic grant/audit + durable notification intent |
| `sql/063_payment_approval_snapshot.sql` | 3 | mandatory calculation snapshot + evidence-backed notification stamp; removes unsafe old RPC overload |
(งาน 2 **ไม่มี migration** — เป็นการถอดเงื่อนไขในโค้ดล้วน)

`058/059/060` (optout) ขึ้น Pro ไปแล้ว ไม่ต้องทำซ้ำ

## Config ใหม่ (งาน 3 — ยังไม่ตั้งค่าใด ๆ)
ต้องครบทุกตัวจึงเปิด ขาดตัวใดตัวหนึ่ง = ปิดไว้ และ endpoint ตอบ 404 เหมือนไม่มี
- `TELEGRAM_SLIP_APPROVAL_ENABLED` (ค่าเริ่มต้นว่าง = ปิด)
- `TELEGRAM_APPROVER_USER_IDS` — **ยังไม่มี รอกบให้รายการ user id**
- `TELEGRAM_WEBHOOK_SECRET` — ตั้งคู่กับ `setWebhook`
- `TELEGRAM_APPROVAL_BOT_TOKEN` / `TELEGRAM_APPROVAL_CHAT_ID` — bot แยกสำหรับ approval ไม่มี fallback ไป bot แจ้งเตือนกลาง; staging ต้องคนละ bot กับ Pro

## ลำดับ rollout (เมื่อได้อนุมัติ)
1. เมื่อได้ GO Pro เท่านั้น: apply `057` → `061` → `062` → `063` แล้วตรวจ privileges/constraint ก่อนแตะโค้ด (ห้ามรัน 062 เดี่ยวหลัง 063 เพราะจะสร้าง RPC overload เก่าคืน)
2. deploy exact SHA แล้วตรวจ runtime hash ทุกคอนเทนเนอร์
3. **งาน 2 มีผลทันที** — ตรวจว่าลูกค้าที่ไม่เคยจ่ายเปิดคลังตัวเองได้ และยังเห็นของคนอื่นไม่ได้
4. งาน 1: **ประกาศล่วงหน้า 7 วัน** แล้วจึงเปิดสวิตช์ในวันที่นัด (การเปิดครั้งแรกตั้ง `eligible_since` ถาวร)
5. งาน 3: ให้กบส่งรายการ Telegram user id → ตั้ง config → `setWebhook` พร้อม secret →
   ทดสอบด้วยรายการสังเคราะห์ก่อน → **ขออนุญาตกบก่อนส่งสลิปลูกค้าจริงใบแรก**

## Rollback
**งาน 3** — ตั้ง `TELEGRAM_SLIP_APPROVAL_ENABLED=` (ว่าง) แล้ว restart · endpoint กลับเป็น 404 ทันที
ไม่ต้องถอน migration (ตาราง token/audit เป็น additive) · **ห้ามลบ `payment_approval_audit`** (หลักฐานการอนุมัติ)

**งาน 1** — ปิดสวิตช์ใน Admin · **`eligible_since` ต้องคงไว้** ห้ามรีเซ็ต ไม่งั้นเปิดใหม่จะแจกสิทธิ์ซ้ำ
ปิดแล้วระบบกลับไปใช้ฟรีรายวันตามค่าเดิมทันที · งานที่จองสิทธิ์ไว้แล้วไม่ถูกเพิกถอน

**งาน 2** — เป็นกติกาถาวร ถ้าจำเป็นต้องย้อนจริง ๆ ให้แก้ที่ `canViewOwnHistory()` จุดเดียว
(ออกแบบให้มีสวิตช์เดียวโดยตั้งใจ) — **แต่การย้อนหมายถึงลูกค้าที่เคยเห็นของตัวเองจะถูกล็อกอีกครั้ง
ต้องให้กบตัดสินใจเท่านั้น**

**ทั้งชุด** — ย้อนโค้ดเป็น `be67a98` (Pro ปัจจุบัน) · ก่อนย้อนต้องปิดสวิตช์งาน 1/3 ก่อนเสมอ
· ไม่ย้อน schema · ไม่แก้สิทธิ์ลูกค้าที่ให้ไปแล้ว

**ข้อควรระวังเพิ่มเติม 063:** `e53ef94`/`9412726` เรียก RPC signature เก่า ไม่ใช่ rollback target ที่เข้ากันได้กับ 063; อย่าคืน overload ที่ข้าม snapshot เพื่อแก้เฉพาะหน้า ต้องวาง maintenance/approval pause ก่อนสลับรุ่นกลางเหล่านี้. ถ้าย้อนเป็น `be67a98` เส้นอนุมัติจะกลับมีบั๊กสอง statement และ notifier ใหม่ไม่รัน ต้องทบทวนงาน grant ที่ยังไม่ enqueue ก่อนเลือก rollback; ไม่ควรย้อนโดยคิดว่าปลอดผลกระทบ.

**หลักฐานรอบ Codex local:** ดู `2026-09-23-codex-approval-hardening.md`. ยังไม่ apply 063 บน staging/Pro และยังไม่ติดตั้ง nginx snippet บนเครื่องจริง.

## สิ่งที่ยังไม่ได้ทำ (ต้องมีอนุมัติแยก)
- ประกาศล่วงหน้า 7 วันของงาน 1 (ยังไม่ร่าง ยังไม่ส่ง)
- รายชื่อ Telegram user id ผู้อนุมัติ + `setWebhook` + ส่งสลิปจริงใบแรก
- live smoke ที่ต้องใช้บัญชีกบ (รายการอยู่ท้ายรายงาน)
