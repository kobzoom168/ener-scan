# แผนเตรียม Telegram approval บน staging (งาน 3) — แผนเท่านั้น ยังไม่ดำเนินการ (1 ต.ค. 2026)

สถานะ: Codex รับผล 065 staging แล้ว · Pro NO-GO · ข้อนี้ **ยังไม่เปิด flag / recreate / setWebhook / ส่งข้อความ** จนกบอนุมัติ

## สถานะจริงบน staging (read-only 1 ต.ค.)
- `.env` staging มีเฉพาะ `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` = bot แจ้งเตือนกลางเดิม (ห้ามแตะ · ไม่ใช้เป็น bot อนุมัติ — เทสต์ `telegramSlipApproval.behavior` ข้อ 1 พิสูจน์ว่า credential กลางเปิดอนุมัติไม่ได้)
- ตัวแปรงาน 3 ทั้ง 5 ยังไม่มี → `readTelegramApprovalConfig()` คืน null → `POST /telegram/webhook` ตอบ 404 (ตรวจแล้ว) · `notifyTelegramSlipPendingVerify` ไม่ส่งอะไร
- ตาราง 061–063 มีครบ (`telegram_approval_tokens`, `payment_entitlement_grants`, `payment_approval_audit`) · RPC 10-arg เท่านั้น (preflight `063 approve(…,jsonb) only = t`)
- `payments` บน staging: expired 4 · rejected 3 · paid 2 · **ไม่มี `pending_verify`** — ไม่มีรายการจริงที่จะถูกปุ่มทดสอบแตะ

## 1. Bot แยก + config (กบทำ ไม่ส่งค่าผ่านแชท/log)
| ตัวแปร (ใส่ใน `/root/ener-scan-staging/.env`) | ค่า | หมายเหตุ |
|---|---|---|
| `TELEGRAM_APPROVAL_BOT_TOKEN` | token ของ **bot ใหม่** จาก BotFather | คนละตัวกับ bot แจ้งเตือนกลาง และคนละตัวกับที่จะใช้บน Pro |
| `TELEGRAM_APPROVAL_CHAT_ID` | id ของกลุ่ม/แชทที่ bot ใหม่อยู่ (ตัวเลข อาจติดลบ) | เฉพาะห้องนี้เท่านั้นที่ปุ่มใช้ได้ (`chat_not_allowed` ถ้าไม่ตรง) |
| `TELEGRAM_APPROVER_USER_IDS` | Telegram **user id ตัวเลข** ของผู้อนุมัติ คั่นด้วย `,` | ยึด id ไม่ใช่ username (เทสต์ "สิทธิ์ยึดที่ user id") · กบส่งรายการให้ |
| `TELEGRAM_WEBHOOK_SECRET` | สุ่ม ≥ 32 ตัวอักษร (`openssl rand -base64 32` บนเครื่องกบ/เซิร์ฟเวอร์ ไม่ผ่านแชท) | ค่าเดียวกับที่ใช้ตอน `setWebhook` (`secret_token`) |
| `TELEGRAM_SLIP_APPROVAL_ENABLED` | **`false`** ไว้ก่อน | เปิดเป็น `true` เฉพาะเมื่อกบอนุมัติ "เปิด" แยกอีกรอบ |
วิธีตรวจว่าค่าครบโดยไม่พิมพ์ค่า: `grep -cE "^TELEGRAM_(APPROVAL_BOT_TOKEN|APPROVAL_CHAT_ID|APPROVER_USER_IDS|WEBHOOK_SECRET|SLIP_APPROVAL_ENABLED)=." .env` ต้องได้ 5

