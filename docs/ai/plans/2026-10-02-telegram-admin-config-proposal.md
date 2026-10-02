# ตั้งค่า Telegram อนุมัติสลิปผ่านหน้า Admin — ไม่ต้องแก้ `.env` เอง · 2 ต.ค. 2026 (แบบที่แก้ตาม 5 ข้อ Codex → **implemented ในระบบแยก**)

สถานะ: **โค้ด+เทสต์เสร็จในระบบแยก ยังไม่ apply/deploy staging** (รอ Codex ตรวจ SHA + ภาพหน้า Admin) · Codex เลือกพัก live แบบไฟล์ รอหน้า Admin บน staging · bot `@ener_kob_approval_test_bot` ตัวเดียว + ผู้อนุมัติ 2 คน (Telegram User ID) · บันทึกค่า ≠ เปิดใช้งาน · ไม่แตะ Pro/bot กลาง · งานเมนูฟรีตั้งเวลาพักไว้

## 0. หน้านี้ตั้งค่า "ระบบไหน" — ตัดความสับสนก่อน
| ระบบ | ที่มา config วันนี้ | หลังทำหน้า Admin |
|---|---|---|
| **ระบบทดสอบแยก (วิธี A, SHA `e35f18e`)** — Postgres/PostgREST ใช้แล้วทิ้ง ไม่มี delivery | ไฟล์ `/root/ener-tg-live/.env.tg-live` (600) | **ยังใช้ไฟล์เดิม** (ระบบแยกไม่มีหน้า Admin/ไม่มี DB ถาวร) — หรือทางเลือก A2 ด้านล่าง |
| **staging (`test.my-ener.uk`)** — แอปจริง DB staging | ยังไม่มี config (endpoint 404) | **หน้า `/admin/telegram-approval` บน staging** เขียนลง DB staging · badge "Environment: staging · host test.my-ener.uk" เหมือนหน้า `/admin/free-trial` |
| **Pro (`scan.my-ener.uk`)** | ไม่มี | หน้าเดียวกันบน Pro (ภายหลัง GO เท่านั้น) — ค่าแยกคนละ DB · bot คนละตัวกับ staging ตามกติกาเดิม |
ข้อดีสำคัญ: **ไม่ต้องแก้ `.env` และไม่ต้อง recreate container** อีกต่อไป (เฟส 2b เดิม) เพราะ config อ่านจาก DB สดทุกครั้ง (cache 30 วิ) — เฟส 2a (deploy โค้ดที่มี parser fix + หน้า Admin) ยังจำเป็น
**A2 (ทางเลือกสำหรับระบบแยก):** harness โหมด `--live` รับ `--config-from-admin-export` ไม่ทำ — เพราะต้องส่งออก token จาก staging ไปไฟล์ = ความเสี่ยงเท่ากับแก้ไฟล์เอง · แนะนำ: ทดสอบระบบแยก 1 รอบด้วยไฟล์ (ครั้งเดียว) แล้วทุกอย่างหลังจากนั้นผ่านหน้า Admin

## 1. ที่เก็บ config (DB) — ปลอดภัยแม้แอปใช้ anon key ของ PostgREST (แก้ข้อ 1 Codex: สิทธิ์ RPC ชัดเจน)
- แอปคุย PostgREST ด้วย **anon key (role `web_anon`)** ทั้งระบบ → ห้ามเก็บ token แบบ plaintext ในตารางที่ `web_anon` อ่านได้
- **ตาราง `telegram_approval_settings`** (singleton `id=1`): `bot_token_enc text` · `webhook_secret_enc text` · `chat_id text` · `approvers jsonb` (`[{"label":"กบ","tg_user_id":"111…"},{"label":"…","tg_user_id":"222…"}]`) · `enabled boolean default false` · `token_set_at` · `webhook_set_at` (null จนกว่าจะกดตั้ง webhook จริงในรอบอนุมัติแยก) · `updated_at` · `updated_by` · **REVOKE ALL จาก PUBLIC/web_anon** (แบบเดียวกับ 061: ตาราง token/audit) เข้าถึงผ่าน RPC SECURITY DEFINER เท่านั้น
- **เข้ารหัสที่แอปก่อนเขียน**: AES-256-GCM key จาก env ใหม่ `TELEGRAM_CONFIG_KEY` (32 ไบต์ hex, ตั้งครั้งเดียวต่อ environment โดย ops ไม่ใช่กบ) · ไม่ใช้ `SESSION_SECRET` ร่วม · DB เก็บ `v1:<iv>:<tag>:<cipher>` · ไม่มี key = ฟีเจอร์ปิด (หน้าแสดง "ยังตั้ง TELEGRAM_CONFIG_KEY ไม่ได้ — ติดต่อ ops")
- **RPC** (`sql/066_telegram_approval_settings.sql`, idempotent): `telegram_settings_get_public()` (ไม่มี ciphertext ให้หน้า Admin) · `telegram_settings_get_secrets()` (ciphertext ให้ service; decrypt ที่แอป) · `telegram_settings_save(...)` (null = คงเดิม + audit `admin_config/telegram_settings_saved` ไม่มีค่า) · `telegram_settings_set_enabled(bool, actor)` แยก (รอบอนุมัติเปิด)
- **สิทธิ์ (ข้อ 1):** role ใหม่ **`telegram_config_admin`** (NOLOGIN, GRANT ให้ `authenticator`) เป็น role เดียวที่ EXECUTE RPC ทั้ง 4 ได้ · **REVOKE จาก PUBLIC, web_anon และ service_role** (ตารางก็เช่นกัน) · แอปเรียกด้วย client แยก (`telegramConfig.store.js::configDbClient`) ใช้ JWT ของ role นี้จาก env `TELEGRAM_CONFIG_DB_KEY` (ops เซ็นด้วย `PGRST_JWT_SECRET`) — client anon เดิมของแอปเรียกไม่ได้ · หน้า Admin เรียก store ผ่าน backend หลัง login+CSRF เท่านั้น · preflight เพิ่มแถว `066 web_anon cannot EXECUTE` / `only telegram_config_admin` / `table not readable` · harness ข้อ 11 พิสูจน์ web_anon และ service_role เรียกตรงได้ 401/403
- preflight เพิ่มแถว `066 telegram_approval_settings` + md5 reference · rollback: `DROP TABLE` + ฟังก์ชัน → ระบบกลับไปอ่าน env (ปิดอยู่)

