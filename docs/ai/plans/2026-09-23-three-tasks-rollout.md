# Rollout / Rollback — 3 งานบน staging (23 ก.ย. 2026)

ฐาน: **Pro HEAD `be67a98185e3b2b2379303b919c69b5c37632cde`** (ชุด optout ที่ LIVE อยู่)
branch: `release/three-tasks` · **ยังไม่ deploy Pro · ไม่ broadcast · ไม่เปิดนโยบายจริง**

| งาน | commit | สวิตช์ | สถานะสวิตช์ |
|---|---|---|---|
| 1 ลูกค้าใหม่ฟรีรวม 2 ครั้ง | `d8dcd41` | `app_settings.new_customer_trial.enabled` (Admin UI `/admin/free-trial`) | **staging ปัจจุบัน: ON** (`eligible_since = 2026-09-26 09:07:59Z` — กบเปิด 26 ก.ย.) · **Pro เมื่อ apply 057: ต้องเป็น OFF · `eligible_since = null`** (ค่าเริ่มต้นใน migration; เปิดครั้งแรกหลังประกาศ ≥72 ชม. และกบอนุมัติ) |
| 2 ปลดล็อกคลัง/รายงานย้อนหลัง | `845c4ec` | **ไม่มีสวิตช์ — กติกาถาวร** | ผลทันทีเมื่อ deploy |
| 3 อนุมัติสลิปผ่าน Telegram | `e414938` | `TELEGRAM_SLIP_APPROVAL_ENABLED` + 4 ตัวประกอบ | **ปิด** (ยังไม่มีรายชื่อผู้อนุมัติ) |

## Migration ที่ต้อง apply (ตามลำดับ ก่อน deploy โค้ดเสมอ): 057 → 061 → 062 → 063 → 064 → 065
| ไฟล์ | งาน | หมายเหตุ |
|---|---|---|
| `sql/057_new_customer_trial.sql` | 1 | idempotent · ไม่ backfill · policy เริ่มต้น OFF |
| `sql/061_telegram_slip_approval.sql` | 3 | idempotent · ตาราง token/audit ถูก REVOKE จาก web_anon เข้าได้ผ่าน RPC เท่านั้น |
| `sql/062_atomic_payment_approval.sql` | 3 | atomic grant/audit + durable notification intent |
| `sql/063_payment_approval_snapshot.sql` | 3 | mandatory calculation snapshot + evidence-backed notification stamp; removes unsafe old RPC overload |
| `sql/064_bonus_reservation.sql` | 1 (+โบนัสทุกโหมด) | idempotent · ไม่เพิ่ม schema (ค่าใหม่ใน `free_access_kind`) · จอง/คืนโบนัสใน DB + trigger หลักฐานรูปซ้ำ · **ต้อง apply ก่อนเปิด trial เสมอ** (057 เดี่ยวนับ `bonus_reserved` เป็น trial) |
| `sql/065_trial_dedup_evidence.sql` | 1 | idempotent · ฟังก์ชันเดียว (`new_customer_trial_used` ไม่ขึ้นกับ delivery status) · apply หลัง 064 · **rollback กลับ 064 ลดสิทธิ์คงเหลือได้** (ดูหัวข้อ 1 ต.ค.) |
(งาน 2 **ไม่มี migration** — เป็นการถอดเงื่อนไขในโค้ดล้วน)

`058/059/060` (optout) ขึ้น Pro ไปแล้ว ไม่ต้องทำซ้ำ

## Config ใหม่ (งาน 3 — ยังไม่ตั้งค่าใด ๆ)
ต้องครบทุกตัวจึงเปิด ขาดตัวใดตัวหนึ่ง = ปิดไว้ และ endpoint ตอบ 404 เหมือนไม่มี
- `TELEGRAM_SLIP_APPROVAL_ENABLED` (ค่าเริ่มต้นว่าง = ปิด)
- `TELEGRAM_APPROVER_USER_IDS` — **ยังไม่มี รอกบให้รายการ user id**
- `TELEGRAM_WEBHOOK_SECRET` — ตั้งคู่กับ `setWebhook`
- `TELEGRAM_APPROVAL_BOT_TOKEN` / `TELEGRAM_APPROVAL_CHAT_ID` — bot แยกสำหรับ approval ไม่มี fallback ไป bot แจ้งเตือนกลาง; staging ต้องคนละ bot กับ Pro

