# ชุดขออนุมัติ live ครั้งเดียว — Telegram อนุมัติสลิปบน **staging จริง** (config จาก DB) · 2 ต.ค. 2026

สถานะก่อนเริ่ม (ตรวจแล้ว 09:18Z): staging HEAD `197d1eb` (app = `b77e094`) · 066 apply แล้ว · config บันทึกแล้ว (`enabled=false`, chat `-5440947116`, approver Kob `7486743496`) · `POST /telegram/webhook` 404 · bot = `@ener_kob_approval_test_bot` (id 8780802561, is_bot, can_join_groups, privacy mode on) · webhook ปัจจุบัน **ว่าง** (pending_update_count 1 = /start เก่า) · outbound active = 0 · pending_verify = 0 · workers running
สิ่งที่พิสูจน์: "กบกดอนุมัติสองขั้นใน Telegram จริง → payment paid · grant ครั้งเดียว · audit · กดซ้ำไม่เติม · ข้อความลูกค้าอยู่ใน outbound แต่ไม่ถึง LINE" — บน staging จริง (DB/โค้ด/compose จริง) ไม่ใช่ระบบแยก
ไม่ใช่: GO Pro · ไม่แตะ Pro/bot กลาง · ไม่มีปฏิเสธสลิปผ่าน Telegram · ไม่ใช้ ban gate · ไม่ใช้ UID ปลอมหวังส่งไม่ผ่าน

## 0. สำรอง key (ทำแล้ว)
`/root/backup-ops-20261002/` (700): `staging.env.bak-2026-10-02-0918-with-keys` (600) + `telegram-config-keys.staging.env` (600, เฉพาะ 2 key) · sha256 ของ `TELEGRAM_CONFIG_KEY` ตรงกับที่ใช้จริง (`2bc5595d…`) · ไม่พิมพ์ค่า · แนะนำกบเก็บสำเนา key แบบออฟไลน์เพิ่ม (password manager) เพราะถ้า key หาย ciphertext ใน DB ถอดไม่ได้ (ต้องกรอก Token ใหม่ ไม่เสียอย่างอื่น)

## 1. วิธีกักข้อความ LINE ให้ส่งออกไม่ได้จริง — **สองชั้น** (แก้ตาม Codex: delivery อย่างเดียวไม่พอ)
ข้อเท็จจริง (ตรวจโค้ด baseline ที่ deploy `b77e094`): ในเส้นอนุมัติมี **2 ทาง** ที่ไปถึง LINE
1. **แถว `outbound_messages` (`approve_notify`)** → delivery worker push — กักด้วย **หยุด `worker-delivery`** ชั่วคราว (ก่อนหยุด outbound active ต้อง = 0; ตอนนี้ 0)
2. **push ตรงไม่ผ่าน delivery:** `enqueueApproveNotify` → `maybeOfferSpendUpgrade(lineUserId)` → (รอ 8 วิ) → `fetch https://api.line.me/v2/bot/message/push` — เข้าเงื่อนไขเมื่อ `upgrade_credit.enabled` (staging ไม่มี setting → default **true**) และผู้ใช้คนนั้นมีรายการ **paid ราคาเล็กวันนี้ ≥ 2 รายการ** (`minPaymentsForOffer=2`) และยังไม่ซื้อแพ็ก 399 — กักด้วย **การออกแบบข้อมูล: 1 รายการต่อผู้ใช้สังเคราะห์ (2 ผู้ใช้คนละ UID)** → `paymentsTodayCount = 1 < 2` → โค้ดคืน `below_min_payments` ก่อนถึง timer/push (เป็นเงื่อนไขในโค้ด ไม่ใช่ ban gate ไม่ใช่หวังให้ LINE ปฏิเสธ) · **ไม่เปลี่ยน config** (`upgrade_credit` คงเดิม)
   - หลักฐานทดสอบ (harness, Postgres+PostgREST จริง, guard บล็อกก่อนส่ง): **ข้อ 18** ผู้ใช้เดียวกันมี paid วันนี้ 2 รายการ → หลังอนุมัติมีความพยายามยิง `api.line.me` 1 ครั้ง (ถูกบล็อก) = เส้นนี้มีจริง · **ข้อ 19** 2 ผู้ใช้คนละคน 1 รายการ → อนุมัติทั้งคู่ **ไม่มีความพยายามยิง LINE** และข้อความอยู่ใน outbound queued เท่านั้น — **ผล 2 ต.ค.: harness 21/21 PASS** — ข้อ 18: หลังอนุมัติผู้ใช้ที่มี paid วันนี้ 2 รายการ มีความพยายามยิง `api.line.me` 1 ครั้ง ถูก guard บล็อก (log แอป `SPEND_UPGRADE_OFFER_FAILED fetch failed`) · ข้อ 19: 2 ผู้ใช้คนละคน → 0 ครั้ง, outbound queued 2 แถว
   - ตรวจสดก่อนเริ่มบน staging: ผู้ใช้สังเคราะห์ทั้ง 2 ไม่มี `payments` ใด ๆ มาก่อน (สร้างใหม่) และวันนี้จะได้คนละ 1 รายการเท่านั้น
