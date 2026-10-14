# ชุดขออนุมัติ Pro: release/three-tasks `7a5906e` (ตรวจ Pro แบบ read-only 14 ต.ค. 2026 09:30Z) — รอ Codex ตรวจ + กบอนุมัติ · **ยังไม่ apply/deploy · ไม่สร้างกำหนดการ · ไม่ broadcast · Telegram ปิด · คงฟรีรายวันเดิม**

## 0. ขอบเขตรอบนี้
- โค้ด: `release/three-tasks` ที่ **`7a5906e`** (= โค้ดที่ Codex ตรวจและ staging ใช้อยู่; HEAD branch `1780936` ต่างแค่ docs — deploy ใช้ branch HEAD ได้ ตรวจ `git diff 7a5906e HEAD -- ':!docs'` ว่าง)
- DB: apply **8 ไฟล์** `057 → 061 → 062 → 063 → 064 → 065 → 066 → 067` (Pro มี 055/058/059/060 แล้ว)
- หลัง deploy: **นโยบายฟรียังเป็น "ฟรีรายวัน 1 ครั้ง" เท่าเดิม** (057 สวิตช์ OFF, 067 ตั้ง `free_policy.daily_enabled=true`) · Telegram อนุมัติสลิป **ปิด** (ไม่มี `TELEGRAM_CONFIG_*`/`TELEGRAM_SLIP_APPROVAL_ENABLED` บน Pro → authority=db → store ไม่พร้อม → ปิด; `TELEGRAM_BOT_TOKEN/CHAT_ID` เดิมเป็นของ bot แจ้งเตือน ไม่เกี่ยว) · ไม่ตั้งเวลา ไม่ประกาศ — กบเลือกวันและส่งเองหลังขึ้น Pro เรียบร้อย
- โค้ดทั้งชุดมี **หลายส่วนเปลี่ยน** (ดู §2) แม้ไม่เปลี่ยนนโยบายฟรี

## 1. สภาพ Pro ปัจจุบัน (read-only)
| รายการ | ค่า |
|---|---|
| โค้ด | `/root/ener-scan-pro` branch `pro-optout` @ `be67a98` (upstream `origin/pro/optout-be67a98`) · working tree: `docker-compose.yml` แก้บนเครื่อง (ชื่อคอนเทนเนอร์ -pro, พอร์ต 127.0.0.1:3100, network, ตัด dozzle — **ห้าม commit**) + untracked `migrate-*.mjs` 3 ไฟล์เก่า |
| DB `ener_scan_pro` | 319 MB · app_users 624 · scan_jobs 6,187 · outbound_messages 16,184 · payments 399 · scan_results 5,897 |
| migration | 055 ✓ 058 ✓ 059 ✓ 060 ✓ · **057/061/062/063/064/065/066/067 ยังไม่มี** (probe ทุก table/function/column/index ของแต่ละไฟล์ = false) |
| role (cluster-wide) | `web_anon`, `service_role`, `authenticator` ✓ · `telegram_config_admin`, `free_policy_admin` **มีอยู่แล้ว** (role เป็นระดับ cluster — ถูกสร้างตอน apply บน staging) → 066/067 บน Pro จะ GRANT EXECUTE ใน DB นี้เพิ่ม |
| offer | freeQuotaPerDay **1** · แพ็ก 29฿/1/24h, 49฿/4/24h, 399฿/30/30d (active ทั้ง 3) |
| การใช้ 7 วัน / 30 วัน | ฟรี 145 งาน/40 คน · 734 งาน/83 คน · จ่าย 10 งาน · 132 งาน/34 รายการ · paid active ตอนนี้ 2 คน · bonus_scans>0 = 0 คน · ลูกค้าใหม่ 7 วัน 2 / 30 วัน 6 |
| คิว ณ เวลาตรวจ | payments pending_verify 0 · outbound queued/sending 0 · scan_jobs queued/processing 0 |
| preflight (ไฟล์ 7a5906e) | prereq **18/18 t** (รวม `no approve_notify dup (062 uq)` = t → unique index 062 สร้างได้) · applied 057–067 = f ตามคาด ยกเว้นแถวที่ไม่ขึ้นกับ apply (role มีแล้ว / enabled=false / no pending / switches consistent) |
| nginx | `scan.my-ener.uk` → `location /` proxy ทั้งหมด → ไม่ต้องแก้ nginx (route ใหม่ `/admin/free-policy`, `/api/liff/owner-session` วิ่งผ่าน `/` อยู่แล้ว · `/telegram/webhook` ไม่ใช้) |
| .env Pro (ชื่อตัวแปร) | มี `LOCAL_POSTGREST_URL/ANON_KEY`, `POSTGREST_JWT_SECRET`, `SESSION_SECRET`, `ADMIN_TOKEN`, `LIFF_ID`, `NODE_ENV`, `ENABLE_MAINTENANCE_WORKER`, `TELEGRAM_BOT_TOKEN/CHAT_ID` (bot แจ้งเตือนเดิม) · **ไม่มี** `TELEGRAM_CONFIG_KEY`, `TELEGRAM_CONFIG_DB_KEY`, `FREE_POLICY_DB_KEY`, `APP_ENV` |

