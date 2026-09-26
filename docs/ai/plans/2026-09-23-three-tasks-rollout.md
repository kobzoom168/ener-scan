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

**หลักฐานรอบ Codex local:** ดู `2026-09-23-codex-approval-hardening.md`. **063 apply บน staging แล้ว (26 ก.ย.)** — `pg_proc` เหลือ overload เดียว `(uuid,text,text,text,numeric,text,integer,timestamptz,boolean,jsonb)`. Pro ยังไม่ apply. nginx snippet ยังไม่ติดตั้งบนเครื่องจริง (`nginx -T` ไม่มี `ener_private`).

## อัปเดต 26 ก.ย. 2026 — LIFF ใช้ authority เดียวกับด่านรับรูป (`90827a8`)
- staging = `90827a8` (runtime hash `liff.routes.js`/`paymentAccess.service.js` ตรง) · Pro = `be67a98` ไม่แตะ
- `resolveLiffRights()` ถอดยอดจาก `checkScanAccess` ล้วน · รักษา 0 · อ่านล้ม → `unavailable` ("ตรวจสอบสิทธิ์ไม่ได้ กรุณาลองใหม่") · แยก ค่าครู/ทดลอง|ฟรี/โบนัส
- rollback งานนี้: ย้อนโค้ดเป็น `27fdff4` ได้ทันที ไม่มี migration/config ใหม่ (การ์ดสถิติจะกลับมี fallback `2` อีก)
- **หลักฐานลำดับด่านรูป (อ่านโค้ด):** `lineWebhook.js` `checkScanAccess({consumeBonus:true})` → ถ้า `payment_required` เลือก path `payment_gate` ก่อนสร้าง `scan_jobs` · AI ถูกเรียกเฉพาะใน `scanWorker` หลัง `claimNextScanJob` → **ครั้งที่ 3 ถูกกันก่อน vision AI เสมอ** · trigger 057 บน INSERT `scan_jobs` เป็นด่านสองใต้ row lock
- **semantics การนับ trial (sql/057 `new_customer_trial_used`):** นับเฉพาะ `access_source='free'` · ไม่นับ `bonus` · ไม่นับ `status='failed'` (รูปไม่ชัด/ไม่ใช่วัตถุ → `failJob` = failed) · ไม่นับงานที่ส่งผลแบบ `skipQuotaDecrement=true` (รูปซ้ำ sha256/phash) · concurrent slot สุดท้าย serialize ด้วย `FOR UPDATE` — ทั้งหมดพิสูจน์ใน `scripts/ops/test-new-customer-trial-db.mjs` (PASS 26 ก.ย.)

## อัปเดต 26 ก.ย. 2026 (รอบ 2) — lifecycle โบนัส: จอง/ใช้/คืน ผูกกับ scan_jobs (sql/064)
**บั๊กที่พบ (พิสูจน์แล้ว บัญชีกบ staging):** snapshot ต้นเทิร์นเรียก `checkScanAccess` แบบไม่หัก แล้วด่านรับรูปหยิบจาก turnCache → งาน 2 งานเป็น `bonus` แต่ `bonus_scans` ยัง 1 · Pro มี path เดียวกันแต่ **ไม่มีลูกค้าถูกกระทบ** (`bonus_scans>0` = 0 บัญชี, `referral_redemptions` = 0 แถว, ไม่เคยแจกโบนัส)

**กติกาใหม่ (ทุกโหมด ไม่ขึ้นกับ trial):** ดู/LIFF = ไม่แตะ `bonus_scans` · จอง = INSERT `scan_jobs` (`free_access_kind='bonus'`) หัก −1 ใต้ `FOR UPDATE` ทรานแซกชันเดียวกัน (trigger `guard_new_customer_trial_job` ขยายจาก 057) · ใช้ = งานส่งผล (kind คง `bonus`) · คืน = ครั้งเดียว `bonus` → `bonus_released` (+1) เมื่อ status→failed (trigger) หรือมีหลักฐานรูปซ้ำ (outbound `scan_result` `skipQuotaDecrement=true` → RPC `release_bonus_reservation`, worker เรียกทันที + maintenance `sweep_bonus_releases` กวาดกรณี crash) · retry failed→active ของงานที่คืนแล้ว = จองใหม่ · webhook ซ้ำ = `uq_scan_uploads_line_message` เดิม · DB กันตอนจอง → ingestion คืน `quota_exhausted_at_insert` + ลบ upload กำพร้า → webhook ตอบ paywall เดิม (AI=0) · `new_customer_trial_used` ไม่นับ `bonus%`