## 2. เชื่อมกับระบบเดิม (ลำดับที่มา config) — แก้ข้อ 2+3 Codex
`resolveTelegramApprovalConfig()` (async) · `readTelegramApprovalConfig()` เดิมคงไว้ (env อย่างเดียว):
1. **authority = env** เมื่อ `TELEGRAM_SLIP_APPROVAL_ENABLED` หรือ `TELEGRAM_APPROVAL_BOT_TOKEN` ถูกตั้ง (ไม่ว่าง) → ใช้ env อย่างเดียว · **`ENABLED=false` ชัดเจน = ปิด ไม่ fallback ไป DB** (ข้อ 2) · หน้า Admin แสดง "ควบคุมโดย config เซิร์ฟเวอร์ (env) — ค่าในหน้านี้ไม่มีผล" และ **ปฏิเสธการบันทึก (409)**
2. **authority = db** (env ว่าง) → **อ่าน DB สดทุกครั้ง ไม่มี cache** (ข้อ 3: ถอนผู้อนุมัติ/ปิดใช้งานมีผลกับปุ่มเดิมทันที) → ต้อง `enabled=true` + ครบ จึงคืน config · ไม่ครบ/ปิด = `null` = 404 เดิม · **อ่านไม่ได้ (RPC ล้ม/credential ผิด) = โยน error → router 503 / handler ปฏิเสธ "ตรวจสอบสิทธิ์ไม่ได้" + audit `config_unavailable` ไม่ใช้ค่าเก่า**
3. ops ยังไม่ตั้ง `TELEGRAM_CONFIG_KEY`/`TELEGRAM_CONFIG_DB_KEY` → ปิด (หน้า Admin บอกให้ ops ตั้ง)
- ผู้เรียกที่เปลี่ยน: `notifyTelegramSlipPendingVerify` · `handleApprovalCallback` · router — ทุกจุด `await resolve` สด · ตรวจ **numeric user id + chat id ทุกครั้ง** คงเดิม · 2 คนกดพร้อมกัน = token ใช้ครั้งเดียว + RPC atomic → เติมครั้งเดียว (harness 13) · เทสต์เดิมที่ฉีด `deps.config` ไม่เปลี่ยน
- `webhook_secret` สร้างฝั่งเซิร์ฟเวอร์ตอนบันทึกครั้งแรก (`randomBytes(32).hex`) · ไม่แสดง ไม่ให้กรอก · ใช้ตอน "ตั้ง webhook" (ปุ่มแยก รออนุมัติ)