3. ทางอื่น: `insertLineConversationMessage` = DB เท่านั้น · `maybeOfferSpendUpgrade` ที่ `lineWebhook.js`/`liff.routes.js` ไม่ถูกเรียกในรอบนี้ (ไม่มีข้อความ LINE/LIFF จากผู้ใช้สังเคราะห์) · ข้อความสลิป "รอตรวจ" ไป Telegram เท่านั้น · `ADMIN_PAYMENT_SLIP_NOTIFY` ว่าง (ไม่แจ้ง LINE admin)
ระยะเวลาเป้าหมาย ≤ 30 นาที · เปิด delivery กลับ **ด้วยมือหลังพิสูจน์ข้อ 5 เท่านั้น ไม่มีตั้งเวลาอัตโนมัติ**

## 2. รายการสังเคราะห์ (ไม่แตะบัญชี/รายการจริง) — **บันทึก ID เจาะจงตั้งแต่สร้าง**
- `app_users` **2 คน**: `line_user_id` สุ่มใหม่ `Uittgstg<random 24 hex>` คนละค่า (ไม่มีจริง) · `payments` **คนละ 1 รายการ** `status='pending_verify'`, `package_code='49baht_4scans_24h'`, `expected_amount=49`, `payment_ref='STG-TG-1' / 'STG-TG-2'`
- ทันทีที่สร้าง: เขียน `/root/backup-ops-20261002/tg-staging-live-<ts>/ids.json` = `{ uids:[…2], paymentIds:[…2], appUserIds:[…2] }` — **ทุกคิวรี่ cleanup ใช้ค่าในไฟล์นี้แบบ `IN (...)` เท่านั้น ไม่ใช้ `LIKE`**
- ข้อความสลิป "รอตรวจ" ส่งเข้าห้อง `approval ener scan` ด้วย `notifyTelegramSlipPendingVerify` (รันใน container ด้วยโค้ดจริง, config จาก DB) — ระบุ "ทดสอบ staging — ไม่ใช่ลูกค้าจริง"

## 3. ลำดับเมื่ออนุมัติ (ผมทำ · ทุกขั้นหยุดได้)
1. ตรวจสด (หยุดถ้าผิดเงื่อนไขข้อใด): outbound active 0 · pending_verify 0 · health 200 · `getWebhookInfo` url ว่าง · **effective `getUpgradeCreditConfig()` อ่านใน container ด้วยโค้ดจริง → `minPaymentsForOffer` ต้อง > 1** (ตอนนี้ไม่มี setting = default 2) และบันทึกค่า `enabled` ที่เห็น · `app_settings.upgrade_credit` ไม่เปลี่ยนระหว่างรอบ (เทียบก่อน/หลัง)
2. `docker compose stop worker-delivery` → ยืนยัน exited
3. สร้างผู้ใช้สังเคราะห์ **2 คน** + รายการคนละ 1 (SQL) → เขียน `ids.json` ทันที → **ยืนยัน: `select line_user_id, count(*) from payments where line_user_id in (...) group by 1` = 1 และ 1 (และ paid วันนี้ = 0) — ไม่ใช่ = หยุด**
4. **เปิดใช้งาน**: `telegram_settings_set_enabled(true, 'ops:live-test')` ผ่าน store (role จำกัด) → audit `telegram_enabled` · ตรวจ `POST /telegram/webhook` ไม่มี secret → **401** (ไม่ใช่ 404 แล้ว)
5. **setWebhook เฉพาะ bot ใหม่** (token/secret ถอดรหัสใน container ไม่พิมพ์): `url=https://test.my-ener.uk/telegram/webhook`, `secret_token=<secret จาก DB>`, `allowed_updates=["callback_query"]`, `drop_pending_updates=true` → `getWebhookInfo` url ตรง, pending 0, last_error ว่าง → บันทึก `webhook_set_at` (UPDATE แถว settings)
6. ส่งข้อความสลิป STG-TG-1 และ STG-TG-2 เข้าห้อง → **แจ้งกบ**
7. กบกด (ไม่ login เว็บ): STG-TG-1 "อนุมัติรายการนี้" → "ยืนยันอนุมัติ" → popup "อนุมัติแล้ว…" → กด "ยืนยันอนุมัติ" ซ้ำ → "ปุ่มนี้ใช้ไม่ได้แล้ว" → กด "อนุมัติรายการนี้" ซ้ำ → "ไม่อยู่ในสถานะรอตรวจ (paid)" · STG-TG-2: "อนุมัติรายการนี้" → กด "ยืนยันอนุมัติ" รัว ๆ 2–3 ครั้ง → สำเร็จครั้งเดียว · (ถ้า Rung EFan อยู่ในห้องและยังไม่ใช่ผู้อนุมัติ) ให้กดปุ่มใด ๆ → "บัญชีนี้ไม่มีสิทธิ์อนุมัติ"
8. ผมตรวจ: `payments` ทั้งสอง `paid` approved_by `telegram:7486743496` · `payment_entitlement_grants` 1 แถวต่อรายการ · `app_users` สังเคราะห์ paid_remaining 4 · audit ครบ (approve_requested/approve_confirmed ok ×2 โดยดีไซน์/denied ถ้ามี) · `telegram_approval_tokens` used · `outbound_messages` `approve_notify|queued` 2 แถว **ของ UID สังเคราะห์เท่านั้น** · log ไม่มี token/secret · ไม่มี LINE push (delivery หยุด; log worker ว่าง)
9. **cleanup ตามข้อ 5 ทั้ง 9 ขั้น** (ปิดรับก่อน → รอ → หยุด maintenance → stamp/dead ด้วย ID เจาะจง → เปิด maintenance รอ 1 รอบ → พิสูจน์ 0 → เปิด delivery ด้วยมือ)

