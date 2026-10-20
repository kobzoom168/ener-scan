# เปิดใช้งานอนุมัติสลิปผ่าน Telegram บน Pro — runbook (กบอนุมัติ 20 ต.ค. 2026 ผ่าน Codex)

## 1. สถานะ Pro ก่อนเริ่ม (read-only 20 ต.ค. 09:30 ไทย)
- โค้ด: Pro = `c102b71` มี route `/admin/telegram-approval`, `/telegram/webhook`, service `telegramSlipApproval` + `telegramConfig.store` ครบ → **ไม่ต้อง deploy โค้ดใหม่**
- DB Pro: 061 (`telegram_approval_tokens`) + 066 (`telegram_approval_settings`, RPC `telegram_settings_*`) apply แล้ว (preflight 19 ต.ค. ทุกแถว t) · role `telegram_config_admin` มี · **ยังไม่มีแถว settings** · pending_verify ตอนนี้ 0
- env Pro: **ไม่มี** `TELEGRAM_CONFIG_KEY` และ `TELEGRAM_CONFIG_DB_KEY` (authority = db แต่ store ไม่ ready → ฟีเจอร์ปิด) · ไม่มีตัวแปร env-authority (`TELEGRAM_SLIP_APPROVAL_ENABLED` ฯลฯ) = ถูกต้อง ใช้ DB เป็นผู้คุม
- `POST https://scan.my-ener.uk/telegram/webhook` = **404** (ปิดอยู่) · staging = 404 (ปิดหลังทดสอบ 14 ต.ค.)
- staging มีค่าทดสอบ: bot `@ener_kob_approval_test_bot` ห้อง `-5440947116` ผู้อนุมัติ Kob `7486743496` — **ห้ามนำมาใช้บน Pro** (bot หนึ่งตัวตั้ง webhook ได้ URL เดียว ใช้ร่วมจะชนกับ staging; Codex ห้ามใช้ค่าทดสอบ)
- แจ้งสลิปรอตรวจทาง LINE แอดมิน (`maybeNotifyAdminSlipPendingVerify`, default เปิด) **คงไว้** จนกบสั่งปิดแยก

## 2. สิ่งที่กบต้องให้/ยืนยัน (ห้ามอนุมาน)
1. **Bot สำหรับ Pro**: แนะนำสร้างใหม่ที่ @BotFather (เช่น `@ener_approval_bot`) — ไม่ใช้ @Eneraibot (bot alert/รายงาน; โค้ดไม่ fallback ไป bot นี้) และไม่ใช้ bot ทดสอบ staging · **token กรอกเองที่หน้า Admin Pro** `https://scan.my-ener.uk/admin/telegram-approval` (เข้ารหัสด้วย TELEGRAM_CONFIG_KEY) — ไม่ส่ง token ในแชต
2. **ห้อง**: กลุ่มใหม่ (เช่น "Ener Approvals Pro") เชิญ bot ใหม่เข้า แล้วบอก chat id (ตัวเลขติดลบ) — หรือแชตส่วนตัวกับ bot (chat id = Telegram user id ของกบ) · ห้องต้องไม่ใช่ `-5440947116`
3. **ผู้อนุมัติ**: รายชื่อ Telegram user id (กบ `7486743496` ใช่ไหม + คนที่ 2 ถ้ามี) — คนอื่นในห้องกดจะได้ "ไม่มีสิทธิ์"
4. **วิธีทดสอบจริง**: ใช้ **Test UID ของกบ** (`Ufe02fff…`) ส่งรูปสลิปเก่า/ไม่ตรงยอดเข้า Pro OA → เข้า pending_verify (auto ไม่ผ่าน) → ข้อความเข้าห้อง Telegram → **กบกดเอง** "อนุมัติรายการนี้" → "ยืนยันอนุมัติ" → กดซ้ำ (ต้อง "ใช้ไม่ได้แล้ว") → ตรวจ: payment paid ครั้งเดียว, grant 1 แถว, สิทธิ์เพิ่มครั้งเดียว, LINE ลูกค้า (Test UID) ได้ข้อความ "เปิดสิทธิ์แล้ว" · **ไม่กดอนุมัติรายการลูกค้าจริงแทนกบ** · ถ้ากบไม่ต้องการให้ Test UID ได้สิทธิ์จริง ให้บอก (ทางเลือก: ทดสอบกับรายการสังเคราะห์ที่ outbound ถูกกักเหมือน staging — ซับซ้อนกว่า ต้องหยุด delivery)

