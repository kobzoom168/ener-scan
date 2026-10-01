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
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32` (64 ตัว 0-9a-f — Telegram อนุญาตเฉพาะ `A-Z a-z 0-9 _ -` ยาว 1–256; **ห้าม base64** เพราะมี `= + /`) สร้างบนเครื่องกบ/เซิร์ฟเวอร์ ไม่ผ่านแชท | ค่าเดียวกับ `secret_token` ตอน `setWebhook` · ตรวจรูปแบบโดยไม่พิมพ์ค่า: `grep -cE '^TELEGRAM_WEBHOOK_SECRET=[A-Za-z0-9_-]{32,256}$' .env` ต้องได้ 1 |
| `TELEGRAM_SLIP_APPROVAL_ENABLED` | **`false`** ไว้ก่อน | เปิดเป็น `true` เฉพาะเมื่อกบอนุมัติ "เปิด" แยกอีกรอบ |
วิธีตรวจว่าค่าครบโดยไม่พิมพ์ค่า: `grep -cE "^TELEGRAM_(APPROVAL_BOT_TOKEN|APPROVAL_CHAT_ID|APPROVER_USER_IDS|WEBHOOK_SECRET|SLIP_APPROVAL_ENABLED)=." .env` ต้องได้ 5

## 2. บริการที่ต้อง recreate เพื่อรับ env (compose ใช้ `env_file: .env` — แก้ไฟล์แล้ว **restart อย่างเดียวไม่รับค่าใหม่** ต้อง recreate)
| บริการ (compose) | container | ทำไม | image ที่ต้องคง (ตรวจก่อน recreate) |
|---|---|---|---|
| `ener-scan` | `ener-scan-staging` | รับ `POST /telegram/webhook` + ส่งข้อความสลิป "รอตรวจ" พร้อมปุ่ม (`adminPaymentSlipNotify` → `notifyTelegramSlipPendingVerify`) — **บริการเดียวที่อ่าน config Telegram** | `ener-scan-staging-ener-scan` full ID `sha256:980009f63eab…` (อ่านเต็มด้วย `docker inspect -f '{{.Image}}' ener-scan-staging` ตอนทำจริง) |
| `worker-maintenance` | — | `runPaymentGrantNotifySweep` ไม่ใช้ตัวแปร Telegram → **ไม่ recreate** (ตัดจากแผนเดิม) | ไม่แตะ |
| `worker-scan`, `worker-delivery`, `postgrest`, `redis` | — | ไม่เกี่ยว | ไม่แตะ |
ขั้นตอน (เมื่ออนุมัติ): 1) `IMG=$(docker inspect -f '{{.Image}}' ener-scan-staging)` และ `TAG=$(docker inspect -f '{{.Config.Image}}' ener-scan-staging)` → ยืนยันว่า `docker image inspect -f '{{.Id}}' "$TAG"` **เท่ากับ `$IMG` ก่อนรัน** (ถ้าไม่เท่า = tag ถูก build ทับ → หยุด ไม่ recreate) 2) `cd /root/ener-scan-staging && docker compose up -d --no-build --pull never --no-deps --force-recreate ener-scan` 3) หลังรัน `docker inspect -f '{{.Image}}' ener-scan-staging` ต้อง = `$IMG` และ runtime hash = `1094347` (ไม่ใช่ตรวจพบว่าเปลี่ยนทีหลัง — ข้อ 1 คือตัวผูก) 4) `/health` 200 · `/telegram/webhook` ยัง 404 ตราบที่ `ENABLED=false` · ไม่ใช้ `/root/deploy-ener.sh` (build+`up --build` เสมอ)
**ย้อนกลับ:** ลบ/คอมเมนต์ 5 บรรทัดใน `.env` → คำสั่งเดิมข้อ 2 (image เดิม `$IMG`) → `/telegram/webhook` 404 · ไม่มี DB เปลี่ยน · backup `.env` ก่อนแก้: `cp -p .env .env.bak-$(date +%F)` (chmod 600 ไม่ย้ายออกนอกเครื่อง)
ห้าม: แตะ `/root/ener-scan-pro` · แตะ bot กลาง (`TELEGRAM_BOT_TOKEN`) · `setWebhook` ของ bot เดิม/Pro
**หมายเหตุโค้ด (พบจาก harness 1 ต.ค.):** app.js ไม่มี JSON parser ก่อน `createTelegramWebhookRouter()` (มีแต่ `express.urlencoded`) → `req.body` ว่าง → **ทุก callback ถูกตอบ `ignored`** = ปุ่มใน Telegram ไม่มีผลเลยในของจริง · แก้แล้วใน router (parser `express.json` เฉพาะ path `/telegram/webhook`, commit แยก) · **staging runtime `1094347` ยังไม่มี fix นี้** → ก่อนทดสอบสดต้อง deploy SHA ที่มี fix (ไม่ใช่แค่ recreate image เดิม) — ต้องขออนุมัติ deploy staging แยก

## 3. รายการทดสอบสังเคราะห์ — แยกสองความหมายให้ชัด
- **"คำขอถูก denied"** = ระบบปฏิเสธ *การกด* (ผู้กดไม่อยู่ในรายชื่อ / ผิดห้อง / ผิด secret / ปุ่มหมดอายุ / token ใช้แล้ว / รายการ stale) — รายการ `payments` **ไม่เปลี่ยนสถานะ** มีแต่ audit
- **"เจ้าหน้าที่ปฏิเสธสลิป"** (เปลี่ยน `payments.status` → `rejected` + แจ้งลูกค้า) — **ยังไม่มีใน Telegram handler** (รองรับแค่ `ap:` ขออนุมัติ และ `cf:` ยืนยันอนุมัติ; ปุ่มอื่น → "ปุ่มนี้ไม่รองรับ") · ทำได้ทางเว็บ admin เดิมเท่านั้น · ถ้าต้องการใน Telegram = งานใหม่ ต้องเสนอขอบเขตก่อน (ปุ่ม `rj:` + token แบบเดียวกับ cf + `rejectPayment` ผ่าน store เดิม + audit + ข้อความแจ้งลูกค้า) — **ไม่รวมในรอบนี้ ไม่รายงานว่าพร้อม**
**ก. มีอยู่แล้ว (ชี้หลักฐาน):** `scripts/ops/test-payment-approval-db.mjs` (RPC 061–063: เติมครั้งเดียว · 5 concurrent · audit rollback · retry · stale snapshot · outbox crash dedupe · PUBLIC denied) + `tests/telegramSlipApproval.behavior.test.js` (denied ทุกแบบ · stale · เว็บอนุมัติก่อน · DB/แจ้ง/audit/Telegram ล้ม · ไม่มี GET · ไม่รั่ว token) + `paymentApprovalHardening.test.js` — ใน gate ✅
**ข. ใหม่ (1 ต.ค.) `scripts/ops/test-telegram-approval-integration.mjs`** — router+handler+RPC จริงใน Postgres (schema staging) + PostgREST · Telegram API ตัดจบในเครื่อง (บันทึก method/body) · network guard · config ค่าทดสอบ: flag ปิด=404 · secret ผิด=401 ไม่แตะ DB · อัปเดตไม่ใช่ปุ่ม=ignored · **regression: callback JSON ต้องถูก parse** · แจ้งสลิป → ปุ่ม `ap:` + audit · denied (user/chat) + audit, รายการไม่เปลี่ยน · ขั้น 1 ออก `cf:` ไม่เปลี่ยนสถานะ · ขั้น 2 → paid + grant 1 + audit `approve_confirmed:ok` 2 แถวโดยดีไซน์ (RPC ใน transaction เดียวกับ grant + handler หลังแจ้งลูกค้า) + ข้อความลูกค้า **ถูกกักใน `outbound_messages` (queued) ไม่ส่ง LINE** · กดซ้ำ/ap ซ้ำ=stale ไม่เติมซ้ำ · sweep ไม่สร้างแถวซ้ำ · 3 concurrent → grant 1 · หมดอายุ/ยอดเปลี่ยน → ไม่เติม · `rj:` → ไม่รองรับ (ช่องว่างฟีเจอร์) · blocked=0 ไม่มี token/secret ใน log
**ค. บน staging หลังเปิด flag (รอบอนุมัติแยก, ต้องมี fix parser deploy ก่อน):** รายการ `pending_verify` สังเคราะห์ (UID สังเคราะห์ที่ **ถูกแบนไว้ก่อน** — ดูข้อ 4) → ข้อความเข้า Telegram ห้องทดสอบ → ผู้อนุมัติกดใน Telegram จริง (ไม่ login เว็บ · ระบบตรวจ numeric id + chat + secret ทุกครั้ง) → ตรวจ grant 1 / audit / token ใช้แล้ว / กดซ้ำ stale / คนนอกกด denied · outbound ของรายการต้องเป็น `suppressed_banned` ไม่ใช่ `sent`

## 4. กันข้อความแจ้งผลหลุดไปหาลูกค้าจริง (ไม่พึ่ง LINE ตอบ 400)
- **ระบบแยก:** ข้อความ "เติมสิทธิ์แล้ว" ถูกเขียนลง `outbound_messages` (kind `approve_notify`, `queued`) และ **ไม่มี delivery worker** → อ่านตรวจจากแถวได้เลย ไม่ยิง LINE (harness ข ยืนยัน + guard บล็อกทุกการออกนอก)
- **staging สด:** ใช้กลไกเดิมที่มีอยู่ **ban gate ของ delivery** (`wrapClientWithBanGuard` เช็ค `banned_users` ก่อน `pushMessage` ทุก kind → outbound ถูก mark `suppressed_banned` ไม่ retry ไม่ส่ง): ก่อนสร้างรายการทดสอบ ให้แบน UID สังเคราะห์ด้วย `banUser({ lineUserId, reason: "it-telegram-test", bannedBy: "ops" })` (หรือ insert `banned_users` source `manual`) → notifier enqueue → delivery mark `suppressed_banned` → ตรวจ `select kind,status from outbound_messages where line_user_id='<UID สังเคราะห์>'` = `approve_notify|suppressed_banned` · ไม่มี retry ค้าง ไม่กระทบรายการจริง · ไม่เพิ่มทางข้ามการตรวจสิทธิ์ (เป็น gate เดิมของ Codex รอบ 4) · ปลดแบน/ลบ UID สังเคราะห์หลังจบ
- ถ้าพบว่า ban gate ไม่ครอบ kind `approve_notify` ตอนทำจริง (ตรวจ log `suppressed_banned` ก่อน) → **หยุดและขอเลือกวิธี** (เช่น หยุด `worker-delivery` ชั่วคราวเฉพาะช่วงทดสอบ ซึ่งกระทบการส่งอื่นของ staging) — ไม่ใช้ UID ปลอมแล้วหวังให้ LINE ตอบ 400
- ห้ามสร้าง `pending_verify` ให้บัญชีจริง/บัญชีกบ (ถ้ากบต้องการ end-to-end ด้วยบัญชีตัวเอง = เติมสิทธิ์จริงบน staging ต้องขออนุมัติผลกระทบ+บันทึกยอดก่อน/หลัง)
- ข้อความเข้า Telegram ไปเฉพาะ `TELEGRAM_APPROVAL_CHAT_ID` ของ bot ใหม่ (ห้องทดสอบ) · ก่อน `setWebhook` ของ bot ใหม่: `getWebhookInfo` ต้องว่าง · `secret_token` = `TELEGRAM_WEBHOOK_SECRET` · `allowed_updates=["callback_query"]` · URL `https://test.my-ener.uk/telegram/webhook` เท่านั้น