## 4. เกณฑ์ผ่าน
กบกดสองขั้นใน Telegram โดยไม่ login เว็บ ✔ · paid + grant ครั้งเดียว + audit ครบ ✔ · กดซ้ำ/พร้อมกันไม่เติมซ้ำ ✔ · ข้อความลูกค้าอยู่ใน outbound ของ UID สังเคราะห์ และ **ไม่มี LINE push ทั้ง 2 ทาง** (delivery หยุด · spend-upgrade ไม่เข้าเงื่อนไขเพราะ 1 รายการ/ผู้ใช้) ✔ · ปฏิเสธสลิปผ่าน Telegram = ยังไม่มี (ไม่นับ)
ถ้าขั้นใดผิดคาด: หยุด ไม่ไปต่อ รายงานก่อน (ไม่เปิดกลับ delivery จน outbound สังเคราะห์ถูกจัดการ)

## 5. Cleanup หลังทดสอบ — หลักประกันว่า handler/งานเบื้องหลังจบจริง = **หยุดโปรเซสที่รัน handler** (ไม่ใช่รอ/log เงียบ)
หลักการ: handler และ timer ของ `maybeOfferSpendUpgrade` อยู่ใน **โปรเซสของ `ener-scan-staging`** เท่านั้น · sweep อยู่ใน `worker-maintenance` · เมื่อสองโปรเซสนี้หยุด (exited) จึงไม่มีงานใดกลับมาสร้างแถวภายหลังได้ · งานฝั่ง DB ที่ค้างตรวจจาก `pg_stat_activity` ก่อนแตะแถว
0. บันทึกเวลา callback สุดท้าย (จาก audit) · snapshot แถวของ ID ในไฟล์ (payments/grants/outbound/tokens/audit) ไปโฟลเดอร์หลักฐาน
1. **ปิดรับ**: `telegram_settings_set_enabled(false,'ops:live-test')` → webhook 404 · `deleteWebhook(drop_pending_updates=true)` → `getWebhookInfo` url ว่าง
2. **หยุดโปรเซสที่รัน handler/งานเบื้องหลัง + sweep**: `docker compose stop ener-scan worker-maintenance` → ตรวจทั้งคู่ `exited` (ไม่ลบ container/image; env ไม่เปลี่ยน)
   - ผลกระทบ: เว็บ staging (`test.my-ener.uk`: LINE webhook/LIFF/รายงาน/Admin) **ไม่ตอบ (502) ตลอดช่วง cleanup ~3–5 นาที** · LINE ส่ง webhook มา staging ไม่ได้ชั่วคราว (staging ไม่มีลูกค้าจริง) · Pro ไม่เกี่ยว (คนละ container/nginx upstream)
