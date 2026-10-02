# ข้อเสนอ (ก่อนลงมือ): ตั้งค่า Telegram อนุมัติสลิปผ่านหน้า Admin — ไม่ต้องแก้ `.env` เอง · 2 ต.ค. 2026

สถานะ: **ข้อเสนอเท่านั้น ยังไม่เขียนโค้ด** · bot `@ener_kob_approval_test_bot` ตัวเดียว + ผู้อนุมัติ 2 คน (Telegram User ID) · บันทึกค่า ≠ เปิดใช้งาน · ไม่แตะ Pro/bot กลาง · งานเมนูฟรีตั้งเวลาพักไว้

## 0. หน้านี้ตั้งค่า "ระบบไหน" — ตัดความสับสนก่อน
| ระบบ | ที่มา config วันนี้ | หลังทำหน้า Admin |
|---|---|---|
| **ระบบทดสอบแยก (วิธี A, SHA `e35f18e`)** — Postgres/PostgREST ใช้แล้วทิ้ง ไม่มี delivery | ไฟล์ `/root/ener-tg-live/.env.tg-live` (600) | **ยังใช้ไฟล์เดิม** (ระบบแยกไม่มีหน้า Admin/ไม่มี DB ถาวร) — หรือทางเลือก A2 ด้านล่าง |
| **staging (`test.my-ener.uk`)** — แอปจริง DB staging | ยังไม่มี config (endpoint 404) | **หน้า `/admin/telegram-approval` บน staging** เขียนลง DB staging · badge "Environment: staging · host test.my-ener.uk" เหมือนหน้า `/admin/free-trial` |
| **Pro (`scan.my-ener.uk`)** | ไม่มี | หน้าเดียวกันบน Pro (ภายหลัง GO เท่านั้น) — ค่าแยกคนละ DB · bot คนละตัวกับ staging ตามกติกาเดิม |
ข้อดีสำคัญ: **ไม่ต้องแก้ `.env` และไม่ต้อง recreate container** อีกต่อไป (เฟส 2b เดิม) เพราะ config อ่านจาก DB สดทุกครั้ง (cache 30 วิ) — เฟส 2a (deploy โค้ดที่มี parser fix + หน้า Admin) ยังจำเป็น
**A2 (ทางเลือกสำหรับระบบแยก):** harness โหมด `--live` รับ `--config-from-admin-export` ไม่ทำ — เพราะต้องส่งออก token จาก staging ไปไฟล์ = ความเสี่ยงเท่ากับแก้ไฟล์เอง · แนะนำ: ทดสอบระบบแยก 1 รอบด้วยไฟล์ (ครั้งเดียว) แล้วทุกอย่างหลังจากนั้นผ่านหน้า Admin