## 5. checklist ก่อน GO Pro (คืนข้อที่เคยตกหล่น)
1. **nginx private-token masking** (จาก `docs/ai/plans/2026-09-23-codex-approval-hardening.md`): snippet `ops/nginx/private-token-access-log.conf` + `scripts/ops/test-private-token-nginx.mjs` (nginx:alpine network=none) · ตอนนี้ nginx ใช้ `access_log /var/log/nginx/access.log` format เริ่มต้น → ลิงก์ `/myscans/<token>` และ `/r/<token>` ลง log เต็ม (เห็นในการตรวจ 30 ก.ย.) · nginx **แชร์กับ Pro** → apply/`nginx -t`/reload ต้องขออนุมัติแยก · ลำดับ: รัน test script ในระบบแยก → backup config → include snippet + เปลี่ยน access_log เฉพาะ server `test.my-ener.uk` ก่อน → `nginx -t` → reload (อนุมัติ) → ยิง token สังเคราะห์ตรวจ log → แล้วค่อย server Pro (อนุมัติแยก)
2. Telegram approval: ข้อ 1–4 ข้างบน + deploy fix parser บน staging (อนุมัติแยก) + เทสต์สด ค. ผ่าน · "ปฏิเสธสลิปใน Telegram" = ยังไม่มี (ระบุใน GO)
3. กำไล/หินบนมือถือ (ภาพจากกบ) · ลูกค้าใหม่ผ่าน LINE จริง = NOT TESTED (ระบุเป็นข้อจำกัดใน GO)
4. กบตัดสิน: กติกาซื้อแพ็กซ้ำ · วัน D ประกาศ 3 วัน · ยืนยัน trial ON บน staging ตั้งใจ
5. Pro: preflight → 057→061→062→063→064→065 → verify md5 → deploy โค้ด → สวิตช์ OFF จนประกาศ+72 ชม.+อนุมัติ · nginx Pro แยก