## 2. บริการที่ต้อง recreate เพื่อรับ env (compose ใช้ `env_file: .env` — แก้ไฟล์แล้ว **restart อย่างเดียวไม่รับค่าใหม่** ต้อง recreate)
| บริการ (compose) | container | ทำไมต้องรับ env | image ปัจจุบัน (exact) |
|---|---|---|---|
| `ener-scan` | `ener-scan-staging` | รับ `POST /telegram/webhook` + ส่งข้อความสลิป "รอตรวจ" พร้อมปุ่มเข้า Telegram (`adminPaymentSlipNotify` → `notifyTelegramSlipPendingVerify`) | `ener-scan-staging-ener-scan` id `980009f63eab` |
| `worker-maintenance` | `ener-scan-staging-worker-maintenance` | `runPaymentGrantNotifySweep` → enqueue ข้อความแจ้งลูกค้าหลังเติมสิทธิ์ (ไม่ใช้ตัวแปร Telegram โดยตรง แต่รับ env ชุดเดียวกัน — recreate เพื่อให้ env ตรงกันทุกคอนเทนเนอร์) | `ener-scan-staging-worker-maintenance` id `9fa98be6d93e` |
| `worker-scan`, `worker-delivery`, `postgrest`, `redis` | — | ไม่เกี่ยว (delivery ส่งจาก outbound ตามปกติ) | ไม่แตะ |
คำสั่ง (เมื่ออนุมัติ): `cd /root/ener-scan-staging && docker compose up -d --no-build --force-recreate ener-scan worker-maintenance` — **`--no-build` คง image เดิม** (ไม่ใช้ `/root/deploy-ener.sh` เพราะมัน build+up --build เสมอ) · ก่อน/หลัง: `docker inspect -f '{{.Image}}'` ต้องเท่าเดิม (`980009f63eab` / `9fa98be6d93e`) + runtime hash เดิม `1094347` · ตรวจ `/health` 200 และ `/telegram/webhook` → ยัง 404 ตราบที่ `ENABLED=false`
**ย้อนกลับ:** ลบ/คอมเมนต์ 5 บรรทัดใน `.env` → recreate 2 บริการเดิมด้วยคำสั่งเดียวกัน (image เดิม) → `/telegram/webhook` 404 · ไม่มี DB เปลี่ยน · backup `.env` ก่อนแก้: `cp .env .env.bak-$(date +%F)` (chmod 600, ไม่ย้ายออกนอกเครื่อง)
ห้าม: แตะ `/root/ener-scan-pro` · แตะ bot กลาง (`TELEGRAM_BOT_TOKEN`) · `setWebhook` ของ bot เดิม/Pro

## 3. รายการทดสอบสังเคราะห์ (ก่อน/หลังเปิด flag) — ไม่แตะบัญชี/รายการลูกค้าจริง ไม่ใช้บัญชีกบเติม grant
**ก. ระบบแยก (มีอยู่แล้ว — ชี้หลักฐาน ไม่สร้างซ้ำ):** `scripts/ops/test-payment-approval-db.mjs` (Postgres จริง 061–063: idempotent · อนุมัติเติมครั้งเดียว · audit ล้ม rollback ทั้งหมด · retry หลังใช้ไม่เติมซ้ำ · snapshot ยอด/แพ็ก/ชั่วโมง/เจ้าของเปลี่ยน = ปฏิเสธ · 5 connection พร้อมกันเติมครั้งเดียว · outbox ล้ม/crash หลัง enqueue dedupe · PUBLIC execute ไม่ได้) + `tests/telegramSlipApproval.behavior.test.js` (ผู้ไม่มีสิทธิ์ · ผิด chat · ปุ่มหมดอายุ · token ปลอม · กดซ้ำ · stale · เว็บอนุมัติก่อน · DB/แจ้งลูกค้า/audit/Telegram ล้ม · ไม่มี GET · ไม่รั่ว token) + `paymentApprovalHardening.test.js` — ทั้งหมดอยู่ใน gate ✅
**ข. ช่องว่างที่จะเพิ่มในระบบแยก (harness เดิม `fixtures/it-network-guard` + schema staging):** ยิง `POST /telegram/webhook` ผ่าน router จริง + `handleApprovalCallback` จริง + RPC จริง: (1) ผิด secret → 401 ไม่แตะ DB (2) secret ถูก + user id ไม่อยู่ในรายชื่อ → denied + audit `actor_not_allowed` (3) ผิด chat → denied + audit (4) ขั้น 1 `ap:` → token ออก ยังไม่เปลี่ยนสถานะ (5) ขั้น 2 `cf:` → `approve_payment_and_grant` เติมครั้งเดียว + grant + audit `ok` + แถว notify pending (6) กด `cf:` ซ้ำ / 3 callback พร้อมกัน → เติมครั้งเดียว (7) ปุ่มหมดอายุ (TTL) → denied ไม่เติม (8) ปฏิเสธ → ไม่เติม, audit (9) answerCallbackQuery/sendMessage ไปที่ api.telegram.org ถูก guard บล็อก → handler ยังตอบ 200 และสถานะถูกต้อง
**ค. บน staging หลังเปิด flag (รอบอนุมัติแยก):** สร้างรายการ `payments` สังเคราะห์ `status='pending_verify'` ด้วย `line_user_id` สังเคราะห์ (`Utest…` ไม่มีในบัญชีจริง) + `package_code`/`expected_amount` จริงจาก config → ส่งข้อความสลิปเข้า Telegram ด้วย `notifyTelegramSlipPendingVerify` (bot ใหม่ ห้องใหม่) → ผู้อนุมัติกดใน Telegram จริง (ไม่ต้อง login เว็บ; ระบบตรวจ numeric id + chat + secret ทุกครั้ง) → ตรวจ `payment_entitlement_grants` 1 แถว · `payment_approval_audit` ครบ · `telegram_approval_tokens` ใช้แล้ว · กดซ้ำ = stale · บัญชีคนนอกกด = denied