3. **ตรวจงาน DB ที่ยังค้าง** (read-only): `select pid, state, left(query,80) from pg_stat_activity where datname='ener_scan_staging' and state <> 'idle' and backend_type='client backend'` → ต้องไม่มี active/`idle in transaction` ของ PostgREST (role authenticator) · มี = รอจนหาย (ไม่ terminate) แล้วตรวจซ้ำ
4. **จัดการแถวด้วย ID เจาะจง (รองรับทั้งรายการที่ paid และที่ยังไม่ paid)** — อ่านจาก `ids.json`:
   - รายการที่ **paid + มี grant**: `mark_payment_grant_notified(<pid>)` → `notified_at` ไม่ null · outbound ของ `related_payment_id`/`line_user_id` ใน ID → `status='dead', last_error_code='staging_tg_live_test', next_retry_at=NULL` (เฉพาะ active)
   - รายการที่ **ยังไม่ paid** (ยุติกลางทาง/ไม่ได้กด): `UPDATE payments SET status='rejected', reject_reason='staging_tg_live_test_aborted', rejected_at=now(), updated_at=now() WHERE id IN (...) AND status='pending_verify'` (สถานะที่ schema ใช้อยู่แล้ว ไม่ใช่ทางลัดสิทธิ์; ไม่มี grant ให้ stamp) · token ที่ยังไม่ใช้ของ payment เหล่านี้ → `UPDATE telegram_approval_tokens SET expires_at = now() WHERE payment_id IN (...) AND used_at IS NULL` (กันปุ่มเก่าถ้าเผลอเปิด webhook อีก)
   - รายการที่ **paid แต่ grant ยังไม่เกิด** (ไม่ควรเกิด — RPC atomic): = หยุด รายงาน ไม่ไปต่อ
   - ตรวจหลัง: outbound active ของ ID ใน `ids.json` = 0 · pending_verify ของ UID ใน `ids.json` = 0 · grants `notified_at IS NULL` ของ payment ใน `ids.json` = 0
5. **เปิดกลับตามลำดับ (ด้วยมือ ไม่มีตั้งเวลา):** `docker compose start ener-scan` → `/health` 200 · `POST /telegram/webhook` 404 (ปิดอยู่) → `docker compose start worker-maintenance` → **รอ ≥ 90 วิ (1 รอบ sweep)** → ตรวจซ้ำข้อ 4 "ตรวจหลัง" ยังเป็น 0 ทั้งหมด (sweep ไม่หยิบเพราะ `notified_at` stamp แล้ว / รายการ rejected ไม่มี grant) → **พิสูจน์ได้ครบจึง** `docker compose start worker-delivery` → เฝ้า log 10 นาที ไม่มี `OUTBOUND_*`/`LINE_TRANSPORT_*`/`UPGRADE` ของ UID ใน `ids.json` · พิสูจน์ไม่ได้ = หยุด รายงาน ไม่เปิด delivery
6. คง `payments`/`grants`/`audit`/`tokens`/`app_users` สังเคราะห์ไว้ (ไม่ลบ) · หลักฐาน (ids.json + คิวรี่ก่อน/หลัง + `pg_stat_activity` + log ตัดค่า) ใน `/root/backup-ops-20261002/tg-staging-live-<ts>/`
**ยุติกลางทาง (ขั้นใดล้ม/กบขอหยุด):** ทำข้อ 1 ทันที → 2 → 3 → 4 (ครอบทั้ง paid/ยังไม่ paid) → 5 ตามลำดับเดิม · ไม่ถือว่าทุกขั้นสำเร็จ รายงานสถานะจริงของแต่ละรายการ · ไม่มี schema/โค้ดเปลี่ยน

## 6. สิ่งที่กบต้องอนุมัติ (ชุดเดียว — scope ปรับจากรอบก่อน: เพิ่มหยุด maintenance และหยุดแอป staging ช่วง cleanup)
- หยุด `worker-delivery` ตลอดรอบ (≤30 นาที) — LINE ของ staging ค้างคิว
- สร้างผู้ใช้/รายการสังเคราะห์ 2 ชุดบน DB staging (คง row ไว้เป็นหลักฐาน; รายการที่ไม่ได้กดจะถูก mark rejected)
- เปิดใช้งาน Telegram บน staging ชั่วคราว + setWebhook bot ใหม่ชี้ staging + ส่งข้อความสลิปทดสอบ 2 รายการเข้าห้อง `approval ener scan`
- **ช่วง cleanup: หยุด `ener-scan` (เว็บ staging ไม่ตอบ ~3–5 นาที) และ `worker-maintenance`** แล้วเปิดกลับตามลำดับ ener-scan → maintenance → (พิสูจน์) → delivery
- ปิดระบบกลับ (`enabled=false` + `deleteWebhook`) ก่อน cleanup ทุกกรณี · Pro ไม่แตะ · ไม่มีฟีเจอร์ใหม่
**กบต้องกด (ไม่ต้อง login เว็บ):** ตามข้อ 3.7 — STG-TG-1: อนุมัติ → ยืนยัน → ยืนยันซ้ำ (ต้อง "ใช้ไม่ได้แล้ว") → อนุมัติซ้ำ (ต้อง "ไม่อยู่ในสถานะรอตรวจ") · STG-TG-2: อนุมัติ → ยืนยันรัว ๆ 2–3 ครั้ง (สำเร็จครั้งเดียว) · Rung EFan กด → "ไม่มีสิทธิ์"
