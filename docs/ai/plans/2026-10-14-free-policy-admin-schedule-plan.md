# แผนสั้น (ก่อนลงมือ): Admin ตั้งค่าสิทธิ์ฟรี 3 โหมด + ตั้งเวลา · 14 ต.ค. 2026

ฐาน: staging `b1f1ea7` (ตรวจสด: `new_customer_trial = {enabled:true, eligible_since 2026-09-26 09:07:59Z, limit 2}` · `scan_offer.freeQuotaPerDay` จาก override /admin/promo · ไม่มีตารางกำหนดการ) · Pro `be67a98` ไม่มี 057 (ฟรีรายวัน 1/วัน) · **ยังไม่แก้โค้ด ยังไม่เปลี่ยนสวิตช์/cutoff/สิทธิ์จริง**
ไม่รวม: กติกาซื้อแพ็กซ้ำ · broadcast (กบส่งเอง) · Pro

## 0. ของเดิมทำงานอย่างไร (ตรวจโค้ด)
- ด่านสิทธิ์ `checkScanAccess`: อ่าน `new_customer_trial_status()` ทุกครั้ง → `trial.enabled=true` ⇒ โหมดลูกค้าใหม่ (`applyTrialToGate`, `freePolicy:"new_customer"`) · `false` ⇒ ฟรีรายวันจาก `offer.freeQuotaPerDay` (`decideScanGate`, `freePolicy:"daily"`) — **ไม่มีโหมด "ไม่มีสิทธิ์ฟรี"** เพราะ `freeQuotaPerDay` ถูกบังคับ ≥1 (`intPos`) และ trial ปิด = daily โดยปริยาย (= "สวิตช์ชื่อกลับความหมาย" ที่ Codex ไม่ให้ใช้)
- ข้อความ: `resolveFreePolicy()` คืน `new_customer|daily|unknown` ใช้ใน welcome/soft-close/fatigue/paywall (`entitlementCopy`, `scanOffer.copy`, templates) · LIFF: `resolveLiffRights().freePolicy` · โหมด daily มีประโยค "พรุ่งนี้มีฟรี" — ถ้าปิดฟรีทั้งคู่ ข้อความพวกนี้จะผิด
- สวิตช์: `set_new_customer_trial_policy(bool)` (057; เปิดครั้งแรกตั้ง `eligible_since` ถาวร, ปิด–เปิดไม่รีเซ็ต) · หน้า `/admin/free-trial` (session หรือ legacy token, CSRF, confirm)
- ไม่มีตั้งเวลา · maintenance worker วน 60 วิ (`runOnce`) ใช้วางตัวเช็คกำหนดการได้ · `app_settings` มี `getAppSetting/setAppSetting`

## 1. Schema/API ที่จะเปลี่ยน (`sql/067_free_policy_modes_schedule.sql`, idempotent, ไม่ backfill)
- `app_settings.free_policy` = `{ "daily_enabled": true, "updated_at", "updated_by" }` (INSERT … ON CONFLICT DO NOTHING; ค่าเริ่มต้น true = พฤติกรรมเดิม) · คง `new_customer_trial` (057) เป็นสวิตช์ทดลอง ไม่แตะ `eligible_since`/ยอด
- **โหมดที่มีผล (นิยามเดียว DB+JS):** `new_customer` ถ้า `new_customer_trial.enabled` · ไม่งั้น `daily` ถ้า `free_policy.daily_enabled` · ไม่งั้น `none`
- RPC `free_policy_status()` → `{mode, daily_enabled, trial:{enabled, eligible_since, limit}, pending_schedule}` (web_anon+service_role EXECUTE; ไม่มีข้อมูลลับ)
- RPC `set_free_policy_mode(p_mode, p_actor, p_cancel_pending boolean default false)` SECURITY DEFINER FOR UPDATE: เขียน **ทั้งสองสวิตช์ในทรานแซกชันเดียว** → `daily` = trial off + daily on · `new_customer` = trial on (เรียก `set_new_customer_trial_policy(true)` เดิม → `eligible_since` คงเดิม/ตั้งครั้งแรก) + daily off · `none` = ทั้งคู่ off · **เปิดพร้อมกันไม่ได้โดยโครงสร้าง** · ถ้ามีกำหนดการ pending และ `p_cancel_pending=false` → RAISE `schedule_pending` (ชนกันไม่ได้) · audit
- ตาราง `free_policy_schedule` (id, target_mode, effective_at, announced_at, status pending|applied|cancelled|superseded, created_by/at, applied_at, applied_from_mode, cancelled_by/at, note) + partial unique index `status='pending'` (มีได้ทีละ 1)
- RPC `free_policy_schedule_set(p_target_mode, p_effective_at, p_announced_at, p_actor)`: ตรวจ `effective_at > now()` · ถ้าโหมดปัจจุบันมีฟรีรายวัน (`daily`) และเป้าหมายไม่มี (`new_customer`/`none`) → **ต้องมี `announced_at` (เวลาที่กบยืนยันว่าส่งประกาศจริงแล้ว, ≤ now())** และ `effective_at ≥ announced_at + 72 h` (นับจากเวลาประกาศ ไม่ใช่เวลาเขียนโค้ด/deploy) · pending เดิม → `superseded` · **ไม่เปลี่ยนสิทธิ์ทันที** · audit
- RPC `free_policy_schedule_cancel(p_id, p_actor)` · RPC `free_policy_schedule_apply_due()` SECURITY DEFINER: `SELECT pending WHERE effective_at <= now() FOR UPDATE SKIP LOCKED` → `set_free_policy_mode(target, 'schedule:'||id, true)` → `applied` + `applied_from_mode` · **idempotent/restart-safe** (สถานะอยู่ใน DB; เรียกซ้ำไม่มี pending = ไม่ทำอะไร; การเปลี่ยนโหมดไม่แจกสิทธิ์ใคร — สิทธิ์ทดลองคำนวณจาก `created_at ≥ eligible_since` เดิม)
- ตาราง `free_policy_audit` (actor, action, from_mode, to_mode, schedule_id, detail) · REVOKE จาก web_anon เขียนผ่าน RPC เท่านั้น
- preflight เพิ่มแถว 067 · md5 reference · ลำดับ Pro: 057→061→062→063→064→065→066→**067** ก่อน deploy

