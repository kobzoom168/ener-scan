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

---

## 7. ผลการทำ (14 ต.ค. 2026) — โค้ด+เทสต์ในระบบแยก · **ยังไม่ apply/deploy · ไม่แตะ staging/Pro · ไม่ broadcast · ไม่เปิด Telegram**

Codex รับแนวทางหลัก + ขอปรับ 5 ข้อ → ทำครบ:

| ข้อ Codex | ทำอย่างไร | หลักฐาน |
|---|---|---|
| 1 migration คงโหมดเดิม / กันช่องทางเก่า | `free_policy.daily_enabled` เริ่ม = `NOT trial.enabled` (staging trial ON → daily_enabled=false → effective ยัง new_customer, cutoff คงเดิม) · `set_new_customer_trial_policy(bool)` กลายเป็น wrapper เรียก `set_free_policy_mode` (ไม่มี announced_at → ถอน daily ไม่ได้ = `notice_required`) + REVOKE จาก web_anon/service_role · หน้าเก่า `/admin/free-trial` GET→302 หน้าใหม่, POST→410 | DB test 1a/1b · unit test legacy page |
| 2 72h บังคับฝั่ง DB ทั้งทันที/ตั้งเวลา ไม่มีทางลัด | `free_policy_notice_check(from,to,effective_at,announced_at)`: ถอน daily (→ new_customer/none) ต้องมี announced_at ≤ now และ effective_at ≥ announced_at+72h · ใช้ทั้ง `set_free_policy_mode` (effective=now) และ `free_policy_schedule_set` · `p_cancel_pending` แค่ยกเลิก pending ก่อน ตรวจ 72h เหมือนเดิม (ล้ม → rollback ทั้งก้อน pending ยังอยู่) · audit เก็บ actor + announced_at + via manual/schedule | DB test 2 |
| 3 ถึงเวลาแล้วทุกด่านใช้โหมดเดียวแม้ worker ช้า/หยุด | `free_policy_mode_now(p_at)`: pending ที่ `effective_at <= now` **ชนะ** stored mode · `new_customer_trial_status` (ด่านสิทธิ์/LIFF/copy ผ่าน `checkScanAccess`/`resolveFreePolicy`) และ trigger `guard_new_customer_trial_job` (ด่านสร้างงาน; none → RAISE `free_policy_none`) ใช้ฟังก์ชันนี้ตัวเดียว · `set_free_policy_mode`/`schedule_set` เรียก `free_policy_reconcile_due()` ก่อนตัดสิน from_mode · worker ทุก 60 วิ + หน้า Admin ตอนเปิด เรียก `free_policy_schedule_apply_due` (บันทึก stored switches + audit; ไม่ใช่ตัวตัดสินสิทธิ์) | DB test 3a/3b/5c · unit `freePolicyModes` |
| 4 cutoff ตั้งเวลา = เวลามีผล ไม่ใช่เวลา worker ตื่น · cutoff เดิมคงเดิม | `free_policy_mode_now` คืน `eligible_since = schedule.effective_at` เมื่อ trial เปิดครั้งแรกผ่าน schedule ที่ถึงเวลา (ยังไม่ apply) · `free_policy_apply_internal(..., p_eligible_since_if_first = s.effective_at)` ตอน apply · มี eligible_since แล้วไม่แตะเลย | DB test 3b/4 (บัญชี created_at ก่อน 1ms / ตรง / หลัง 1s · apply หลัง effective 400ms → cutoff = effective_at) · 4b |
| 5 RPC เขียนจำกัดสิทธิ์ · เทสต์สิทธิ์ + apply ชน cancel/manual | role `free_policy_admin` (GRANT ให้ `telegram_config_admin` → JWT `TELEGRAM_CONFIG_DB_KEY` ที่ staging มีอยู่ใช้ได้; หรือตั้ง `FREE_POLICY_DB_KEY` แยก) · REVOKE จาก web_anon/service_role ทั้ง set/schedule_set/cancel/apply_due/audit_recent/set_new_customer_trial_policy · `apply_internal`/`reconcile_due` ไม่ grant ใครเลย · ตารางไม่อ่านได้จาก web_anon/service_role · apply_due ใช้ `FOR UPDATE SKIP LOCKED` | DB test 5 (denied ทุก RPC + reads ok) · 5b (apply ชน apply → 1 ผู้ชนะ; cancel ระหว่าง apply → `schedule_not_pending`; manual ขณะ pending → `schedule_pending` / cancel_pending) |

