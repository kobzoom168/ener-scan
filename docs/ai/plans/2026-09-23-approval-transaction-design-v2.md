# แบบ transaction/schema รอบสอง — อนุมัติ+เติมสิทธิ์ (ขอเคาะก่อนลง migration)

> รับข้อแก้ของ Codex ครบ: **ไม่ backfill** · **ไม่ใช้ snapshot ยอดคงเหลือเขียนทับ** ·
> ใช้ **transaction + row lock + unique grant** · outbox durable ใน transaction เดียวกัน
> · audit ถาวรใน transaction เดียวกัน · **ยังไม่ลง migration รอเคาะ**

## ทำไมแบบ snapshot เดิมผิด (ยอมรับ)
snapshot = 4 → เติมแล้ว → ลูกค้าใช้เหลือ 3 → recovery เขียน 4 ทับ = **คืนสิทธิ์ที่ใช้ไปแล้ว**
ต้นเหตุคือพยายาม "ตามแก้ทีหลัง" แทนที่จะทำให้ atomic ตั้งแต่แรก — แบบใหม่จึงไม่มี recovery
ที่เขียนยอดทับอีกเลย

## ขนาดผลกระทบที่ตรวจมาแล้ว
- `grantEntitlementForPackage` มี **ผู้เรียกเดียว** คือ `markPaymentApprovedAndUnlock`
  → ย้ายเข้า transaction ได้โดยไม่กระทบที่อื่น
- `markPaymentApprovedAndUnlock` มี **4 จุดเรียก**: admin dashboard ×2 · lineWebhook · liff
  (`slip_auto_liff`) และของใหม่คือ Telegram → **ทุกช่องทางได้ atomic เหมือนกัน ไม่มีเส้นทางเก่าเหลือ**
- `approve_notify` วันนี้ dedupe ด้วย **SELECT ก่อน INSERT** และ **ไม่มี unique index** → ต้องเพิ่ม

---

## schema ที่ขอเพิ่ม (additive ล้วน · ไม่แก้ข้อมูลเดิมแม้แถวเดียว)

### 1. `payment_entitlement_grants` — หลักฐานการเติมสิทธิ์ + กันซ้ำด้วย DB
```sql
CREATE TABLE public.payment_entitlement_grants (
  payment_id              uuid PRIMARY KEY,          -- ← unique grant: 1 payment = เติมได้ครั้งเดียวตลอดกาล
  app_user_id             uuid NOT NULL,
  granted_at              timestamptz NOT NULL DEFAULT now(),
  paid_plan_code          text NOT NULL,
  scans_added             integer NOT NULL,          -- จำนวนที่แพ็กให้ (ไม่รวม carry-over)
  carry_over              integer NOT NULL DEFAULT 0,
  paid_until              timestamptz NOT NULL,
  channel                 text NOT NULL,             -- telegram | web | line | liff
  actor                   text,
  notified_at             timestamptz                -- NULL = ยังไม่ได้แจ้งลูกค้า (คิวแจ้งเตือน)
);
```
**`payment_id` เป็น PRIMARY KEY คือหลักประกันว่าเติมซ้ำไม่ได้** ไม่ว่าจะมาจากช่องทางไหนหรือกี่เส้นพร้อมกัน

### 2. unique index กัน `approve_notify` ซ้ำที่ชั้น DB
```sql
CREATE UNIQUE INDEX uq_outbound_approve_notify_per_payment
  ON public.outbound_messages (related_payment_id)
  WHERE kind = 'approve_notify';
```
(เลิกพึ่ง SELECT-ก่อน-INSERT อย่างเดียว — race ยังลอดได้)

### 3. ไม่มีคอลัมน์ `entitlement_granted_at` บน `payments` และ **ไม่ backfill อะไรเลย**
แถว `paid` เก่า = **ไม่มีแถวใน `payment_entitlement_grants`** → ถือเป็น **legacy/ยังไม่ยืนยันหลักฐาน**
- sweeper **ไม่แตะ legacy เด็ดขาด** (ทำงานเฉพาะแถวที่มี grant row)
- ไม่เขียนประวัติว่า "เติมสำเร็จ" ให้ของเก่าเอง
- ถ้าภายหลังอยากตรวจสอบ/เยียวยาของเก่า = **งานแยก ต้องอนุมัติแยก**

---

## SQL function เดียว = อนุมัติ + เติมสิทธิ์ + audit + outbox (สำเร็จหรือ rollback พร้อมกัน)

```
approve_payment_and_grant(
  p_payment_id, p_channel, p_actor,
  p_expect_package_code, p_expect_amount,      -- ← ข้อ 2: ตรวจ ณ จุด commit จริง
  p_plan_code, p_scans, p_paid_until,          -- พารามิเตอร์ของแพ็ก (คำนวณฝั่ง JS แบบ read-only)
  p_is_top_package, p_notify_payload           -- ใช้ตัดสิน carry-over + เนื้อความแจ้งลูกค้า
) RETURNS jsonb
```
ลำดับใน **transaction เดียว**:
1. `SELECT … FROM payments WHERE id=? FOR UPDATE`
2. ตรวจสถานะ: ไม่ใช่ `pending_verify` → ถ้า `paid` **และมี grant row** = idempotent ok
   · ถ้า `paid` แต่ **ไม่มี grant row** = legacy → **คืน `legacy_unverified` ไม่เติมอะไร** (ห้ามเดา)