## ลำดับ rollout (เมื่อได้อนุมัติ)
1. เมื่อได้ GO Pro เท่านั้น: apply `057` → `061` → `062` → `063` → `064` → `065` (ครบทั้งหกก่อน deploy โค้ด · preflight ก่อน/หลัง + verify md5) แล้วตรวจ privileges/constraint ก่อนแตะโค้ด (ห้ามรัน 062 เดี่ยวหลัง 063 เพราะจะสร้าง RPC overload เก่าคืน)
2. deploy exact SHA แล้วตรวจ runtime hash ทุกคอนเทนเนอร์
3. **งาน 2 มีผลทันที** — ตรวจว่าลูกค้าที่ไม่เคยจ่ายเปิดคลังตัวเองได้ และยังเห็นของคนอื่นไม่ได้
4. งาน 1: **ประกาศล่วงหน้าอย่างน้อย 3 วัน (72 ชม.)** (กบเปลี่ยนจาก 7 วัน 30 ก.ย. 2026 — ร่าง `docs/ai/drafts/2026-09-30-trial-policy-3day-notice.md`) แล้วจึงเปิดสวิตช์หลังครบกำหนดตามที่กบอนุมัติ (การเปิดครั้งแรกตั้ง `eligible_since` ถาวร) · ลำดับ: ทดสอบผ่าน → อนุมัติ deploy Pro (migration 057→061→062→063→064→065 ก่อนโค้ด) → ส่งประกาศ → รอ ≥72 ชม. → อนุมัติเปิดนโยบาย
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

**ลำดับ migration ชุดรวมสำหรับ Pro (Pro ยังไม่มี 057 — ห้าม apply 064/065 เดี่ยว):**
1. preflight read-only `scripts/ops/preflight-three-tasks-migrations.sql` → แถว `prereq` ต้อง `t` ครบ (ตรวจ 26 ก.ย.: Pro prereq ครบ 18/18, `applied` 057–064 = f ทั้งหมด)
2. `057` → `061` → `062` (ตรวจ approve_notify ไม่ซ้ำก่อน — อยู่ใน preflight) → `063` → `064` → `065` · แต่ละไฟล์ `psql -v ON_ERROR_STOP=1` แยกกัน หยุดทันทีที่ล้ม · ครบทั้งหกก่อน deploy โค้ดทีเมื่อ error
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

## อัปเดต 26 ก.ย. 2026 (รอบ 5) — ปลดคลังเจ้าของครบทุกเลน (`2212c34`, `cdfeab6`)
viewerRole owner/guest แทน memberAccess · guest ไม่ได้ข้อมูลคลัง + ยืนยันผ่าน LINE (`POST /api/liff/owner-session`, LIFF `view=owner`) · ถอด paywall ดูของเดิมทุก template + LINE (ranking gate / ชิ้นเด่น / daily pick) · ไม่มี migration/config ใหม่ (ใช้ `LIFF_ID` เดิม) · rollback = ย้อนโค้ด · หลักฐาน+ก่อน/หลัง: `docs/ai/reports/2026-09-26-entitlement-copy-audit.md` ส่วนท้าย

**หมายเหตุสถานะ staging 26 ก.ย. 09:08Z:** `new_customer_trial.enabled` ถูกเปิดผ่านหน้า `/admin/free-trial` (Windows browser — ไม่ใช่จาก Claude) · `eligible_since = 2026-09-26 09:07:59Z` ถูกตั้งถาวรแล้ว · staging จึงอยู่โหมด new_customer ตั้งแต่นั้น (ภาพ LIFF 16:15 "แพ็กสแกนหมดอายุแล้ว" = ข้อความโหมดใหม่ที่ถูกต้อง)

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


## อัปเดต 30 ก.ย. 2026 — acceptance trial ลูกค้าใหม่ด้วยบัญชีสังเคราะห์ (Codex: กบไม่มีบัญชี LINE ใหม่)
staging มี app_users 5 บัญชี ทั้งหมด `created_at` ก่อน cutoff → ทดสอบ "ลูกค้าใหม่" ผ่าน LINE จริงไม่ได้ · ใช้ harness เดิม `scripts/ops/test-bonus-reservation-integration.mjs` (Postgres 16 + PostgREST ใช้แล้วทิ้ง · 057+064 จริง · โค้ด release จริง: `checkScanAccess` → `ingestScanImageAsyncV2` → trigger → `processScanJob`/`failJob` · S3/thumbnail ปลอมผ่าน loader hook · **spy `globalThis.fetch`: ทุก request ที่ไม่ใช่ 127.0.0.1 = การเรียก AI/LINE ต้องเป็น 0**) เพิ่มบล็อก trial ON T11–T17 (ไม่แตะ T0–T10 ที่ Codex รับแล้ว) · ผล **19/19 PASS**