## 2. diff ทั้งชุด `be67a98..7a5906e`
72 commits · 134 ไฟล์ · +16,999 / −670 · ไม่แตะ `docker-compose*.yml`/Dockerfile/nginx · แตะ `package.json` (manifest test เท่านั้น — ตรวจ: ไม่มี dependency ใหม่ → ถ้ามีจะเห็นตอน build) และ `.env.example`
| พื้นที่ | ไฟล์ | สาระ |
|---|---|---|
| sql | 8 ใหม่ | 057 trial · 061 Telegram token/audit · 062 approve atomic + grants + uq approve_notify · 063 snapshot RPC · 064 bonus จอง/คืนใน DB (trigger scan_jobs) · 065 trial dup evidence · 066 Telegram settings (ciphertext) · 067 free-policy 3 โหมด+ตั้งเวลา+guard app_settings |
| src/services 27 · src/routes 9 · src/templates 5 · src/stores 3 · utils/core/controllers/config/middleware/workers/app.js | | (ก) trial 2 ครั้ง + โหมดฟรี 3 แบบ (`checkScanAccess`, entitlementCopy ข้อความสิทธิ์ชุดเดียว LINE/LIFF, paywall/soft-close/welcome ตามโหมด) (ข) **ปลดคลังเจ้าของทุกเลน** (viewerRole owner/guest, `/api/liff/owner-session`, owner token masking ใน app) (ค) **โบนัสจองที่ INSERT scan_jobs/คืนใน DB** (แก้บั๊กหักไม่ลดยอด — Pro มี path เดียวกัน แต่ bonus>0 = 0 บัญชี) (ง) อนุมัติสลิป atomic ผ่าน RPC 062/063 (admin dashboard ใช้ RPC นี้) + Telegram approval (ปิด) + หน้า `/admin/telegram-approval` (session-only) (จ) DLQ alert dedupe (Redis marker 6 ชม.) (ฉ) หน้า `/admin/free-policy` (session-only) + `/admin/free-trial` → 302/410 (ช) maintenance: sweep_bonus_releases, apply_due free-policy (ข้าม+log ครั้งเดียวถ้าไม่มี key) |
| tests 25 · scripts/ops 27 · docs 16 · ops 3 | | เทสต์/harness/preflight/md5/runbook — ไม่กระทบ runtime |
env ใหม่ที่โค้ดอ้าง (ทั้งหมด optional สำหรับ "คงฟรีรายวัน + Telegram ปิด"): `APP_ENV` (ป้ายหน้า Admin), `FREE_POLICY_DB_KEY`/`TELEGRAM_CONFIG_DB_KEY` (จำเป็นเมื่อกบจะตั้งเวลา/เปลี่ยนโหมดจากหน้า Admin — ดู §5), `TELEGRAM_CONFIG_KEY`, `TELEGRAM_APPROVAL_*`, `TELEGRAM_WEBHOOK_SECRET`, `S3_SLIP_PUBLIC_BASE_URL`/`PAYMENT_SLIP_BUCKET` (fallback ค่าเดิม)