## 2. โค้ดแอป (ทุกเส้นใช้โหมดเดียวกัน)
- `paymentAccess.checkScanAccess`: อ่าน `free_policy_status()` (แทนการอนุมานจาก trial อย่างเดียว) → `mode none` ⇒ `freeQuotaPerDay=0`, `freePolicy:"none"`, `freeScansLimit 0` (แพ็ก/โบนัสยังผ่านตามเดิม: `paid` ก่อน, `viaBonus` เมื่อฟรีหมด) · `daily` ⇒ เดิม · `new_customer` ⇒ เดิม
- `entitlementCopy`: policy เพิ่ม `"none"` → state `free_off_no_rights` ("ตอนนี้ไม่มีสิทธิ์ฟรี · แพ็กที่ซื้อและโบนัสเดิมใช้ได้ · รายงาน/คลังเดิมเปิดดูได้") · `buildPaywallCopy/buildSoftCloseCopy/buildFirstScanInviteLine/welcome/fatigue` ห้ามสัญญา "พรุ่งนี้มีฟรี/ฟรีวันละ" เมื่อ `none` (เพิ่มใน FORBIDDEN ของโหมด none) · `resolveFreePolicy()` คืน `none` ได้ · `scanOffer.copy`/templates ที่อ้าง `{freeQuotaPerDay}` ต้องเลือก pool ตามโหมด
- LIFF `resolveLiffRights`: `freePolicy none` → `freeLeft 0` + ข้อความ "ไม่มีสิทธิ์ฟรี" (ไม่ใช่ "ฟรีวันนี้ 0")
- ด่านรับรูป `lineWebhook`: เส้น `pre_object_check` ปัจจุบันกัน `new_customer` ก่อนดาวน์โหลด → ขยายให้ `none` ด้วย (ไม่เรียก AI เมื่อไม่มีสิทธิ์) · **คลัง/รายงานเดิมของตัวเองไม่ผูกโหมด** (owner vault งาน 2 คงเดิม)
- `maintenanceWorker.runOnce`: เพิ่ม `applyDueFreePolicySchedule()` (เรียก RPC, log ผล, ไม่มี cache) + สคริปต์ ops `scripts/ops/free-policy-apply-due.mjs` สำหรับรันมือถ้า worker หยุด
- Admin: หน้า **`/admin/free-policy`** (session-only + CSRF + audit + badge staging/Pro ตามแบบหน้า Telegram) แทน `/admin/free-trial` (เส้นทางเดิม redirect) — แสดง **สถานะที่ใช้งานตอนนี้** (โหมด + ผลต่อบัญชีเก่า/ใหม่ + วันคัตออฟ) แยกจาก **กำหนดการที่จะเปลี่ยนเมื่อถึงเวลา** (เป้าหมาย/เวลาไทย/เวลาประกาศ/แก้ไข/ยกเลิก) · ตัวเลือกโหมด 3 ปุ่มชื่อตรงความหมาย ("ฟรีรายวัน วันละ N ครั้ง" / "ลูกค้าใหม่ ทดลองรวม 2 ครั้งต่อบัญชี ไม่เติมรายวัน" / "ไม่มีสิทธิ์ฟรี") + "เปลี่ยนทันที" หรือ "กำหนดวัน–เวลา (ไทย)" · ช่อง "เวลาที่ส่งประกาศจริง" บังคับเมื่อถอนฟรีรายวัน · ยืนยัน 2 ชั้น · ถ้ามีกำหนดการค้าง การเปลี่ยนทันทีต้องยกเลิกกำหนดการก่อน (ไม่ชนกัน) · ไม่ broadcast