### ไฟล์
- `sql/067_free_policy_modes_schedule.sql` — idempotent (apply ×2 ผ่าน), ไม่ backfill, rollback ห้าม DROP (ตั้งโหมดที่ต้องการแล้วย้อนโค้ด; **ห้ามย้อนโค้ดขณะโหมด none** เพราะโค้ดเก่าอ่าน enabled=false เป็น daily)
- `scripts/ops/test-free-policy-db.mjs` — DB test 9 กลุ่ม (container แยก network none)
- `src/services/freePolicy.store.js` (RPC + แปล error) · `src/routes/adminFreePolicy.routes.js` (หน้าใหม่ session-only + CSRF; เวลาไทย; reconcile ตอนเปิด) · `src/routes/adminFreeTrial.routes.js` (302/410)
- โหมด none ในแอป: `newCustomerTrial.service` (`freePolicyModeOf`, gate none = 0 สิทธิ์ฟรี, paid คง) · `paymentAccess.service` (ไม่นับฟรีรายวันใน none; `buildPaymentGateReply` none ใช้ entitlementCopy) · `entitlementCopy.service` (policy none → existing_no_rights/paid_expired/bonus · `FORBIDDEN_IN_NONE_MODE`) · `scanOffer.copy` (none → pool existing_no_rights_trial) · `lineWebhook` (pre_object_check กัน none ก่อนโหลดรูป; หลัง trigger กัน → อ่านสิทธิ์ใหม่ก่อนตอบ paywall) · `webhookImageIngestion` (guard code `free_policy_none`) · LIFF (zero-state none ไม่พูดทดลองฟรี) · `maintenanceWorker` (`sweepFreePolicySchedule` ทุกรอบ; ไม่มี key = ข้าม log ครั้งเดียว)
- เทสต์: `tests/freePolicyModes.behavior.test.js` (12) · `tests/newCustomerTrial.test.js` ปรับหน้าเก่า · harness line-webhook/bonus เพิ่ม 067 (เปิด trial ด้วย `set_free_policy_mode(..., now()-73h)`) · preflight 12 แถว 067 · md5 reference 29 ฟังก์ชัน
- env ใหม่ (optional): `FREE_POLICY_DB_KEY` — ไม่ตั้งก็ใช้ `TELEGRAM_CONFIG_DB_KEY` (staging มีแล้ว) · worker-maintenance ต้องเห็น key (compose ใช้ `.env` ร่วมอยู่แล้ว)

### ข้อสังเกตที่ Codex ควรรู้
- 72h บังคับเฉพาะ "ถอนฟรีรายวัน" (daily → new_customer/none) ตามแผน · new_customer → none / none → ใดก็ได้ / → daily ไม่ต้องประกาศ (เปิดเพิ่มสิทธิ์หรือลูกค้าใหม่ไม่เคยได้ daily) — ถ้าต้องการให้ new_customer → none ก็ต้องประกาศ บอกได้ แก้บรรทัดเดียวใน `free_policy_notice_check`
- staging ตอนนี้ trial ON → หลัง apply 067 โหมดที่มีผล = new_customer เท่าเดิม ไม่มีอะไรเปลี่ยนกับลูกค้า
- หน้า Admin ไม่ broadcast; กบประกาศเองแล้วกรอก "ประกาศเมื่อ" (ตรวจใน DB)
- ป้าย Environment บนหน้าใหม่ยังอ่านจาก APP_ENV/NODE_ENV (staging โชว์ production — cosmetic เดิม ไม่ใช้ตัดสินอะไร)

## 8. Codex รอบ 2 (14 ต.ค. 2026) — 3 ช่องโหว่ที่พิสูจน์ได้ → แก้แล้ว (อยู่ใน sql/067 ไฟล์เดียว ยังไม่ apply ที่ไหน)