**ค่าใน `free_access_kind` (Codex รอบ 2 — แยกงานที่จองจริงจาก legacy):** `bonus` = legacy ของโค้ดเก่า (trigger ไม่จอง ไม่คืน ไม่แตะ — งาน 2 งานของกบวันที่ 26 ก.ย. อยู่กลุ่มนี้) · `bonus_reserved` = โค้ดใหม่ขอจอง หัก −1 ที่ INSERT (ตัวเดียวที่คืนได้) · `bonus_released` = คืนแล้ว · retry failed→active ของ `bonus_released` = จองใหม่

**ช่วงโค้ดเก่า/ใหม่ปนกัน (พิสูจน์ใน integration T7–T9):**
- โค้ดเก่า + 064: เก่าเขียน `bonus` → trigger ผ่านเฉย ๆ → ถ้าเก่าหักที่ webhook (0af41f5) = หักครั้งเดียว ไม่ซ้ำ · ถ้าเก่าไม่หัก (27fdff4/Pro) = บั๊กเดิมคงอยู่ ไม่แย่ลง
- rollback โค้ดโดยคง 064: ผลเดียวกับข้างบน = **ปลอดภัย** ไม่ต้องย้อน DB
- โค้ดใหม่ + DB มีแค่ 057 (ยังไม่ apply 064): เขียน `bonus_reserved` → 057 ไม่รู้จัก → ไม่หัก ไม่พัง (บั๊กเดิม) · RPC release/sweep log error เฉย ๆ · **แต่ถ้า trial ON บน 057 จะนับ `bonus_reserved` เป็น trial usage → ต้อง apply 064 ก่อนเปิด trial เสมอ**
- legacy `bonus` ที่เปลี่ยนเป็น failed ทีหลัง / มี outbound รูปซ้ำ / ถูก release/sweep → **ไม่ได้เงินคืน** (T7)

**Migration:** `sql/064_bonus_reservation.sql` (idempotent, ไม่เพิ่ม schema — ใช้ค่าใหม่ในคอลัมน์ text เดิม) · apply **ก่อน** deploy โค้ด (โค้ดใหม่เรียก RPC ที่ 064 สร้าง; โค้ดเก่าบน 064 ก็ทำงานได้ — trigger จองแทน webhook) · ไม่ backfill · งาน `bonus` เดิม 2 งานของกบ (delivered) ไม่ถูกแตะ (dry-run sweep = 0)

**คืนโบนัสอยู่ใน DB ทั้งหมด (Codex รอบ 3):** การคืนเกิดจาก trigger 2 ตัว ไม่พึ่งรุ่นโค้ด — (ก) `scan_jobs` status→failed · (ข) `outbound_messages` INSERT/UPDATE payload ที่เป็น `scan_result` + `skipQuotaDecrement=true` → `release_bonus_reservation(related_job_id)` · ทั้งสองคืนเฉพาะ `bonus_reserved` ที่มีหลักฐาน · worker ใหม่เรียก RPC ซ้ำ + maintenance sweep = สำรอง (idempotent) · **พิสูจน์ T10:** โค้ดใหม่จอง → `processScanJob`/`failJob` จริงของ `be67a98` (git worktree exact SHA, ยืนยันว่าไม่มี `releaseBonusReservation`) พบรูปซ้ำ/ล้ม → คืนครั้งเดียว, RPC/sweep/แก้ payload ซ้ำไม่คืนเพิ่ม, งานสำเร็จเดิมไม่ถูกคืน

**Reservation ค้างหลัง rollback — วิธีจัดการ (ไม่คืนเหมา):** กรณีที่ trigger ไม่ครอบคือ `bonus_reserved` ที่ไม่ล้มและไม่มีหลักฐานรูปซ้ำ = งานที่กำลัง/ทำเสร็จตามปกติ → **ถือว่าใช้โบนัสถูกต้อง ไม่คืน** · ตรวจค้างด้วย query read-only:
`SELECT id,status,created_at FROM scan_jobs WHERE free_access_kind='bonus_reserved' AND status NOT IN ('completed','delivery_queued','delivered','failed') AND created_at < now()-interval '1 hour';`
ถ้ามีแถว = งานติดคิว (ไม่ใช่ปัญหาโบนัส) → แก้คิวตาม runbook เดิม เมื่อจบเป็น failed trigger คืนเอง · ห้าม `UPDATE app_users SET bonus_scans=…` มือ · ห้ามเรียก release กับงานที่ไม่มีหลักฐาน (RPC ปฏิเสธ `no_evidence` อยู่แล้ว)