3. ตรวจ `p_expect_*` กับค่าจริงที่ล็อกไว้ → ไม่ตรง = `stale_package` / `stale_amount` **abort**
4. `SELECT … FROM app_users WHERE id=? FOR UPDATE`
5. คำนวณ `carry_over` **ใต้ล็อก** ด้วยกติกาเดิมเป๊ะ (แพ็กใหญ่สุด + ยังไม่หมดอายุ + คนละ plan + เหลือ>0 และ <900000)
6. `UPDATE app_users SET paid_until, paid_remaining_scans = p_scans + carry_over, paid_plan_code`
7. `INSERT INTO payment_entitlement_grants(...)` — **ชน PK = มีคนเติมไปแล้ว → abort ทั้งก้อน**
8. `UPDATE payments SET status='paid', verified_at, approved_by`
9. `INSERT INTO payment_approval_audit(...)` — **audit ถาวรอยู่ใน transaction เดียวกัน**
10. `INSERT INTO outbound_messages(kind='approve_notify', related_payment_id, payload_json)`
    — **outbox durable ใน transaction เดียวกัน** ชน unique index = มีอยู่แล้ว ข้ามไป

ล้มตรงไหนก็ตาม → **rollback ทั้งหมด** → payment ยังเป็น `pending_verify` → กดใหม่ได้ตามปกติ
**ไม่มีสถานะ "จ่ายแล้วแต่ไม่ได้สิทธิ์" อีกต่อไป และไม่มี recovery ที่เขียนยอดทับ**

### retry หลังลูกค้าใช้สิทธิ์ไปแล้ว
เป็นไปไม่ได้แล้ว: ถ้า commit สำเร็จ → มี grant row → เรียกซ้ำได้ `already_granted` ไม่แตะยอด
ถ้า commit ไม่สำเร็จ → ไม่มีอะไรถูกเขียนเลย → คำนวณใหม่จากยอดจริงปัจจุบัน

## ฝั่ง JS
- `markPaymentApprovedAndUnlock({ paymentId, approvedBy, expect?, channel? })` — **ชื่อ/รูปแบบเดิม**
  ข้างในเปลี่ยนเป็น: คำนวณพารามิเตอร์แพ็กแบบ read-only → เรียก RPC ตัวเดียว → คืนรูปเดิม
- `grantEntitlementForPackage` เหลือหน้าที่ **คำนวณอย่างเดียว** (ไม่เขียน DB) → แยกเป็น
  `resolveEntitlementForPackage()` และเก็บตัวเดิมไว้ชั่วคราวเพื่อทำ **parity test**
- แจ้งลูกค้า: sweeper ใน maintenance หยิบ grant ที่ `notified_at IS NULL` เกิน 2 นาที → enqueue
  (มี unique index กันซ้ำ) → stamp `notified_at` · **ไม่แตะสิทธิ์** · legacy ไม่มี grant row จึงไม่ถูกแจ้ง
- audit: ตรวจทั้ง `{error}` และ `throw` · แต่ **หลักฐานถาวรคือแถวใน `payment_approval_audit`
  ที่เขียนใน transaction เดียวกับการอนุมัติ** — Telegram/CRITICAL เป็นแค่สัญญาณเตือนเสริม

## ⚠️ จุดที่ต้องเคาะ: carry-over ย้ายไปคำนวณใน SQL
กติกาแพ็ก **ไม่เปลี่ยน** แต่เลขคำนวณย้ายจาก JS ไป SQL เพื่อให้อยู่ใต้ row lock เดียวกัน
(ถ้าคำนวณฝั่ง JS ก่อน แล้วส่งค่าเข้าไป จะกลับไปเป็นปัญหา "อ่านแล้วค้าง" แบบเดิม)
→ จะทำ **parity test** เทียบผลเก่า/ใหม่ทุกเคส: แพ็กเล็ก · แพ็กใหญ่สุด · ยังไม่หมดอายุ ·
หมดอายุแล้ว · plan เดิมซ้ำ · เหลือ 0 · เหลือ ≥900000 · ไม่มีแพ็กใน offer (เส้น `parsePackageCodeToEntitlement`)
**ถ้า parity ไม่ตรงแม้เคสเดียว จะหยุดและถามก่อน ไม่แก้กติกาเอง**

## สิ่งที่จะทำต่อเมื่อได้เคาะ (พร้อม integration tests ที่ใช้ DB จริง)
crash ก่อน/หลัง commit · retry หลังลูกค้าใช้สิทธิ์ · สอง payment ของคนเดียวกันพร้อมกัน ·
payment เดียวข้ามช่องทางพร้อมกัน · เปลี่ยนแพ็กก่อน commit · audit/outbox ล้ม ·
legacy ไม่ถูกเติม/ไม่ถูกแจ้ง · parity ของ carry-over

## ที่ทำไปแล้วในรอบนี้ (ไม่ต้องเคาะ — ส่ง commit มาด้วย)
**ข้อ 5 owner gate (แบบ A)** — `4bb603b` พร้อม HTTP integration test 7/7