| ขั้นในรายการเทสต์สด | ครอบโดย | ผล |
|---|---|---|
| 1–2 บัญชีใหม่เห็น "ทดลอง 2 ครั้ง" ไม่มีคำว่าพรุ่งนี้ · LIFF = ด่านรับรูป | T12 (`resolveLiffRights` + `buildEntitlementStatusLine` + `buildPaywallCopy` + `buildPaymentGateReply` ผ่าน `findForbiddenPhrase`) · unit `liffRights.consistency`, `entitlementCopy.behavior` | PASS (สังเคราะห์) |
| บัญชีเก่าไม่ได้ฟรีรายวัน + snapshot สิทธิ์ยุค daily หลุดมาถึงด่านรับรูป → DB กัน `trial_not_eligible` ไม่มีงาน ไม่มี upload ค้าง | T11 | PASS (สังเคราะห์) · บัญชีกบจริงบน staging: `new_customer_trial_status` → `eligible:false` (30 ก.ย.) |
| 3 สแกน #1 → kind `trial` → เหลือ 1 · 6 สแกน #2 → "ครบ 2 ครั้ง" | T12 | PASS (สังเคราะห์) |
| 4 รูปเดิมซ้ำ → `skipQuotaDecrement=true` ไม่กินสิทธิ์ · inbound ซ้ำ (message id เดิม) งานเดียว | T14 (`processScanJob` จริง → sha256 dedup) | PASS (สังเคราะห์) — **หมายเหตุ:** ช่องทดลองถูกถือไว้จน outbound รูปซ้ำ `status='sent'` (กติกา 057) แล้วจึงคืน |
| 5 งานล้ม → คืนช่อง 1 ครั้ง ล้มซ้ำไม่คืนซ้ำ · retry งานล้มหลังใช้ครบถูกกัน | T13 (`failJob` จริง) | PASS (สังเคราะห์) |
| 7 รูป #3 → ไม่มี `scan_jobs` ใหม่ · ไม่มี AI call | T12 (ทั้งด่านสิทธิ์ `access_denied` และ DB `trial_quota_exhausted` + ลบ upload กำพร้า) · T17 external fetch = 0 ตลอดบล็อก | PASS (สังเคราะห์) |
| ส่ง 3 รูปพร้อมกัน / webhook ซ้ำ ไม่ใช้เกินยอด | T15, T14, (DB-level `test-new-customer-trial-db.mjs` concurrent last slot) | PASS (สังเคราะห์) |
| paid/bonus ไม่เสียสิทธิ์ (แพ็กมาก่อน ไม่นับทดลอง · ทดลองครบแล้วโบนัสยังใช้ได้ จอง/คืนตาม 064) | T16 | PASS (สังเคราะห์) |
| 8 ข้ามเที่ยงคืนไม่รีเซ็ต · 9 ปิดสวิตช์ `eligible_since` คงเดิม | `test-new-customer-trial-db.mjs` (toggle persistence, delivered ไม่คืน) · unit `newCustomerTrial` (ignores daily offsets) | PASS (DB-level) |
| end-to-end ลูกค้าใหม่ผ่าน LINE จริง (webhook → reply จริง → LIFF จริง) | — | **NOT TESTED — ไม่มีบัญชี** |