| # | ช่องโหว่ (Codex พิสูจน์) | แก้ | เทสต์ |
|---|---|---|---|
| 1 | 041 ให้ web_anon/service_role เขียน `app_settings` ตรง → แก้ `free_policy.daily_enabled` ข้าม RPC/ประกาศ/audit ได้ | trigger `trg_guard_free_policy_settings` (BEFORE INSERT/UPDATE/DELETE) กัน **UPDATE/DELETE/rename** ของ key `new_customer_trial`/`free_policy` → RAISE `free_policy_protected` · เขียนได้เฉพาะในทรานแซกชัน RPC (`set_config('ener.free_policy_rpc','on',true)` ใน `free_policy_apply_internal`, ปิดก่อนคืน) · INSERT ปล่อย (เปลี่ยนค่าที่มีอยู่ไม่ได้: DO UPDATE โดน trigger UPDATE, DO NOTHING ไม่เปลี่ยน, DELETE ถูกกันจึงลบแล้วใส่ใหม่ไม่ได้) → re-apply 057/067 seed-if-absent ยังรันได้ · key อื่นไม่กระทบ · ops ซ่อมมือ: `SET ener.free_policy_rpc='on'` ในทรานแซกชันเดียว | DB test (a): fixture ใส่ GRANT จริงจาก 041 · web_anon/service_role UPDATE/DELETE/INSERT…DO UPDATE/rename ทั้งสอง key → `free_policy_protected` · superuser ไม่มี flag ก็โดน · scan_offer ยังเขียนได้ · ค่าไม่เปลี่ยน audit=0 · re-apply 057/064/065/067 หลัง trigger ผ่าน |
| 2 | อ่านโหมด/ตรวจ 72h ก่อนล็อก → สอง transaction (A none→daily ค้าง commit, B →new_customer ไม่มีประกาศ) ผ่านทั้งคู่ audit `daily→new_customer announced_at=null` | `free_policy_lock()` = `SELECT … FROM app_settings WHERE key IN (2 key) ORDER BY key FOR UPDATE` เรียก **บรรทัดแรก** ของ `set_free_policy_mode` / `free_policy_schedule_set` / `free_policy_schedule_cancel` / `free_policy_reconcile_due` (apply_due) ก่อน reconcile/อ่าน/ตรวจ · ลำดับล็อกเดียวกันทุก RPC: settings → schedule (reconcile_due เลิก SKIP LOCKED เพราะถือล็อก settings อยู่แล้ว) | DB test (b): เคสเดียวกับ Codex → B รอ A commit แล้วเห็น daily → `notice_required` · audit ไม่มี daily→new_customer ที่ announced_at null · เคส B มีประกาศ → ต่อคิวหลัง A audit `none>new_customer` · 5b apply ชน apply ยัง 1 ผู้ชนะ |
| 3 | `free_policy_schedule_cancel` ตรวจแค่ pending → ยกเลิกกำหนดการที่ถึงเวลาแล้ว (worker ยังไม่ apply) โหมด+cutoff ถอยกลับ | cancel: ล็อก → ถ้า `effective_at <= t` → RAISE `schedule_already_effective` (ไม่มีทางยกเลิกย้อนหลัง) · **RAISE = ทรานแซกชัน rollback ทั้งหมด แถวยังคง pending** (ไม่ได้บันทึก applied ในคำขอนั้น — Codex รอบ 3 แก้คำอธิบาย) และยังมีผลอยู่ทาง `free_policy_mode_now`; worker/RPC ถัดไป apply ให้ · schedule_set/set_free_policy_mode ก็ reconcile ก่อนจึงไม่ supersede/cancel ของที่มีผลแล้ว · หน้า Admin: กำหนดการที่ถึงเวลาแสดง "ถึงเวลาแล้ว (มีผลกับลูกค้าแล้ว รอระบบบันทึก)" ไม่มีปุ่มยกเลิก ไม่มีช่อง cancel_pending · error แปลไทย | DB test (c): cancel หลังถึงเวลาก่อน worker → `schedule_already_effective` · effective mode คง · cutoff คง · worker apply ทีหลังได้ · DB ใหม่ที่ cutoff ตั้งครั้งแรกผ่าน schedule → cutoff รอด = effective_at · unit หน้า Admin (ถึงเวลา = ไม่มีปุ่ม / อนาคต = มีปุ่ม / error ไทย) |