## 3. ผลกระทบต่อลูกค้าจริงเมื่อ deploy (คงฟรีรายวัน)
- **สิทธิ์ฟรี:** เท่าเดิม 1/วัน (`free_policy_mode_now()` = daily) · ไม่มีใครเสียสิทธิ์ · trial ยังไม่เปิด cutoff ยังไม่ตั้ง
- **ข้อความ:** paywall/สถานะสิทธิ์เปลี่ยนเป็นชุด entitlementCopy (โหมด daily ยังพูด "ฟรีวันละ 1 / พรุ่งนี้" ได้) · ปุ่ม "ดูคลังของฉัน"
- **คลัง/รายงานเดิม:** เจ้าของเปิดดูได้โดยไม่ต้องซื้อ (กติกาถาวรงาน 2) — เป็นการ *เพิ่ม* สิทธิ์ ไม่ลด
- **โบนัส:** 0 บัญชีมี bonus → กติกาจอง/คืนไม่มีผลทันที · งาน `free_access_kind` NULL เดิมถูกมองเป็น daily
- **อนุมัติสลิป:** admin dashboard อนุมัติผ่าน RPC `approve_payment_and_grant` (atomic + grant + outbound approve_notify ซ้ำไม่ได้ด้วย uq) · Telegram ปิด · pending_verify ตอนนี้ 0
- **DB เขียนตอน apply:** ALTER TABLE scan_jobs ADD COLUMN `free_access_kind` (nullable, ไม่ rewrite) + index บน scan_jobs(app_user_id) partial · unique index บน outbound_messages (16k แถว, dup=0) · ตารางใหม่ 6 · INSERT app_settings 2 key · ไม่ UPDATE แถวลูกค้าเดิมเลย (UPDATE ทั้งหมดอยู่ในตัวฟังก์ชัน) · ล็อกสั้น ๆ ระดับวินาที — ทำช่วงคิวว่าง
- **โค้ดเก่า+DB ใหม่ (ช่วง blue-green/rollback):** ปลอดภัยตาม T7–T10 ของ 064 · trigger 057/064/067 ปล่อยงานฟรีเดิม (mode daily) · guard app_settings กันแค่ 2 key ที่โค้ดเก่าไม่เขียน

## 4. acceptance ที่ยังเหลือ (บอกตามจริง — Codex ตัดสินว่ารับได้ไหม)
| ข้อ | สถานะ |
|---|---|
| trial ลูกค้าใหม่ e2e ด้วยบัญชี LINE ใหม่จริง | **ไม่เคยทดสอบ** (ทดสอบด้วยบัญชีสังเคราะห์ผ่าน router จริง 8/8 + harness 20/20) — รอบนี้ trial ยังไม่เปิดบน Pro จึงไม่บล็อก deploy แต่บล็อก "เปิด trial" |
| Telegram approval live | staging ผ่านเฉพาะ STG-TG-2 (สองขั้น) · กดซ้ำ/concurrent/denied ไม่ได้ทดสอบจริง · Pro: ปิด ไม่มี key → ไม่บล็อก |
| คลังเจ้าของบนมือถือกบ (กำไล/หิน) | server-side ผ่าน 6 รายงาน · สกรีนช็อตมือถือยังไม่ได้ |
| nginx private-token masking | เสนอแล้ว ยังไม่อนุมัติ (app masking มีแล้ว) |
| หน้า Admin โชว์ Environment=production บน staging | cosmetic — Pro จะโชว์ production ถูกต้อง |
| กติกาซื้อแพ็กซ้ำ | ยังไม่เคาะ ไม่อยู่ในชุดนี้ |
| harness/gate | Codex ยังไม่ได้รันซ้ำเอง (อ้างอิงรายงาน Claude: line 8/8, bonus 20/20, telegram 21/21, gate ✅ ที่ 7a5906e) |

## 5. ops ที่ต้องตัดสินแยก (ไม่ทำในรอบ deploy)
- **key หน้า Admin บน Pro:** หน้า `/admin/free-policy` อ่านได้ทันทีหลัง deploy แต่ **บันทึก/ตั้งเวลาไม่ได้** จนกว่า `.env` Pro มี `FREE_POLICY_DB_KEY` (JWT role `free_policy_admin` เซ็นด้วย `POSTGREST_JWT_SECRET` ของ Pro) · ต้องสร้างบนเซิร์ฟเวอร์โดยสคริปต์ที่อ่านค่าจาก `.env` และเขียนต่อท้าย `.env` **โดยไม่พิมพ์ค่าใด ๆ** + backup `.env` ก่อน + restart app/worker → ขออนุมัติแยกก่อนกบจะตั้งเวลา (ทำได้หลัง deploy)
- ลบ `migrate-*.mjs` untracked เก่า — ไม่ทำ (ไม่จำเป็น)
- `APP_ENV=production` — optional