## 4. กันข้อความแจ้งผลหลุดไปหาลูกค้าจริง
- ข้อความ "เติมสิทธิ์แล้ว" ไปหาลูกค้าผ่าน `runPaymentGrantNotifySweep` → outbound `approve_notify` ของ `line_user_id` ในรายการ payment → delivery worker push LINE · ดังนั้น **ใช้ `line_user_id` สังเคราะห์เท่านั้น** (LINE ตอบ 400 invalid user → outbound failed · ไม่มีคนจริงได้รับ) และตรวจก่อนกดว่า `select line_user_id from payments where status='pending_verify'` มีแต่ UID สังเคราะห์
- ห้ามสร้าง `pending_verify` ให้บัญชีจริง/บัญชีกบ (ถ้ากบต้องการทดสอบ end-to-end ด้วยบัญชีตัวเอง = เติมสิทธิ์จริงบน staging ต้องขออนุมัติผลกระทบก่อน และบันทึกยอดก่อน/หลัง)
- ข้อความเข้า Telegram จะไปเฉพาะ `TELEGRAM_APPROVAL_CHAT_ID` ของ bot ใหม่ (ห้องทดสอบ) ไม่ใช่ห้องแจ้งเตือนกลาง
- ก่อน `setWebhook` ของ bot ใหม่: `getWebhookInfo` ต้องว่าง · ตั้ง `secret_token` = `TELEGRAM_WEBHOOK_SECRET` · `allowed_updates=["callback_query"]` · ชี้ `https://test.my-ener.uk/telegram/webhook` เท่านั้น (ไม่ใช่ scan.my-ener.uk)

## 5. checklist ก่อน GO Pro (คืนข้อที่เคยตกหล่น)
1. **nginx private-token masking** (จาก `docs/ai/plans/2026-09-23-codex-approval-hardening.md`): snippet `ops/nginx/private-token-access-log.conf` + `scripts/ops/test-private-token-nginx.mjs` (nginx:alpine network=none) · ตอนนี้ nginx ใช้ `access_log /var/log/nginx/access.log` format เริ่มต้น → ลิงก์ `/myscans/<token>` และ `/r/<token>` ลง log เต็ม (เห็นในการตรวจ 30 ก.ย.) · nginx **แชร์กับ Pro** → apply/`nginx -t`/reload ต้องขออนุมัติแยก · ลำดับ: รัน test script ในระบบแยก → backup config → include snippet + เปลี่ยน access_log เฉพาะ server `test.my-ener.uk` ก่อน → `nginx -t` → reload (อนุมัติ) → ยิง token สังเคราะห์ตรวจ log → แล้วค่อย server Pro (อนุมัติแยก)
2. Telegram approval: ข้อ 1–4 ข้างบน + เทสต์สด ค. ผ่าน
3. กำไล/หินบนมือถือ (ภาพจากกบ) · ลูกค้าใหม่ผ่าน LINE จริง = NOT TESTED (ระบุเป็นข้อจำกัดใน GO)
4. กบตัดสิน: กติกาซื้อแพ็กซ้ำ · วัน D ประกาศ 3 วัน · ยืนยัน trial ON บน staging ตั้งใจ
5. Pro: preflight → 057→061→062→063→064→065 → verify md5 → deploy โค้ด → สวิตช์ OFF จนประกาศ+72 ชม.+อนุมัติ · nginx Pro แยก