## 3. ขั้นตอน (หลังได้ข้อ 2)
| # | ขั้น | คำสั่ง/วิธี | ตรวจ |
|---|---|---|---|
| 0 | backup | `install -m600 /root/ener-scan-pro/.env /root/backup-ops-20261002/pro-tg-<ts>/.env.pro.bak` · snapshot `telegram_approval_settings` (ไม่มีแถว) | ไฟล์ 600 |
| 1 | env keys | `TELEGRAM_CONFIG_KEY=$(openssl rand -hex 32)` ต่อท้าย .env (ไม่พิมพ์) · `gen-restricted-jwt.mjs /root/ener-scan-pro/.env TELEGRAM_CONFIG_DB_KEY telegram_config_admin` (fingerprint เท่านั้น) | ชื่อตัวแปรมี · parts=3 role ถูก |
| 2 | recreate web เท่านั้น | `deploy-pinned.sh pro c102b71… --frozen-ref origin/pro/three-tasks-c102b71 --keep worker-scan,worker-maintenance,worker-delivery` (build จาก cache; ตรวจดิสก์ว่าง ≥ 5G ก่อน) → เฉพาะ `ener-scan` ได้ env ใหม่ · worker ไม่แตะ (ไม่ต้อง drain) | HEAD เดิม · `/health` 200 · `docker exec ener-scan-pro env | grep -oE '^TELEGRAM_CONFIG_(KEY|DB_KEY)='` |
| 3 | กบกรอกหน้า Admin | `https://scan.my-ener.uk/admin/telegram-approval`: Bot Token (ใหม่) · Chat ID · ผู้อนุมัติ 1–2 คน → บันทึก (หน้านี้ไม่เปิด flag ไม่ setWebhook) | ops `status`: configured=true enabled=false token_set_at · log `ADMIN_TELEGRAM_CFG_SAVED` |
| 4 | ตรวจ bot | ops `bot-info` (getMe) → username ตรงกับที่กบสร้าง, is_bot | ไม่พิมพ์ token |
| 5 | เปิด + webhook | ops `enable ops:pro-enable-<date>` → `verify-endpoint https://scan.my-ener.uk/telegram/webhook` ต้อง **401/401** (ไม่ใช่ 404) → ops `set-webhook https://scan.my-ener.uk/telegram/webhook` (secret จาก DB, callback_query, drop pending) → `webhook-info` url ตรง pending 0 last_error ว่าง → `UPDATE telegram_approval_settings SET webhook_set_at=now() WHERE id=1` (psql) | บันทึกเวลาเปิดไทย |
| 6 | ทดสอบจริงกับกบ (ข้อ 2.4) | ผมดู log `TELEGRAM_*`/audit `record_payment_approval_audit` (approve_requested → approve_confirmed ok) · payments/grants/app_users ของ Test UID ก่อน–หลัง · outbound `approve_notify` → LINE_TRANSPORT_OK · กดซ้ำ = denied/stale | ตารางหลักฐานเวลาไทย |
| 7 | ผิดปกติ | ops `disable ops:rollback` + `delete-webhook` → webhook 404 · ช่องตรวจมือ (หน้า Admin payments + LINE แจ้ง) ยังอยู่ · รายงานหลักฐาน | — |
**ไม่ทำ:** ปิดแจ้ง LINE สลิป · แตะนโยบายฟรี/ยอดสิทธิ์ลูกค้า · cleanup อื่น · deploy โค้ดใหม่
**เครื่องมือ:** `scripts/ops/telegram-approval-ops.mjs` (commit นี้; รันใน image web Pro ด้วย `--env-file` + network Pro; ไม่พิมพ์ token/secret; static test `tests/telegramApprovalOps.static.test.js`)