## 1. ที่เก็บ config (DB) — ปลอดภัยแม้แอปใช้ anon key ของ PostgREST
- แอปคุย PostgREST ด้วย **anon key (role `web_anon`)** ทั้งระบบ → ห้ามเก็บ token แบบ plaintext ในตารางที่ `web_anon` อ่านได้
- **ตาราง `telegram_approval_settings`** (singleton `id=1`): `bot_token_enc text` · `webhook_secret_enc text` · `chat_id text` · `approvers jsonb` (`[{"label":"กบ","tg_user_id":"111…"},{"label":"…","tg_user_id":"222…"}]`) · `enabled boolean default false` · `token_set_at` · `webhook_set_at` (null จนกว่าจะกดตั้ง webhook จริงในรอบอนุมัติแยก) · `updated_at` · `updated_by` · **REVOKE ALL จาก PUBLIC/web_anon** (แบบเดียวกับ 061: ตาราง token/audit) เข้าถึงผ่าน RPC SECURITY DEFINER เท่านั้น
- **เข้ารหัสที่แอปก่อนเขียน**: AES-256-GCM key จาก env ใหม่ `TELEGRAM_CONFIG_KEY` (32 ไบต์ hex, ตั้งครั้งเดียวต่อ environment โดย ops ไม่ใช่กบ) · ไม่ใช้ `SESSION_SECRET` ร่วม · DB เก็บ `v1:<iv>:<tag>:<cipher>` · ไม่มี key = ฟีเจอร์ปิด (หน้าแสดง "ยังตั้ง TELEGRAM_CONFIG_KEY ไม่ได้ — ติดต่อ ops")
- **RPC** (`sql/066_telegram_approval_settings.sql`, idempotent): `telegram_settings_get_public()` → `{configured, enabled, chat_id, approvers(label+id), token_set_at, webhook_set_at, updated_at}` **ไม่มี ciphertext** (ให้หน้า Admin) · `telegram_settings_get_secrets()` → ciphertext เท่านั้น (ให้ service ตอน runtime; decrypt ที่แอป) · `telegram_settings_save(p_chat_id, p_approvers, p_token_enc or null=คงเดิม, p_secret_enc or null=คงเดิม, p_actor)` → บันทึก + เขียน `payment_approval_audit` channel `admin_config` action `telegram_settings_saved` detail `{fields:[...], token_changed:bool}` **ไม่มีค่า secret** · `telegram_settings_set_enabled(bool, actor)` แยกต่างหาก (ใช้ในรอบอนุมัติเปิด)
- preflight เพิ่มแถว `066 telegram_approval_settings` + md5 reference · rollback: `DROP TABLE` + ฟังก์ชัน → ระบบกลับไปอ่าน env (ปิดอยู่)

## 2. เชื่อมกับระบบเดิม (ลำดับที่มา config)
`readTelegramApprovalConfig()` → เปลี่ยนเป็น async `resolveTelegramApprovalConfig()`:
1. **env ครบ 5 ตัว** (ไฟล์ของระบบทดสอบแยก / ops pin) → ใช้ env (พฤติกรรมเดิมทุกอย่าง — harness/เทสต์เดิมไม่เปลี่ยน)
2. ไม่มี env → อ่าน DB ผ่าน RPC (cache 30 วิ, ล้าง cache เมื่อบันทึก) → ต้อง `enabled=true` และครบ (token, chat_id, ≥1 approver, webhook_secret) จึงคืน config · ไม่ครบ/ปิด → `null` = endpoint 404 เหมือนเดิม
- ผู้เรียก 4 จุด: `isTelegramSlipApprovalEnabled` · `notifyTelegramSlipPendingVerify` · `handleApprovalCallback` · router (`svc.readTelegramApprovalConfig()` → `await`) — semantics การตรวจ **numeric user id + chat id ทุกครั้ง** คงเดิม (`authorizeCallback` ใช้ `cfg.approvers` Set จาก DB) · 2 คนกดรายการเดียวพร้อมกัน = token ใช้ครั้งเดียว + RPC atomic → เติมครั้งเดียว (พิสูจน์แล้ว T7/harness)
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

## 5. ลำดับหลังอนุมัติข้อเสนอ
1. โค้ด: `sql/066` + service (`telegramConfig.store.js`, crypto util) + router Admin + เทสต์ → commit แยก → review
2. ops: ตั้ง `TELEGRAM_CONFIG_KEY` ใน staging `.env` (ครั้งเดียว, ops) → **deploy staging** SHA ที่มี parser fix + หน้า Admin (อนุมัติ) → apply 066 (preflight/md5)
3. กบกรอกบนหน้า Admin (login เดิม) → สถานะ "ตั้งค่าแล้ว — ยังไม่เปิดใช้งาน" → **ยังไม่มีอะไรส่งออก**
4. รอบอนุมัติแยก: เปิดใช้งาน + ตั้ง webhook เฉพาะ bot ใหม่ + ทดสอบส่งจริง (พร้อมแผนกัก outbound ที่ตกลง — ban gate ไม่นับ)
ระบบทดสอบแยกรอบ live (ชุด `c0198a9`) ยังทำได้คู่ขนานด้วยไฟล์ secret ครั้งเดียว — หรือข้ามไปรอหน้า Admin บน staging ตามที่กบเลือก