**ลำดับ migration ชุดรวมสำหรับ Pro (Pro ยังไม่มี 057 — ห้าม apply 064 เดี่ยว):**
1. preflight read-only `scripts/ops/preflight-three-tasks-migrations.sql` → แถว `prereq` ต้อง `t` ครบ (ตรวจ 26 ก.ย.: Pro prereq ครบ 18/18, `applied` 057–064 = f ทั้งหมด)
2. `057` → `061` → `062` (ตรวจ approve_notify ไม่ซ้ำก่อน — อยู่ใน preflight) → `063` → `064` · แต่ละไฟล์ `psql -v ON_ERROR_STOP=1` แยกกัน หยุดทันทีเมื่อ error
3. `NOTIFY pgrst, 'reload schema'` → preflight ซ้ำ แถว `applied` ต้อง `t` ครบ
4. deploy โค้ด → ตรวจ runtime hash ทุกคอนเทนเนอร์
5. ถ้า 064 apply ไม่ผ่านแต่ 057 ผ่าน: **ห้ามเปิด trial** (057 เดี่ยวนับ `bonus_reserved` เป็น trial usage — T9) และห้าม deploy โค้ดใหม่จนกว่า 064 ผ่าน

**Rollback 064:** ย้อนโค้ดอย่างเดียว คง 064 ไว้ = ปลอดภัย (T8 โค้ดเก่าสร้างงานใหม่ + T10 worker เก่าทำงานที่จองไว้แล้ว) และเป็นทางที่แนะนำ · ถ้าจำเป็นต้องย้อน DB จริง: re-apply `sql/057` ส่วน trigger + `new_customer_trial_used` แล้ว `DROP FUNCTION release_bonus_reservation(uuid), sweep_bonus_releases(integer)` — ก่อนนั้นต้องแน่ใจว่า trial OFF หรือ UPDATE แถว `bonus_reserved`/`bonus_released` → `bonus` (057 ไม่รู้จักค่าเหล่านี้จะนับเป็น trial usage) · **ห้ามย้อนเป็นการหักที่ webhook** (0af41f5 — เสียโบนัสเมื่อรูปซ้ำ/ล้ม Codex ปฏิเสธ)

**แผนทดสอบสดโบนัส (แก้ตาม Codex — ใช้บัญชี/ข้อมูลสังเคราะห์บน staging, ไม่แตะยอดกบ):**
- A. โบนัส 1 → รูปใหม่สำเร็จ → 0 · ส่งรูปเดิมซ้ำตอนยอด 0 → ถูกกันด้วย paywall ที่ด่านสิทธิ์ (ไม่มีงาน ไม่คืน) ยอดคง 0 — **ห้ามงอกกลับ**
- B. มีผลสแกนรูป X อยู่แล้ว + โบนัส 1 → ส่งรูป X ซ้ำ → จอง (0) → worker พบรูปซ้ำ → คืน **เฉพาะการจองใหม่นั้น** → กลับเป็น 1 (ก่อน=หลัง=1) · งานเดิมที่ใช้สำเร็จไม่ถูกแตะ
- C. LINE ส่ง webhook messageId เดิมซ้ำ → ไม่มีงานใหม่ ไม่หัก ไม่คืน
(ทั้งสามมี automated เทียบเท่าใน integration T1/T3b/T2 แล้ว — เทสต์สดรอกบเคาะ)

**ผลกระทบ Pro (ตามหลักฐานที่ตรวจ):** ผู้เขียน `bonus_scans` ในโค้ดมีแหล่งเดียวคือ `referral.service.js` (+1 เมื่อ redeem) — ไม่มีเส้นทาง admin · Pro: `referral_redemptions` = 0 แถว, `bonus_scans>0` = 0 บัญชี ณ ปัจจุบัน · ไม่มี ledger ประวัติโบนัส จึง**ตัดการเติมด้วยมือ (psql) ในอดีตไม่ได้** → สรุปได้แค่ "**ยังไม่พบผู้ได้รับผลกระทบจากข้อมูลที่ตรวจ**"