preflight +4 แถว (trigger มี, lock/guard ไม่ grant ใคร, set_free_policy_mode ล็อกก่อนอ่าน, cancel มี schedule_already_effective) · md5 reference 31 ฟังก์ชัน · DB test 12 กลุ่ม · unit 13 · harness line/bonus/telegram บน 067 · gate

## 9. Codex รอบ 3 (14 ต.ค. 2026) — 2 ช่องโหว่ที่ยังปิดไม่ครบ → แก้แล้ว

| # | ช่องโหว่ | แก้ | เทสต์ |
|---|---|---|---|
| 1 | guard เชื่อ GUC `ener.free_policy_rpc` อย่างเดียว — web_anon ตั้งเองได้ใน transaction แล้ว UPDATE ตรง → mode=none audit=0 | `guard_free_policy_settings` เป็น **SECURITY INVOKER** (current_user = ผู้เรียกจริง) และปล่อยเฉพาะเมื่อ `current_user = owner ของ free_policy_apply_internal` (ภายใน SECURITY DEFINER ของ owner เท่านั้น; web_anon/service_role/free_policy_admin SET ROLE เป็น owner ไม่ได้) **และ** GUC เป็น on (สัญญาณภายใน ไม่ใช่หลักฐานสิทธิ์) · ops ซ่อมมือ = เป็น owner (postgres) + SET LOCAL GUC | DB test (a3): web_anon/service_role/free_policy_admin ตั้ง GUC ด้วย SET / SET LOCAL ใน tx / set_config แล้ว UPDATE 2 key, DELETE, rename → `free_policy_protected` ทุกเคส · key อื่นยังเขียนได้แม้ตั้ง GUC · RPC ที่ถูกต้องยังทำงาน (ผู้เรียกตั้ง GUC หรือไม่ก็ได้) · ตรวจ prosecdef=false |
| 2 | cancel ใช้ `now()` = เวลาต้นทรานแซกชัน → คำขอยกเลิกที่รอล็อกจนเลยกำหนดยังยกเลิกย้อนหลังได้ (daily, cutoff=null) | ทุก RPC เขียน (`set_free_policy_mode`, `free_policy_schedule_set`, `free_policy_schedule_cancel`, `free_policy_reconcile_due(p_at)`) จับ `t := clock_timestamp()` **หลัง** `free_policy_lock()` และใช้ t ตัดสินทั้งหมด: due (`effective_at <= t`), cancel, reconcile (ส่ง t เดียวกัน), 72h (`notice_check(..., t, ...)`), announced_at ≤ t, effective_at > t, และ timestamp ที่บันทึก (cancelled_at/applied_at) | DB test (d): ผู้ถือล็อก (superuser) ถือแถว settings ข้าม effective_at · d1 cancel ที่เริ่มก่อนกำหนด ได้ล็อกหลังกำหนด → `schedule_already_effective`, mode new_customer, cutoff = effective_at, แถวยัง pending (RAISE rollback) · d2 schedule_set แทนที่ที่รอล็อกเลยกำหนด → ของเดิมถูก apply (ไม่ใช่ superseded), ของใหม่ยึดโหมดหลัง reconcile, cutoff คง · d3 manual change (cancel_pending) ที่รอล็อกเลยกำหนด → ตัดสินจากโหมดที่มีผลแล้ว (daily → none ต้องประกาศ → `notice_required`) โหมด/cutoff ไม่ย้อน |
| 3 | คำอธิบาย "reconcile เป็น applied แล้ว RAISE" ไม่ตรงจริง | แก้คอมเมนต์ใน SQL/§8/ข้อความหน้า Admin ให้ตรง: ปฏิเสธแล้วแถว **ยังคง pending** รอ worker/RPC ถัดไป apply (โหมดมีผลอยู่แล้วทาง mode_now) | DB test (c)/(d1) ยืนยัน status=pending หลังปฏิเสธ แล้ว apply_due ภายหลังได้ |