## 3. หน้า Admin `/admin/telegram-approval` (router ใหม่ `adminTelegramApproval.routes.js` แบบเดียวกับ `adminFreeTrial.routes.js`)
- `requireAdminSession` + CSRF token ใน session (`req.session.telegramCfgCsrf`) + ตรวจ timing-safe
- ฟอร์ม: **Bot Token** (`type=password`, autocomplete=off, ว่าง = คงเดิม) · **ห้องรับรายการ (Chat ID)** (`^-?\d{3,}$`) · **ผู้อนุมัติ 1/2**: ชื่อเรียก + Telegram User ID (`^\d{5,}$`, ห้ามซ้ำ, ≥1 คน) · ปุ่ม **บันทึกการตั้งค่า**
- **เปลี่ยน Token เมื่อมีอยู่แล้ว** ต้องติ๊ก "ยืนยันเปลี่ยน Token" + พิมพ์ `เปลี่ยน TOKEN` มิฉะนั้นปฏิเสธ (400) · ตรวจรูปแบบ token `^\d{5,}:[A-Za-z0-9_-]{30,}$`
- แสดงสถานะ: **ยังไม่ตั้งค่า** (ไม่มีแถว/ไม่ครบ) · **ตั้งค่าแล้ว — ยังไม่เปิดใช้งาน** (`enabled=false`) · **เปิดใช้งานแล้ว** (`enabled=true`) + "ตั้งค่า Token แล้ว (เมื่อ <เวลา>)" ไม่แสดงค่า/ส่วนใดของ token · Environment + host badge
- **ไม่ส่ง token/secret กลับใน HTML/API/log** (ฟอร์มส่งค่าใหม่ทางเดียว) · ไม่ใช้ URL query/localStorage · audit ทุกการบันทึก (ใคร/เมื่อไร/ฟิลด์ไหน) ไม่มีค่า
- ปุ่มที่ **ยังไม่ทำในรอบนี้** (แสดงเป็นปุ่มปิด + ข้อความ "ต้องอนุมัติแยก"): "เปิดใช้งาน" · "ตั้ง webhook กับ Telegram" · "ส่งข้อความทดสอบเข้าห้อง" — บันทึกค่าไม่ setWebhook ไม่ส่งข้อความ ไม่เปิด flag อัตโนมัติ
- สิทธิ์: เฉพาะ admin session (login เดิม) · การเป็นผู้อนุมัติใน Telegram **ไม่ให้สิทธิ์** แก้ config (คนละระบบ ไม่มีการเชื่อม)

## 4. เทสต์ที่จะทำ
- unit: encrypt/decrypt roundtrip + key ผิด = ล้ม · ลำดับที่มา config (env > DB · DB ปิด = null) · ฟอร์ม: ไม่ login=302/401 · CSRF ผิด=403 · token ว่าง=คงเดิม · เปลี่ยน token ไม่ยืนยัน=400 · รูปแบบผิด=400 · HTML/JSON ไม่มี token/secret · audit ไม่มีค่า
- integration (harness เดิม): ใส่แถว settings ใน DB ใช้แล้วทิ้ง (ไม่ตั้ง env) → router/handler ทำงานด้วย config จาก DB เหมือน env ทุกสถานการณ์ 12 ข้อ · 2 ผู้อนุมัติกดพร้อมกัน → grant 1
- gate ✅ · ไม่แตะ staging/Pro จนอนุมัติ deploy

## 5. ลำดับ (แก้ข้อ 4+5 Codex: migration ก่อน deploy · rollback ห้าม DROP)
1. **โค้ด+เทสต์ (ทำแล้วในระบบแยก)** → Codex ตรวจ SHA + ภาพหน้า Admin
2. **ops เตรียม key บน staging (ครั้งเดียว ไม่ใช่กบ):** `TELEGRAM_CONFIG_KEY=$(openssl rand -hex 32)` และ `TELEGRAM_CONFIG_DB_KEY=<JWT role telegram_config_admin เซ็นด้วย PGRST_JWT_SECRET ของ staging>` ใน `/root/ener-scan-staging/.env` (ต้อง recreate `ener-scan` ให้รับ env — ครั้งนี้ครั้งเดียว ทำพร้อม deploy ข้อ 4) · ห้ามตั้ง `TELEGRAM_SLIP_APPROVAL_ENABLED`/`TELEGRAM_APPROVAL_BOT_TOKEN` ใน env (จะกลายเป็น env authority)
3. **apply `sql/066` บน staging (อนุมัติแยก):** preflight ก่อน (แถว 066 = f) → `psql -v ON_ERROR_STOP=1 -f sql/066…` → preflight หลัง (066 ทุกแถว t รวม `web_anon cannot EXECUTE`, `enabled=false`) → `verify-migration-versions.sh` md5 18/18 → `NOTIFY pgrst`
4. **deploy โค้ด staging (อนุมัติแยก)** SHA ที่มี parser fix + หน้า Admin → ฟีเจอร์ยังปิด (ไม่มีแถว / enabled=false) → `POST /telegram/webhook` = 404 · `/admin/telegram-approval` เปิดได้หลัง login แสดง "ยังไม่ตั้งค่า"
5. **กบกรอกบนหน้า Admin** (bot ตัวเดียว + ผู้อนุมัติ 2 คน) → สถานะ "ตั้งค่าแล้ว — ยังไม่เปิดใช้งาน" → **ยังไม่มีอะไรส่งออก**
6. **รอบอนุมัติแยก:** `set_enabled(true)` + setWebhook เฉพาะ bot ใหม่ (ปุ่มในหน้า Admin ยังปิดอยู่ — ทำผ่าน ops/สคริปต์ที่ตรวจแล้ว) + ทดสอบส่งจริงพร้อมแผนกัก outbound ที่ตกลง (ban gate ไม่นับ)