## 4. ผลขั้น 0–2 (20 ต.ค. 2026 11:13–11:15 ไทย) — กบอนุมัติ
- backup: `/root/backup-ops-20261002/pro-tg-20261020-041326/.env.pro.bak` (600) + settings rows before = 0 · `.env.bak-2026-10-20T0413` (จาก gen-jwt)
- env Pro: `TELEGRAM_CONFIG_KEY` (64 hex ใหม่ ไม่พิมพ์) · `TELEGRAM_CONFIG_DB_KEY` role telegram_config_admin exp 2038 fingerprint `7f1825f3` · ไม่ตั้งตัวแปร env-authority (DB เป็นผู้คุม)
- recreate web เท่านั้น: `deploy-pinned.sh pro c102b71… --frozen-ref origin/pro/three-tasks-c102b71 --keep worker-scan,worker-maintenance,worker-delivery` 11:13:48–11:15:01 ไทย · BLUE healthy · HEAD เดิม c102b71 · image web ใหม่ `f1dfdc40…` (build ใหม่จาก SHA เดิม เพราะ build cache ถูกล้าง 20 ต.ค.; โค้ดเดิม) · worker 3 ตัวไม่แตะ (StartedAt 19 ต.ค. 15:20 เดิม) · `/health` 200 · webhook ยัง 404 (ยังไม่มี settings) · ดิสก์ 78% ว่าง 17G
- ops script `/root/ener-ops-tg-7d8a338/telegram-approval-ops.mjs` (sha256 `0ec099e3…` ตรง repo 7d8a338) · `status` บน Pro: configured=false token_set=false enabled=false = store พร้อม (key ใช้ได้) รอกบกรอกหน้า Admin
- **คำถามจากกบ:** ใช้ bot `@ener_kob_approval_test_bot` + กลุ่ม "approval ener scan" (-5440947116, 3 คน) ที่สร้างไว้ตอน staging ได้ไหม → ตอบ: ได้ ภายใต้เงื่อนไข (1) bot หนึ่งตัวมี webhook ได้ URL เดียว → เมื่อชี้ Pro แล้ว staging ห้ามเปิดใช้ bot นี้อีก (staging ตอนนี้ปิดอยู่ webhook ว่าง — ตรวจซ้ำก่อน set) (2) ควรเปลี่ยนชื่อกลุ่มให้ชัดว่าเป็น Pro และสมาชิกที่ไม่ใช่ผู้อนุมัติกดจะได้ "ไม่มีสิทธิ์" (3) token ต้องกรอกที่หน้า Admin Pro เอง (ค่าใน DB staging ถอดรหัสด้วย key staging — ผมไม่ย้ายข้าม env) (4) ต้องยืนยันเป็นข้อความชัด ๆ ว่า "ใช้ bot/ห้องนี้กับ Pro" ตาม Codex
- **รอ:** ยืนยันข้อข้างบน + ชื่อและ Telegram user id ของผู้อนุมัติคนที่ 2

## 5. การตัดสินใจของกบ (20 ต.ค. 11:30 ไทย)
- **สร้าง bot และกลุ่มใหม่สำหรับ Pro แยกจาก staging** · คง `@ener_kob_approval_test_bot` + กลุ่ม "approval ener scan" (-5440947116) ไว้สำหรับ staging ตามเดิม (ไม่แตะ)
- ลำดับต่อไป (รอกบ): (1) กบสร้าง bot ใหม่ที่ @BotFather + กลุ่มใหม่ เชิญ bot เข้ากลุ่ม (2) กบกรอกหน้า Admin Pro `https://scan.my-ener.uk/admin/telegram-approval`: Bot Token · Chat ID ของกลุ่มใหม่ · ผู้อนุมัติ 1–2 คน (label + Telegram user id) → บันทึก (3) กบยืนยันรายชื่อผู้อนุมัติกับผม → ผม: `status` (configured=true) → `bot-info` (username ตรง) → `enable` → `verify-endpoint` 401 → `set-webhook` → `webhook-info` → ทดสอบจริงด้วย Test UID ตามข้อ 2.4/3.6 → รายงาน SHA/config/เวลา/ผลจริง
- ยังไม่ปิดแจ้งสลิปทาง LINE จนทดสอบผ่านและกบสั่งปิดแยก · ไม่แตะนโยบาย/ยอดสิทธิ์