## 10. Runbook ขออนุมัติ: apply 067 + deploy staging ที่ `7a5906e` (Codex GO 14 ต.ค. 2026 — รอกบอนุมัติก่อนทำ)

**ขอบเขต:** ไม่เปลี่ยนโหมด · ไม่สร้างกำหนดการ · ไม่ broadcast · ไม่เปิด Telegram · ไม่แตะ Pro · ไม่แตะสิทธิ์/บัญชีลูกค้า · ไม่แก้ `.env` (key เดิม `TELEGRAM_CONFIG_DB_KEY` ใช้กับ role ใหม่ได้ผ่าน GRANT ใน 067)

**สภาพก่อนทำ (ตรวจ read-only 14 ต.ค.):** staging code `b1f1ea7` (working tree clean) · mirror มี `7a5906e` · DB: `new_customer_trial = {enabled:true, limit:2, eligible_since: 2026-09-26 09:07:59.727219+00}` · ไม่มี key `free_policy` / ตาราง schedule / role free_policy_admin / trigger บน app_settings · app_users 7 (2 บัญชีหลัง cutoff) · free jobs 24 ชม. = 0 · health 200 · 6 containers Up · preflight 067 = 16 แถว f ตามคาด (2 แถว t: switches consistent, no pending)

**คาดหลัง apply:** โหมดที่มีผล = new_customer **เท่าเดิม** · `free_policy.daily_enabled = false` · eligible_since ไม่เปลี่ยน · `new_customer_trial_status(null)` ได้ `{enabled:true, mode:"new_customer", daily_enabled:false, eligible_since: เดิม, limit:2 …}`

### ขั้นตอน (ทำทีละขั้น หยุดทันทีเมื่อผิดคาด)
1. **บันทึกสภาพก่อน** → `/root/backup-ops-20261002/free-policy-067-<ts>/`: `pg_dump --schema-only` + `COPY app_settings` (ทั้งตาราง) + output `new_customer_trial_status(null)` + preflight ก่อน + md5 ก่อน + `git rev-parse HEAD` + `docker ps`
2. **preflight ก่อน** (ไฟล์จาก `7a5906e` ส่งผ่าน stdin, READ-ONLY) — ต้องตรงกับข้อสภาพก่อนทำ
3. **apply `sql/067`** จากไฟล์ `7a5906e` (sha256 บันทึกไว้) ด้วย `sudo -u postgres psql -d ener_scan_staging -v ON_ERROR_STOP=1 -1` (ไฟล์มี BEGIN/COMMIT อยู่แล้ว) → ล้ม = ไม่มีอะไรเปลี่ยน (ทรานแซกชันเดียว)
4. **preflight หลัง** → 067 ทุกแถว **t** (18 แถว) และแถวเดิม 057–066 ไม่เปลี่ยน
5. **md5 หลัง** → 31/31 OK (`verify-migration-versions.sh` จากไฟล์ `7a5906e`)
6. **ยืนยันโหมด/cutoff ไม่เปลี่ยน**: `free_policy_mode_now()` mode=new_customer, eligible_since เดิม · `new_customer_trial_status('<uid กบ>')` eligible/used เท่าก่อน · `app_settings.new_customer_trial` ค่าเดิม · ลอง `SET ROLE web_anon; UPDATE app_settings … free_policy` ใน `BEGIN … ROLLBACK` → ต้อง `free_policy_protected` (ไม่เขียนจริง)
7. **deploy โค้ด** `bash /root/deploy-ener.sh staging` (pull จาก origin → ต้องได้ `7a5906e`; ถ้า origin ไม่ถึง ใช้ mirror ตามขั้นตอนเดิม) → blue-green ตาม script
8. **ตรวจหลัง deploy**: health 200 · `git rev-parse HEAD` = 7a5906e · 6 containers Up · log worker-maintenance ภายใน 2 นาที มี `FREE_POLICY_SCHEDULE_APPLIED` **ไม่ควรมี** (ไม่มี schedule) และ **ไม่มี** `FREE_POLICY_APPLY_SKIPPED`/`FREE_POLICY_APPLY_ERROR` (key พร้อม) · `/admin/free-policy` (กบ login) แสดง "โหมดที่มีผลตอนนี้: ลูกค้าใหม่ทดลองฟรี 2 ครั้ง", cutoff 26 ก.ย. 2026 16:07 น., ไม่มีกำหนดการ, ประวัติว่าง, ปุ่มบันทึกเปิด (key พร้อม) — **ยังไม่กดบันทึก** · `/admin/free-trial` → 302 ไปหน้าใหม่ · LIFF/LINE ของบัญชีทดสอบกบ: สิทธิ์เท่าเดิม (trial ไม่ eligible เพราะสร้างก่อน cutoff → ข้อความ "เติมสิทธิ์เพื่อสแกนองค์ใหม่" เท่าเดิม)
9. **รายงาน** exact SHA/hash, preflight ก่อน-หลัง, md5, ค่าโหมด/cutoff ก่อน-หลัง, health, log worker