ความเสี่ยงที่เหลือ (ไม่ได้แก้ — รอตัดสิน): (1) ไม่มีหลักฐาน LINE จริงว่า reply paywall ของครั้งที่ 3 ถูกส่งถึงมือถือ (โค้ดเส้นนั้น `sendFreeQuotaExhaustedPaywallViaGateway` ผ่าน unit `bonusConsume.behavior` เท่านั้น) (2) รูปซ้ำของบัญชีทดลอง: ถ้าข้อความรูปซ้ำส่งไม่สำเร็จถาวร (outbound `failed`/`dead`) ช่องทดลองจะไม่ถูกคืน (ต่างจากโบนัสที่คืนทันทีเมื่อมีหลักฐาน) — โอกาสต่ำ ต้องตัดสินว่าจะปรับ `new_customer_trial_used` ให้นับหลักฐานตั้งแต่ queued หรือไม่ (3) เทสต์สังเคราะห์ ≠ live: schema ใน fixture คือ snapshot ไม่ใช่ DB staging/Pro จริง (preflight + md5 ตรวจฟังก์ชันจริงแยกต่างหาก)

## อัปเดต 1 ต.ค. 2026 — เส้น LINE webhook จริง (router/handler) ด้วยบัญชีสังเคราะห์ + ข้อเสนอ patch trial รูปซ้ำ
**harness ใหม่ `scripts/ops/test-line-webhook-trial-integration.mjs`** (ระบบแยก: Postgres 16+pgvector ใช้ schema เต็มของ staging แบบไม่มีข้อมูล `fixtures/staging-schema-2026-10-01.sql` + 057 + 064 · PostgREST · express + `line.middleware` ตรวจลายเซ็นจริงด้วย secret ทดสอบ + `lineWebhookRouter` → `handleEvent`/`handleFollowEvent`/`handleImageMessage`/`finalizeAcceptedImage` → `checkScanAccess` → `ingestScanImageAsyncV2` → trigger) · ปลอมผ่าน `--import` hook: `@line/bot-sdk` Client (บันทึก reply/push · ส่งรูปจาก memory), `checkSingleObjectGated` (AI → single_supported, นับการเรียก), S3, thumbnail · **ไม่ยิงเข้า Pro/staging · ไม่เรียก LINE/AI จริง** (spy fetch: loading animation ตัดจบในเครื่อง)

| # | เส้นทางผ่าน router จริง | ผล |
|---|---|---|
| 0 | ลายเซ็นผิด → 401 ไม่สร้างผู้ใช้ · ลายเซ็นถูก → 200 ack-first | PASS |
| 1 | `follow` → `app_users` ถูกสร้างโดย handler (created_at ≥ eligible_since ตามธรรมชาติ, `new_customer_trial_status.eligible=true`) · welcome ไม่มีคำต้องห้ามโหมดลูกค้าใหม่ · วันเกิดใส่ตรง DB (`users.birthdate`) เป็นขั้นสังเคราะห์เดียว | PASS |
| 2 | รูป #1: ดาวน์โหลด → objectCheck (1 ครั้ง) → `scan_jobs` kind=`trial` · `checkScanAccess` เหลือ 1 · LINE ส่ง event เดิมซ้ำ (message id เดิม) → ไม่มีงานเพิ่ม | PASS |
| 3 | รูป #2 → งานที่ 2 · รูป #3 ขณะงาน 1–2 ยัง `queued` → ข้อความ "มีชิ้นก่อนหน้ารอผลอยู่…รอรับผลก่อน" ไม่ดาวน์โหลด ไม่เรียก AI ไม่มีงาน | PASS |
| 4 | ส่งมอบงาน 1–2 (จำลอง worker) → รูป #3 → Flex paywall "ใช้สิทธิ์ทดลองฟรีครบ 2 ครั้งแล้ว" ที่ `pre_object_check` (ก่อนดาวน์โหลด/AI) · ไม่มีงาน · `resolveLiffRights` = 0 (new_customer, trialEligible) · รูป #4 ยังกัน (paywall ซ้ำถูก suppress ตาม fatigue เดิม) | PASS |
| 5 | บัญชีเก่า (created_at −30 วัน สังเคราะห์) ส่งรูป → Flex "เติมสิทธิ์เพื่อสแกนองค์ใหม่" ไม่มีฟรีรายวัน ไม่ดาวน์โหลด ไม่เรียก AI | PASS |
| 6 | ตลอดชุด: ไม่มี fetch ออกนอกเครื่องยกเว้น loading ที่ตัดจบในเครื่อง (AI/LINE = 0) | PASS |

ข้อสังเกตจากการรัน (พฤติกรรมจริงของระบบ ไม่ใช่บั๊ก): burst window 8 วิ วัดจาก `event.timestamp` ของ LINE · รวม candidate 5 วิ · request-block 8 วิ หลังเทิร์น → harness ต้องเว้นจังหวะเหมือนคนส่งทีละรูป