## 6. เปิดใช้งานบน Pro (20 ต.ค. 2026 11:31–11:36 ไทย)
- กบสร้าง bot ใหม่ `@ener_scan_approval_pro_bot` (id 8947287801, getMe ✓) + กลุ่มใหม่ "approval ener scan pro" chat id `-5564579265` (type group; อ่านจาก getUpdates หลัง `/start@bot` — ค่าเดิม `-1001` ชั่วคราวถูกแก้แล้ว) · ผู้อนุมัติ 1 คน: กบ `7486743496` (คนที่ 2 ยังไม่มี — กบสั่งเอาคนเดียวก่อน)
- กบบันทึกหน้า Admin: token 11:31 · chat id/ผู้อนุมัติ 11:35 (`ADMIN_TELEGRAM_CFG_SAVED approverCount=1`)
- ops (script `4e7c0eb` sha256 ตรง): `status` configured=true → endpoint ปิด 404/404 → **`enable` 11:36:01** (actor ops:pro-enable-20261020) → endpoint 401/401 (ไม่มี secret/secret ผิด; log `TELEGRAM_WEBHOOK_BAD_SECRET` ×2 = ของ verify เอง) → **`set-webhook` 11:36:04** url `https://scan.my-ener.uk/telegram/webhook` secret จาก DB allowed callback_query drop_pending → `webhook-info` url ตรง pending 0 last_error ว่าง → `webhook_set_at` บันทึก · หลักฐาน `/root/backup-ops-20261002/pro-tg-20261020-041326/enable.json`
- config ที่มีผล: **DB authority** (ไม่มี env-authority) · โค้ด Pro `c102b71` ไม่เปลี่ยน · bot/กลุ่มทดสอบ staging ไม่แตะ (staging ยัง enabled=false webhook ว่าง)
- baseline Test UID ก่อนทดสอบ (read-only) → ดู §7

## 7. ปรับขั้นทดสอบตาม Codex (20 ต.ค. 11:45 ไทย) + ข้อค้นพบผลกระทบสิทธิ์
- **ห้ามใช้สลิปเก่าสุ่ม** (duplicate_slip_ref ทำให้เข้า pending_verify ได้แต่อ้างอิงรายการเงินจริงเดิม) → รายการทดสอบต้องระบุชัด: เลือกแพ็ก 49 ใน LINE → **โอนจริง 50 บาท** เข้าบัญชีร้านของกบเอง (ยอดไม่ตรงแพ็ก → auto ไม่ผ่าน → pending_verify) → สลิปใหม่ ไม่ซ้ำใคร เงินอยู่กับกบ
- **ผลกระทบสิทธิ์ (จาก `approve_payment_and_grant` sql/063 + `resolveEntitlementForPackage`):** grant ตั้ง `paid_until = เวลาอนุมัติ+24 ชม.` และ `paid_remaining = 4 + carry` โดย carry ให้เฉพาะเมื่อเป็นแพ็กสูงสุด **และคนละ plan** กับที่ถืออยู่ → Test UID (`Ufe02fff…`) ถือ `49baht_4scans_24h` อยู่ (47 ครั้ง ถึง 2027-07-09) **จะถูกรีเซ็ตเป็น 4 ครั้ง/24 ชม.** · ไม่มีหน้า Admin คืนสิทธิ์ (routes: payments/reject เท่านั้น) → **กบเลือกใช้บัญชี LINE อื่นที่ไม่มีแพ็ก** (ผลกระทบ = +4 ครั้ง/24 ชม. เท่านั้น)
- **ก่อนกบกดยืนยัน ผมต้องรายงาน:** payment id, UID ย่อ, แพ็ก/ยอดที่คาด (49) vs ยอดสลิป (50), เหตุที่ auto ไม่ผ่าน, สิทธิ์ก่อน (snapshot) และผลหลังอนุมัติที่คาด (+4 ครั้ง, paid_until = อนุมัติ+24 ชม.) → กบตอบ "ยืนยัน" ค่อยกด
- **หลังกด:** ตรวจ grant 1 แถว · ยอด/paid_until เปลี่ยนครั้งเดียว · กดซ้ำไม่เปลี่ยน · outbound/LINE ถึงลูกค้า 1 ครั้ง · **ห้ามลบหลักฐาน ห้ามหักสิทธิ์คืนเอง** · LINE แจ้งแอดมินคงเปิด