## 6. ขั้นตอนที่จะทำเมื่อได้ GO + กบอนุมัติ (ทีละขั้น หยุดเมื่อผิดคาด)
0. ช่วงคิวว่าง (pending_verify/queued = 0 เหมือนตอนตรวจ) · กบรับทราบว่า Pro จะ recreate containers (blue-green เว็บไม่ดับ, worker หยุดสั้น ๆ งานค้างถูก sweeper โยนกลับ)
1. **backup** → `/root/backup-ops-20261002/pro-three-tasks-<ts>/` (700): `pg_dump --schema-only`, `COPY app_settings`, snapshot `app_users` (id, paid_*, bonus_scans, created_at), count ตาราง, `git rev-parse HEAD`, `git diff docker-compose.yml` (เก็บ local edit), `docker ps`, `.env` (cp โดยไม่อ่าน)
2. **preflight ก่อน** (ไฟล์ 7a5906e stdin, read-only) → prereq 18/18 t
3. **apply ทีละไฟล์** `057 → 061 → 062 → 063 → 064 → 065 → 066 → 067` ด้วย `psql -v ON_ERROR_STOP=1` (ทุกไฟล์ idempotent; ล้มไฟล์ไหน = หยุด รายงาน ไม่ไปต่อ; 057 ผ่านแต่ 064 ไม่ผ่าน = **ห้ามเปิด trial และห้าม deploy โค้ดใหม่**) · บันทึก sha256 ทุกไฟล์ · `NOTIFY pgrst, 'reload schema'`
4. **preflight หลัง** → applied ทุกแถว t · **md5 31/31** (`verify-migration-versions.sh` จาก 7a5906e)
5. **ยืนยันคงฟรีรายวัน:** `free_policy_mode_now()` mode=daily, trial enabled=false, eligible_since null, schedule 0, audit 0 · `new_customer_trial_status(null)`.daily_enabled=true · สิทธิ์ app_users diff ว่าง
6. **deploy โค้ด:** `cd /root/ener-scan-pro && git fetch origin release/three-tasks && git checkout release/three-tasks` (compose ที่แก้บนเครื่องคงอยู่ — ไฟล์นี้ไม่ต่างระหว่าง branch · untracked ไม่กระทบ) → `bash /root/deploy-ener.sh pro` (script `git pull`) → HEAD = branch HEAD · `git diff 7a5906e HEAD -- ':!docs'` ว่าง · md5 ไฟล์ runtime ในคอนเทนเนอร์ 5 ไฟล์ตรง 7a5906e
7. **ตรวจหลัง deploy:** health 200 · 6 containers Up · log app/worker 5 นาที: error 0, `FREE_POLICY_APPLY_SKIPPED` 1 ครั้ง (ไม่มี key — คาด), ไม่มี `FREE_POLICY_SCHEDULE_APPLIED` · `/admin/*` ไม่ login → 302 · กบเปิด `/admin/free-policy` เห็น "ฟรีรายวัน (1 ครั้ง/วัน)" + "ops ยังไม่ตั้ง FREE_POLICY_DB_KEY" (อ่านอย่างเดียว) · ส่งรูปด้วยบัญชีทดสอบกบบน Pro 1 ครั้ง → ได้ฟรีรายวันตามปกติ / paywall ชุดใหม่โหมด daily · LIFF แสดง "ฟรีวันนี้" · คลังของฉันเปิดได้
8. **รายงาน** exact SHA, sha256 8 ไฟล์, preflight ก่อน/หลัง, md5, ค่าโหมด/สิทธิ์ก่อน/หลัง, health/log

## 7. Rollback
- **โค้ด:** `git checkout pro-optout` (be67a98) → `deploy-ener.sh pro` · ปลอดภัยเพราะนโยบายฟรียังเป็น daily และ Telegram ปิด (ไม่ต้องปิดสวิตช์ก่อน) · โค้ดเก่าอยู่กับ DB ใหม่ได้ (§3 ข้อสุดท้าย) · uq approve_notify: โค้ดเก่าส่ง approve_notify ซ้ำต่อ payment ไม่ได้อีก (dup=0 ปัจจุบัน; ถ้าเกิดจะเป็น error ตอน enqueue ไม่ใช่สิทธิ์หาย)
- **DB:** **ไม่ย้อน schema ไม่ DROP** (additive; `payment_approval_audit` ห้ามลบ) · ถ้าต้องปิดอะไร: ไม่มีสวิตช์ที่เปิดอยู่
- **ข้อมูลลูกค้า:** ไม่มีการแก้สิทธิ์ใด ๆ ในรอบนี้ จึงไม่มีอะไรต้องคืน

## 8. สิ่งที่ Codex ควรตรวจเป็นพิเศษ
1) ลำดับ 8 ไฟล์และเงื่อนไข "057 ผ่าน 064 ไม่ผ่าน" 2) uq `uq_outbound_approve_notify_per_payment` กับ path อนุมัติของโค้ดเก่าช่วง blue-green 3) role cluster-wide ที่มีอยู่แล้ว (066/067 ทำ `CREATE ROLE IF NOT EXISTS` + GRANT ซ้ำได้) 4) `git checkout release/three-tasks` บน Pro ทับ `pro-optout` ที่มี compose แก้บนเครื่อง (ไฟล์ไม่ต่างระหว่าง branch — ตรวจแล้ว `git diff --name-status be67a98 7a5906e -- docker-compose.yml` ว่าง) 5) การตั้ง key §5 เป็นเงื่อนไขก่อนกบตั้งเวลาจริง