**ยังไม่ใช่ live:** LINE platform จริง (ลายเซ็น/การส่ง/retry จริง), AI จริง, worker สแกน (จำลองการส่งมอบด้วย `updateScanJob`), หน้า LIFF จริงของบัญชีใหม่, การกรอกวันเกิดผ่านแชท

### `sql/065_trial_dedup_evidence.sql` — trial รูปซ้ำไม่เสียสิทธิ์แม้ส่งข้อความไม่สำเร็จ (Codex อนุมัติแนวทาง 1 ต.ค. · **apply บน staging แล้ว 1 ต.ค. 2026 06:23Z จาก `0ce874c` · Pro ยังไม่**)
**บันทึก apply staging (1 ต.ค. 06:22–06:24Z):** ไฟล์จาก `git show 0ce874c` sha256 ตรง local (`cbbcb243…`) · DB `ener_scan_staging` · preflight ก่อน: prereq 18/18 t, applied 057–064 t, 065 f · ผลต่างสด = **0 แถว** · `psql -v ON_ERROR_STOP=1` → BEGIN/CREATE FUNCTION/REVOKE/COMMIT/NOTIFY · md5 `new_customer_trial_used` 73e32701… → `cb5a32c3…` · preflight หลัง 065 = t, fn/trigger rows t ครบ · verify md5 **14/14 OK** · `new_customer_trial_used` ต่อบัญชี (5 บัญชี) **เท่าเดิมทุกค่า** · สวิตช์/cutoff ไม่เปลี่ยน · `/` และ `/health` 200 · PostgREST reload schema (38 RPCs) · ไม่มี error ใน app/postgrest log 5 นาทีหลัง apply · ไม่ deploy โค้ด ไม่แตะ Pro
เดิม `new_customer_trial_used` (057/064) ไม่นับงานที่มีหลักฐานรูปซ้ำเฉพาะเมื่อ outbound `status='sent'` → delivery ล้มถาวร/ค้าง queued = เสียช่องทดลอง · 065 ตัดเงื่อนไข `sent` ออก: ยึดหลักฐาน outbound `scan_result` + `skipQuotaDecrement=true` ที่ worker บันทึก (เซิร์ฟเวอร์เขียนเท่านั้น ไม่ใช่คำกล่าวอ้าง client) ไม่ว่าจะ queued/sent/failed · เป็นการนับ NOT EXISTS → idempotent ไม่มีคืนซ้ำ · งานสำเร็จปกติ (`skipQuotaDecrement=false`) ยังนับ · หลักฐานผูก `related_job_id` ของงานนั้น · คง exclusion `bonus%`/failed, SECURITY DEFINER, `search_path=public`, REVOKE FROM PUBLIC (ไม่มี grant ให้ web_anon เหมือน 057/064) · ไม่แตะ schema/ยอดลูกค้า · idempotent

**หลักฐาน (ระบบแยก, 1 ต.ค.):** harness โบนัส+trial `test-bonus-reservation-integration.mjs` 20/20 PASS บน 057→064→065 (T14: หลักฐาน queued → คืนทันที → ใช้ช่องได้ · **T14b**: crash หลังเขียนหลักฐาน / delivery failed ถาวร / retry failed→queued→sent / แถวหลักฐานซ้ำ → คืนครั้งเดียว · งานสำเร็จปกตินับ · kind อื่นไม่ใช่หลักฐาน · หลักฐานของผู้ใช้อื่นไม่คืนผิดงาน · concurrent ช่องสุดท้ายหลังคืน = งานเดียว) · harness LINE webhook 8/8 PASS (ข้อ 6: worker จริงพบรูปซ้ำ → หลักฐาน queued → สิทธิ์คืนทันที → รูปใหม่ได้งานผ่าน router) · `test-new-customer-trial-db.mjs` PASS (หลักฐาน sent/queued/failed ไม่นับ) · md5 `new_customer_trial_used` ใหม่ = `cb5a32c34c0e7d4dada2f2132cc9d5ab` ใน `migration-function-md5.reference.txt` · preflight เพิ่มแถว `065 trial_used ignores delivery status`

