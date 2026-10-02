# ชุดขออนุมัติ live ครั้งเดียว — Telegram อนุมัติสลิปบน **staging จริง** (config จาก DB) · 2 ต.ค. 2026

สถานะก่อนเริ่ม (ตรวจแล้ว 09:18Z): staging HEAD `197d1eb` (app = `b77e094`) · 066 apply แล้ว · config บันทึกแล้ว (`enabled=false`, chat `-5440947116`, approver Kob `7486743496`) · `POST /telegram/webhook` 404 · bot = `@ener_kob_approval_test_bot` (id 8780802561, is_bot, can_join_groups, privacy mode on) · webhook ปัจจุบัน **ว่าง** (pending_update_count 1 = /start เก่า) · outbound active = 0 · pending_verify = 0 · workers running
สิ่งที่พิสูจน์: "กบกดอนุมัติสองขั้นใน Telegram จริง → payment paid · grant ครั้งเดียว · audit · กดซ้ำไม่เติม · ข้อความลูกค้าอยู่ใน outbound แต่ไม่ถึง LINE" — บน staging จริง (DB/โค้ด/compose จริง) ไม่ใช่ระบบแยก
ไม่ใช่: GO Pro · ไม่แตะ Pro/bot กลาง · ไม่มีปฏิเสธสลิปผ่าน Telegram · ไม่ใช้ ban gate · ไม่ใช้ UID ปลอมหวังส่งไม่ผ่าน

## 0. สำรอง key (ทำแล้ว)
`/root/backup-ops-20261002/` (700): `staging.env.bak-2026-10-02-0918-with-keys` (600) + `telegram-config-keys.staging.env` (600, เฉพาะ 2 key) · sha256 ของ `TELEGRAM_CONFIG_KEY` ตรงกับที่ใช้จริง (`2bc5595d…`) · ไม่พิมพ์ค่า · แนะนำกบเก็บสำเนา key แบบออฟไลน์เพิ่ม (password manager) เพราะถ้า key หาย ciphertext ใน DB ถอดไม่ได้ (ต้องกรอก Token ใหม่ ไม่เสียอย่างอื่น)

## 1. วิธีกักข้อความ LINE ให้ส่งออกไม่ได้จริง — **หยุด `worker-delivery` ชั่วคราว**
ข้อเท็จจริง: ในเส้นอนุมัติ ข้อความถึงลูกค้ามีทางเดียวคือแถว `outbound_messages` (`approve_notify`) ที่ **delivery worker** เป็นผู้ push LINE — ไม่มี `pushMessage/replyMessage` ตรงใน telegram service/router/enqueue/notifier (ตรวจแล้ว) · ข้อความสลิป "รอตรวจ" ไปที่ Telegram เท่านั้น
- ก่อนหยุด: `outbound active = 0` (ถ้าไม่ 0 → รอ/หยุดแผน) · `docker compose stop worker-delivery` (ไม่ลบ container/image) · ผลกระทบ: ข้อความ LINE ทุกชนิดของ staging ค้างคิวตลอดช่วงทดสอบ (staging ไม่มีลูกค้าจริง; สแกนของกบบน staging จะไม่ได้รับผลจนเปิดกลับ) · ระยะเวลาเป้าหมาย ≤ 30 นาที
- เปิดกลับได้เฉพาะเมื่อ cleanup ข้อ 5 ครบ (ไม่มี outbound active ของรายการสังเคราะห์)

## 2. รายการสังเคราะห์ (ไม่แตะบัญชี/รายการจริง)
- `app_users`: `line_user_id = 'Uittgstaging' + 20 ตัวอักษร` (ไม่มีจริง) · `payments`: 2 รายการ `status='pending_verify'`, `package_code='49baht_4scans_24h'`, `expected_amount=49`, `payment_ref='STG-TG-1/2'` ผูกกับผู้ใช้สังเคราะห์ · สร้างด้วย SQL (psql) บันทึก id ไว้ในหลักฐาน
- ข้อความสลิป "รอตรวจ" ส่งเข้าห้อง `approval ener scan` ด้วย `notifyTelegramSlipPendingVerify` (รันใน container ด้วยโค้ดจริง, config จาก DB) — ข้อความระบุ "ทดสอบ staging — ไม่ใช่ลูกค้าจริง"