## 3. ตั้งเวลา/ยกเลิก/rollback
- ตั้ง: บันทึกแถว pending เท่านั้น (สิทธิ์ไม่เปลี่ยน) → maintenance เช็คทุก 60 วิ → ถึงเวลา apply ครั้งเดียว · ก่อนถึงเวลา: แก้ไข = set ใหม่ (เดิม superseded) / ยกเลิก = cancelled · หลัง apply: แสดง applied + from/to + เวลา
- ระบบหยุดแล้วกลับมา: pending ที่เลยเวลาถูก apply ในรอบแรกหลังกลับมา (ช้าแต่ไม่ซ้ำ) · worker 2 ตัวพร้อมกัน → SKIP LOCKED ครั้งเดียว
- rollback 067: ยกเลิก pending ทั้งหมด → ตั้งโหมดที่ต้องการด้วย `set_free_policy_mode` → ย้อนโค้ด (โค้ดเก่าอ่านแค่ trial: trial off = daily โดยปริยาย) · **ห้ามย้อนโค้ดขณะโหมด `none`** (จะกลายเป็น daily ทันที) · ไม่ DROP ตาราง/ไม่แก้ยอด/ไม่รีเซ็ต eligible_since

## 4. เทสต์ (ก่อน–ตรง–หลังเวลามีผล + หยุดแล้วกลับมา)
- unit: โหมด 3 แบบ → `checkScanAccess`/`resolveLiffRights`/copy (LINE+LIFF+paywall+welcome+soft-close) ตรงกันและไม่มีคำต้องห้ามต่อโหมด · `none`: แพ็ก/โบนัสเดิมยังผ่าน · คลังเดิมไม่ผูก
- DB script (Postgres จริง 057→067): exclusivity (ไม่มีทางทั้งคู่ on) · เปิด–ปิดไม่รีเซ็ต eligible_since/ยอด · schedule_set: effective ≤ now ปฏิเสธ · ถอน daily ไม่มี announced_at/ต่ำกว่า 72h ปฏิเสธ · supersede/cancel · apply_due ก่อนเวลา = ไม่ทำ / ตรงเวลา = apply ครั้งเดียว / หลังเวลา (จำลอง restart) = apply ครั้งเดียว / เรียกซ้ำ+พร้อมกัน = ไม่ซ้ำ · manual change ขณะ pending = ปฏิเสธจนยกเลิก · ยอดทดลองไม่เปลี่ยนจากการ apply
- router: session-only/CSRF/validation/บันทึกกำหนดการไม่เปลี่ยนโหมด/แสดงสถานะตอนนี้≠กำหนดการ/ยกเลิก
- gate ✅ · harness โบนัส/trial เดิมยังผ่านบน 067

## 5. ลำดับหลังเคาะ
โค้ด+เทสต์ (commit แยก: sql/067 · service/copy · admin page · worker) → Codex ตรวจ → staging: apply 067 (preflight/md5) → deploy → กบดูหน้า Admin (ไม่เปลี่ยนโหมด) → ทดสอบตั้งเวลาสั้น ๆ บน staging (เช่น +10 นาที, โหมดที่ไม่ถอน daily) → Pro ภายหลัง GO
**เป้าหมายใช้งานจริงของกบ (Pro):** ส่ง broadcast เอง → กรอกเวลาที่ประกาศ → ตั้งกำหนดการ `new_customer` ที่ ≥ +72 ชม. → ถึงเวลา ระบบปิดฟรีรายวันและเปิดทดลองลูกค้าใหม่ 2 ครั้งอัตโนมัติ (ไม่แจกสิทธิ์ซ้ำ ไม่รีเซ็ตใคร)

## 6. ขอเคาะก่อนลงมือ
(ก) ใช้ `app_settings.free_policy.daily_enabled` + คง 057 (ไม่ย้าย trial ไปที่ใหม่) (ข) หน้า Admin ใหม่ `/admin/free-policy` session-only (ค) 72h นับจาก `announced_at` ที่กบกรอกยืนยัน (ง) โหมด `none` เป็นโหมดจริง (ไม่ใช่ quota 0 ใน offer)