**Rollback (ข้อ 5): ห้าม `DROP TABLE`** — ปิดด้วย `telegram_settings_set_enabled(false)` (หรือปล่อย enabled=false) + ย้อนโค้ด · ตาราง/ciphertext/audit คงอยู่ · โค้ดเก่าอ่าน env เท่านั้น และ env บน staging ไม่มี TELEGRAM_APPROVAL_* → ปิด **ไม่เผลอเปิด bot จาก env** · ถ้าต้องเพิกถอน key: หมุน `TELEGRAM_CONFIG_KEY` ทำให้ ciphertext เดิมถอดไม่ได้ → หน้า Admin ให้กรอก token ใหม่ (ไม่ลบแถว)

## 6. ผลเทสต์ในระบบแยก (2 ต.ค.)
- unit `tests/telegramConfig.behavior.test.js` 7/7 (ใน gate): crypto roundtrip/key ผิด/ciphertext เพี้ยน/readiness (placeholder ไม่ใช่ key) · authority env (ENABLED=false ไม่ fallback) / db / ops ไม่ตั้ง key = ปิด / อ่านล้ม throw · handler: อ่านล้ม → "ตรวจสอบสิทธิ์ไม่ได้" ไม่อนุมัติ + audit · ถอน 222 → denied · หน้า Admin: ไม่ login 302 · CSRF 403 · ครั้งแรกไม่มี token 400 · บันทึก 303 · token ว่าง=คงเดิม · เปลี่ยนไม่ยืนยัน 400 ไม่เรียก store · env authority → banner + 409 · ops ไม่ตั้ง key → 503 · HTML/log ไม่มี token · store ตรวจรูปแบบก่อนเข้ารหัส + RPC ได้ ciphertext เท่านั้น
- harness `scripts/ops/test-telegram-approval-integration.mjs` (Postgres+PostgREST จริง, 066 apply ซ้ำได้): 11 web_anon และ service_role เรียก RPC config ตรง → 401/403 · 12 บันทึกผ่าน store → DB มี ciphertext เท่านั้น, enabled=false → 404, audit ไม่มีค่า · 13 เปิด → 2 ผู้อนุมัติ ขั้น 1/2 → paid grant 1, 3 กดพร้อมกันเติมครั้งเดียว, ตอบไปห้องจาก DB · 14 ถอน 222 → ปุ่มเดิม denied ทันที, 111 ได้, token คงเดิม · 15 credential store ใช้ไม่ได้ → 503 ไม่เติม, กลับมาแล้ว token เดิมใช้ได้ · 16 env ENABLED=false + DB เปิด → 404 ไม่ fallback, set_enabled(false) → 404 · 17 ไม่มี token/secret ของ DB ใน log/ตอบกลับ — ดู exact SHA/ผลในรายงาน
- **แก้ 3 จุดจากรีวิว `4a88d4c` (Codex):** (1) หน้า config ใช้ **session login เท่านั้น** (`requireAdminSessionOnly` ใหม่ — ไม่รับ legacy `x-admin-token`/`?token`/body token; หน้าอื่นยังใช้ `requireAdminSession` เดิม) + CSRF POST · เทสต์ผ่าน middleware จริง (ไม่ mock) (2) ข้อความหลังบันทึกยึดสถานะจริง: OFF = "ยังไม่เปิดใช้งาน" · ON = "เปิดใช้งานอยู่ … การบันทึกไม่ได้เปลี่ยนสวิตช์ แต่ Chat ID/ผู้อนุมัติที่แก้มีผลกับระบบที่เปิดอยู่ทันที" · regression ON/OFF (3) `readTelegramApprovalConfig(envSrc)` อ่านแหล่งเดียวกับ `resolveTelegramApprovalConfig({env})` (เดิม resolve ใช้ env ที่ส่งมาเลือก authority แต่ read อ่าน process.env — บั๊ก DI/เทสต์ ไม่ใช่ production) · เทสต์ env ส่งมาปิด+process.env เปิด → ปิด และสลับกัน
- ภาพหน้า Admin 4 สถานะ (render จาก router จริง + store จำลอง, ไม่มีค่าจริง): artifact ในรายงาน