## 3. ลำดับเมื่ออนุมัติ (ผมทำ · ทุกขั้นหยุดได้)
1. ตรวจสด: outbound active 0 · pending_verify 0 · health 200 · `getWebhookInfo` url ว่าง
2. `docker compose stop worker-delivery` → ยืนยัน exited
3. สร้างผู้ใช้/รายการสังเคราะห์ 2 รายการ (SQL)
4. **เปิดใช้งาน**: `telegram_settings_set_enabled(true, 'ops:live-test')` ผ่าน store (role จำกัด) → audit `telegram_enabled` · ตรวจ `POST /telegram/webhook` ไม่มี secret → **401** (ไม่ใช่ 404 แล้ว)
5. **setWebhook เฉพาะ bot ใหม่** (token/secret ถอดรหัสใน container ไม่พิมพ์): `url=https://test.my-ener.uk/telegram/webhook`, `secret_token=<secret จาก DB>`, `allowed_updates=["callback_query"]`, `drop_pending_updates=true` → `getWebhookInfo` url ตรง, pending 0, last_error ว่าง → บันทึก `webhook_set_at` (UPDATE แถว settings)
6. ส่งข้อความสลิป STG-TG-1 และ STG-TG-2 เข้าห้อง → **แจ้งกบ**
7. กบกด (ไม่ login เว็บ): STG-TG-1 "อนุมัติรายการนี้" → "ยืนยันอนุมัติ" → popup "อนุมัติแล้ว…" → กด "ยืนยันอนุมัติ" ซ้ำ → "ปุ่มนี้ใช้ไม่ได้แล้ว" → กด "อนุมัติรายการนี้" ซ้ำ → "ไม่อยู่ในสถานะรอตรวจ (paid)" · STG-TG-2: "อนุมัติรายการนี้" → กด "ยืนยันอนุมัติ" รัว ๆ 2–3 ครั้ง → สำเร็จครั้งเดียว · (ถ้า Rung EFan อยู่ในห้องและยังไม่ใช่ผู้อนุมัติ) ให้กดปุ่มใด ๆ → "บัญชีนี้ไม่มีสิทธิ์อนุมัติ"
8. ผมตรวจ: `payments` ทั้งสอง `paid` approved_by `telegram:7486743496` · `payment_entitlement_grants` 1 แถวต่อรายการ · `app_users` สังเคราะห์ paid_remaining 4 · audit ครบ (approve_requested/approve_confirmed ok ×2 โดยดีไซน์/denied ถ้ามี) · `telegram_approval_tokens` used · `outbound_messages` `approve_notify|queued` 2 แถว **ของ UID สังเคราะห์เท่านั้น** · log ไม่มี token/secret · ไม่มี LINE push (delivery หยุด; log worker ว่าง)
9. **cleanup ข้อ 5** → 10. `telegram_settings_set_enabled(false)` + `deleteWebhook(drop_pending_updates=true)` → `getWebhookInfo` ว่าง · webhook 404 → 11. `docker compose start worker-delivery` → เฝ้า log 10 นาที ไม่มี event ของ UID สังเคราะห์ → 12. หลักฐาน (query ผล + log ตัดค่า) ไป `/root/backup-ops-20261002/tg-staging-live-<ts>/`

## 4. เกณฑ์ผ่าน
กบกดสองขั้นใน Telegram โดยไม่ login เว็บ ✔ · paid + grant ครั้งเดียว + audit ครบ ✔ · กดซ้ำ/พร้อมกันไม่เติมซ้ำ ✔ · ข้อความลูกค้าอยู่ใน outbound ของ UID สังเคราะห์ และ **ไม่มี LINE push** ✔ · ปฏิเสธสลิปผ่าน Telegram = ยังไม่มี (ไม่นับ)
ถ้าขั้นใดผิดคาด: หยุด ไม่ไปต่อ รายงานก่อน (ไม่เปิดกลับ delivery จน outbound สังเคราะห์ถูกจัดการ)

## 5. Cleanup หลังทดสอบ (เก็บหลักฐาน ไม่ลบ grant/audit)
1. `mark_payment_grant_notified(<pid>)` ทั้ง 2 → `notified_at` ไม่ null → sweep ไม่หยิบ
2. `UPDATE outbound_messages SET status='dead', last_error_code='staging_tg_live_test', next_retry_at=NULL WHERE line_user_id LIKE 'Uittgstaging%' AND status IN ('queued','sending','retry_wait')` → ตรวจ active ของ UID สังเคราะห์ = 0 (สถานะ `dead` เป็นค่าที่ schema อนุญาต ไม่แก้โค้ด)
3. ตรวจ `SELECT count(*) FROM outbound_messages WHERE status IN ('queued','sending','retry_wait')` ทั้งระบบ — ถ้ามีของอื่น (เกิดระหว่างหยุด) ปล่อยไว้ให้ส่งตามปกติหลังเปิด
4. คง `payments`/`grants`/`audit`/`tokens`/`app_users` สังเคราะห์ไว้ (บันทึก id) · ไม่ลบ · ไม่ปลดแบนใคร (ไม่ได้แบน)
5. ปิดระบบกลับ: `set_enabled(false)` + `deleteWebhook` → แล้วค่อย `start worker-delivery`
**Rollback ระหว่างทาง:** ขั้นใดล้ม → `set_enabled(false)`, `deleteWebhook`, cleanup 1–3, start delivery · ไม่มี schema/โค้ดเปลี่ยน

## 6. สิ่งที่กบต้องอนุมัติ (ชุดเดียว) และต้องกด
- อนุมัติ: หยุด `worker-delivery` ชั่วคราว (≤30 นาที) · สร้างรายการสังเคราะห์บน DB staging · เปิดใช้งาน Telegram บน staging ชั่วคราว · setWebhook bot ใหม่ชี้ staging · ส่งข้อความสลิปทดสอบ 2 รายการเข้าห้อง · ปิดกลับ + cleanup ตามข้อ 5
- กด: ปุ่มใน Telegram ตามข้อ 3.7 เท่านั้น (ไม่ต้อง login เว็บ ไม่ต้องกรอกอะไร)