### Rollback
- โค้ด: `deploy-ener.sh staging` ที่ `b1f1ea7` (โค้ดเก่าอ่าน `enabled=true` → new_customer เท่าเดิม; ไม่มีใครอยู่โหมด none จึงย้อนได้ปลอดภัย)
- DB: **067 คงไว้ ห้าม DROP** — ไม่มีอะไรต้องย้อนเพราะ effective mode ไม่เปลี่ยน · ถ้าจำเป็นจริง: ย้อน `.env`/โค้ดก่อน แล้วค่อยพิจารณาปิด trigger (เป็น owner postgres) ภายใต้การอนุมัติแยก

### ผลการทำ §10 — staging 14 ต.ค. 2026 (กบอนุมัติ 04:45Z) ✅
- backup: `/root/backup-ops-20261002/free-policy-067-20261014-044602/` (schema-before.sql, app_settings-before.jsonl 10 แถว, สิทธิ์ 7 บัญชี, trial-status ก่อน/หลัง, preflight ก่อน/หลัง, apply log, md5-after, deploy log, docker ps, worker log)
- preflight ก่อน: 067 f 16 / t 2 ตามคาด แถวเดิมทั้งหมด t → **apply sql/067 จาก `7a5906e`** (sha256 `85f47da7…c09eed`) exit 0 ทรานแซกชันเดียว 04:46:37Z → preflight หลัง: **067 t 18/18**, แถวเดิมเหมือนเดิมทุกแถว → **md5 31/31 OK** (reference จาก 7a5906e)
- โหมด/cutoff/สิทธิ์ **ไม่เปลี่ยน**: mode_now = new_customer (stored = new_customer, daily_enabled=false, due=null) · eligible_since 2026-09-26 09:07:59.727219+00 · status(null)/status(กบ) ค่าเดิม (+ field mode/daily_enabled) · สิทธิ์ 7 บัญชี diff ว่าง · schedule 0 · audit 0 · guard prosecdef=false · ทดสอบ web_anon + GUC UPDATE free_policy ใน ROLLBACK → `free_policy_protected` ค่าไม่เปลี่ยน
- deploy: `deploy-ener.sh staging` exit 0 blue-green ครบ → HEAD `41e40b8` (docs-only บน `7a5906e`; `git diff 7a5906e HEAD -- ':!docs'` ว่าง) · md5 ไฟล์ runtime ในคอนเทนเนอร์ 5 ไฟล์ = 7a5906e · health 200 · 6 containers Up
- หลัง deploy 2.5 นาที: worker-maintenance ไม่มี FREE_POLICY_* event (ไม่มี schedule; key พร้อมจึงไม่มี SKIPPED/ERROR) · error 0 ทั้ง app/worker · `/admin/free-policy`, `/admin/free-trial` ไม่ login → 302 login · POST ไม่ session → 302
- **ค้างกบ:** เปิด https://test.my-ener.uk/admin/free-policy ดูอย่างเดียว (ยังไม่กดบันทึก/ตั้งเวลา) · ไม่เปลี่ยนโหมด ไม่ broadcast ไม่เปิด Telegram ไม่แตะ Pro
- rollback โค้ด: `deploy-ener.sh staging` ที่ `b1f1ea7` ปลอดภัย (โหมดมีผลไม่เปลี่ยน) · 067 คงไว้