**ผลกระทบข้อมูลจริง (read-only 1 ต.ค. — ขอบเขตจำกัด ไม่ใช่ lifetime):** staging — งาน free ที่มีหลักฐานรูปซ้ำ (ทุกช่วงเวลา) 4 งาน ทั้งหมด `sent` → apply 065 ไม่เปลี่ยนยอดใคร · Pro — ตรวจเฉพาะหลักฐานรูปซ้ำ **30 วันล่าสุด** 7 แถว ทั้งหมด `sent` (Pro ยังไม่มี 057 จึงไม่มีผลต่อสิทธิ์ตอนนี้; ก่อน apply จริงให้รัน query ผลต่างด้านล่างทั้งช่วง)

**Rollback 065 → 064: มีผลต่อสิทธิ์** — งานรูปซ้ำที่หลักฐานยังไม่ `sent` (queued/failed) จะกลับมานับเป็นการใช้สิทธิ์ (ลดสิทธิ์คงเหลือของบัญชีนั้น) แม้ไม่ UPDATE ยอดใด ๆ · ก่อนย้อนต้องแสดงผลต่างและให้กบตัดสิน:
```sql
-- บัญชี/งานที่สิทธิ์จะเปลี่ยนถ้าย้อนกลับ 064 (read-only)
SELECT j.app_user_id, j.id AS job_id, o.status AS evidence_status
FROM scan_jobs j JOIN outbound_messages o ON o.related_job_id=j.id AND o.kind='scan_result' AND o.payload_json->>'skipQuotaDecrement'='true'
WHERE j.access_source='free' AND COALESCE(j.free_access_kind,'daily') NOT LIKE 'bonus%' AND j.status<>'failed'
  AND NOT EXISTS (SELECT 1 FROM outbound_messages s WHERE s.related_job_id=j.id AND s.kind='scan_result' AND s.status='sent' AND s.payload_json->>'skipQuotaDecrement'='true');
```
ย้อน = re-apply นิยาม `new_customer_trial_used` จาก `sql/064` (ไม่มี schema/ข้อมูลเปลี่ยน) แล้วอัปเดต md5 อ้างอิงกลับ `73e32701eab031e4c7c1163caca6342e`

**แผน apply staging (รออนุมัติ):** 1) `psql -d ener_scan_staging -f scripts/ops/preflight-three-tasks-migrations.sql` (คาด `065 … = false` ก่อน apply) → 2) รัน query ผลต่างข้างบน (คาด 0 แถว) → 3) `psql -d ener_scan_staging -v ON_ERROR_STOP=1 -f sql/065_trial_dedup_evidence.sql` → 4) preflight ซ้ำ (= true) + `verify-migration-versions.sh ener_scan_staging` (md5 ตรง 14/14) → 5) ไม่ต้อง deploy โค้ด (โค้ดไม่เปลี่ยน) · Pro: ลำดับ 057→061→062→063→064→065 ตามหัวข้อ migration

## สิ่งที่ยังไม่ได้ทำ (ต้องมีอนุมัติแยก)
- ประกาศล่วงหน้า 3 วันของงาน 1 (ร่างแล้ว ยังไม่ส่ง — เดิม 7 วัน เปลี่ยน 30 ก.ย.)
- งาน 3 Telegram approval: แผน `docs/ai/plans/2026-10-01-telegram-approval-staging-plan.md` (bot แยก · secret hex · config 5 ตัว `ENABLED=false` · recreate เฉพาะ `ener-scan` ผูก image ID + `--no-build --pull never --no-deps` · กักข้อความลูกค้าด้วย ban gate เดิม · "ปฏิเสธสลิปใน Telegram" ยังไม่มี) — **พบบั๊ก 1 ต.ค.: app.js ไม่มี JSON parser ก่อน router Telegram → ทุกปุ่มถูก ignored** แก้ใน router แล้ว (commit แยก) · harness `scripts/ops/test-telegram-approval-integration.mjs` 12/12 PASS · staging runtime `1094347` ยังไม่มี fix → ต้อง deploy staging (อนุมัติแยก) ก่อนเทสต์สด
- **nginx private-token masking** (snippet `ops/nginx/private-token-access-log.conf` + test script) — ยังไม่ apply · nginx แชร์กับ Pro ต้องอนุมัติแยก · อยู่ใน checklist ก่อน GO
- live smoke ที่ต้องใช้บัญชีกบ (รายการอยู่ท้ายรายงาน)