**หลักฐาน:** `scripts/ops/test-bonus-reservation-integration.mjs` — Postgres 16 + PostgREST จริง (container ใช้แล้วทิ้ง) ขับผ่าน `checkScanAccess` / `ingestScanImageAsyncV2` / `processScanJob` (sha256 dedup) / `failJob` / RPC จริง; ปลอมเฉพาะ S3 + thumbnail ผ่าน `--import` hook · 12 สถานการณ์ PASS (worker เก่า be67a98 กับงานที่จองแล้ว 10 · ดู 0 · สำเร็จ+ซ้ำตอน 0 ไม่งอก 1 · inbound ซ้ำ 2 · ล้ม 3a · รูปซ้ำคืนเฉพาะการจองใหม่ 3b · concurrent 4 · INSERT abort ใน tx เดียว + DB คืนเองจากหลักฐาน 5 · legacy ไม่คืน 7 · โค้ดเก่าบน 064 ไม่หักซ้ำ 8 · โค้ดใหม่บน 057 ไม่พัง 9 · trial ON 6) · `test-new-customer-trial-db.mjs` PASS บน 057+064 · unit `tests/bonusConsume.behavior.test.js` 4/4 · gate ✅

## อัปเดต 26 ก.ย. 2026 (รอบ 4) — ข้อความเรื่องสิทธิ์ชุดเดียวทั้งระบบ (`85e7ad7`+)
โมดูลกลาง `src/services/entitlementCopy.service.js` · LINE/LIFF เลือกข้อความจากสถานะสิทธิ์เดียวกัน · โหมด daily คงเดิมเมื่อ trial ปิด · รายละเอียดก่อน→หลัง + รายการนอก repo: `docs/ai/reports/2026-09-26-entitlement-copy-audit.md` · **ยังไม่มี migration/config ใหม่** — rollback = ย้อนโค้ด · เทสต์สด: ต้องเห็น 2 โหมด → โหมด daily ดูได้ทันทีบน staging (บัญชีกบ) · โหมด new_customer ต้องเปิดสวิตช์ชั่วคราว (รวมกับ acceptance trial 9 ขั้น)

### รายการเทสต์สดบน staging ที่ต้องให้กบทำ (ยังไม่เปิดสวิตช์ — ต้องขออนุมัติก่อนทุกครั้ง)
เงื่อนไข: เปิดสวิตช์ชั่วคราวเฉพาะช่วงเทสต์ · บัญชีทดสอบต้องมี `created_at` ≥ `eligible_since` จริง (ไม่แก้ค่าลูกค้า) · จบแล้วปิด OFF โดย **ไม่ล้าง `eligible_since` และไม่ลบ scan_jobs**
1. ก่อนเปิด: LIFF ของบัญชีใหม่แสดง "ทดลอง 2 ครั้ง" ไม่ได้ (สวิตช์ OFF = ฟรีรายวันตามเดิม) — ถ่ายภาพ
2. เปิดสวิตช์ (Admin, ยืนยัน 2 ชั้น) → LIFF แสดง "ทดลอง 2 ครั้ง" · ห้ามมีคำว่า "พรุ่งนี้"
3. สแกนรูปพระ #1 สำเร็จ → LIFF "ทดลอง 1 ครั้ง" · ตรวจ `scan_jobs.free_access_kind='trial'`
4. ส่ง **รูปเดิมซ้ำ** → ได้ลิงก์ผลเดิม · LIFF ยังคง 1 · `skipQuotaDecrement=true` ใน outbound
5. ส่ง **รูปไม่ชัด/ไม่ใช่พระ** → job failed · LIFF ยังคง 1
6. สแกนรูปพระ #2 สำเร็จ → LIFF "สิทธิ์ทดลองใช้ครบแล้ว"
7. ส่งรูปพระ #3 → ถูกกันด้วยข้อความจ่าย · **ไม่มี** `scan_jobs` ใหม่ · **ไม่มี** AI call (ตรวจ log worker = 0)
8. ข้ามเที่ยงคืน (หรือจำลองด้วย `now`) → ยังกัน ไม่รีเซ็ต
9. ปิดสวิตช์ → บัญชีใหม่กลับเป็นฟรีรายวัน · `eligible_since` คงเดิม


## สิ่งที่ยังไม่ได้ทำ (ต้องมีอนุมัติแยก)
- ประกาศล่วงหน้า 7 วันของงาน 1 (ยังไม่ร่าง ยังไม่ส่ง)
- รายชื่อ Telegram user id ผู้อนุมัติ + `setWebhook` + ส่งสลิปจริงใบแรก
- live smoke ที่ต้องใช้บัญชีกบ (รายการอยู่ท้ายรายงาน)