## 8. ตรวจเงื่อนไข 50 บาทและสิทธิ์แพ็กบน Pro (read-only 20 ต.ค. 11:46 ไทย — ตาม Codex ข้อ 1–3)
- **ค่า effective ใน container web Pro** (import env.js ไม่พิมพ์ค่าลับ): `SLIP_AMOUNT_TOLERANCE=0` · `SLIP_AUTO_APPROVE_ENABLED=true` · `DRY_RUN=false` · `MAX_AGE_HOURS=24` · `EASYSLIP_ENABLED=true` (SlipOK ปิด) · `ADMIN_PAYMENT_SLIP_NOTIFY=true`
- **แพ็กที่ active บน Pro (app_settings.scan_offer `promo_jul2026_v2`):** 29 บาท/1 ครั้ง/24 ชม. · 49 บาท/4 ครั้ง/24 ชม. · 399 บาท/30 ครั้ง/720 ชม. → **ไม่มีแพ็กราคา 50** จึงไม่เกิดการสลับแพ็กตามยอด
- **Spend-to-upgrade credit:** `app_settings.upgrade_credit.enabled=false` (ปิดโดยกบ 12 ส.ค.) → ไม่มีเส้นเครดิตอัปเกรด (และบัญชีใหม่ไม่มีประวัติจ่ายอยู่แล้ว)
- ⇒ สลิป 50 บาท กับรายการแพ็ก 49: `|50−49| = 1 > tolerance 0` → `amount_mismatch` → ไม่ auto-approve → **pending_verify** (เส้นสลับแพ็ก/เครดิตไม่เข้าเงื่อนไข) · เงื่อนไขอื่นที่อาจเพิ่ม reason (slip อายุ >24 ชม., OCR อ่านไม่ได้, duplicate) ก็ยังจบที่ pending_verify ไม่ใช่ reject · **ไม่เปลี่ยน config ใดเพื่อบังคับผล**
- **สิทธิ์ของรายการนี้ (คำนวณจริงใน container `resolveEntitlementForPackage`):** plan `49baht_4scans_24h` · **scans 4** · `paidUntil = เวลาอนุมัติ + 24 ชม.` (ตัวอย่างคำนวณ 11:46 → 2026-10-21 11:46) · `isTopPackage=false` (แพ็กสูงสุดคือ 399) → **carry-over = 0 เสมอสำหรับแพ็ก 49** (SQL ต้องครบ: แพ็กใหญ่สุด + แพ็กเดิมยังไม่หมดอายุ + คนละ plan + ยอดคงเหลือ 1–899999)
- หมายเหตุ: `unlock_hours` ของ payment (ถ้ามี) ใช้แทน windowHours — ต้องอ่านค่าจริงจากแถว payment ที่เกิดขึ้นก่อนรายงานให้กบยืนยัน
- กติกาซื้อ plan เดิมซ้ำไม่สะสมยอดเดิม = **งานทบทวนแยก** ไม่แก้ปนกับการเปิด Telegram

## 9. ปรับถ้อยคำ/เงื่อนไขทดสอบ (Codex 20 ต.ค. 12:00 ไทย)
- สลิป 50 บาท: **"คาดว่าจะเข้า pending_verify เมื่อรับและตรวจสลิปได้ตามปกติ"** (ไม่ใช่ "แน่นอน") — ต้องเห็นผลรายการจริง
- ก่อนกบกดยืนยัน ผมต้องแสดงครบ: payment id · UID ย่อ · **เงินเข้าจริง 50 บาท** (จาก OCR/verify) · แพ็ก 49 · สิทธิ์ 4 ครั้ง · **วันหมดอายุคำนวณจริง** (จาก `unlock_hours`/windowHours ของแถวจริง)
- **ส่วนเกิน 1 บาท**: ตกลงกับผู้ทดสอบและบันทึกว่า "คืน" หรือ "ยินยอมชำระเกิน" — ระบบไม่ถือเป็นเครดิตอัตโนมัติ
- หลังกดซ้ำ: grant ไม่เพิ่ม · paid_until ไม่ขยับ · ไม่มีข้อความเปิดสิทธิ์ซ้ำถึง LINE
- รอบนี้พิสูจน์เฉพาะ "อนุมัติรายการยอดไม่ตรงผ่าน Telegram" — ไม่พิสูจน์โอนเพิ่มหลายสลิป/คืนเงิน (แผนแยก `2026-10-20-partial-payment-topup-refund-plan.md`)
