# ชุดขออนุมัติ Pro: release/three-tasks `7a5906e` (ตรวจ Pro แบบ read-only 14 ต.ค. 2026 09:30Z · แก้แผน 4 จุดตาม Codex 15 ต.ค.) — รอ Codex ตรวจ + กบอนุมัติ · **ยังไม่ apply/deploy · ไม่สร้างกำหนดการ · ไม่ broadcast · Telegram ปิด · คงฟรีรายวันเดิม**

> **Codex 15 ต.ค. — 4 จุดที่แก้ในชุดนี้:** (1) ตรึง SHA ก่อน build/สลับ — §6 · (2) nginx masking กลับเป็น **ขั้นก่อน GO** — §9 · (3) rollback ครอบ grant ที่ยังไม่แจ้ง — §7 + §10 · (4) key ใช้ **recreate** ไม่ใช่ restart + ตรึง image + ตรวจค่าแบบไม่โชว์ secret — §5
> **Codex 15 ต.ค. รอบ 2 — 3 จุดวิธีรันจริง:** (1) deploy จาก revision ตรึงไว้ **ไม่มี pull** ด้วย `scripts/ops/deploy-pinned.sh` (fetch ref แช่แข็งแบบระบุชื่อ → เทียบ SHA → `checkout --detach` → gate HEAD+dirty **ก่อน build และก่อนสลับ** → หยุดทันทีถ้าไม่ตรง; ทดสอบ 5 เคสบน clone ชั่วคราว รวมเคส branch ถูกขยับ → exit 13) ใช้หลักเดียวกับ rollback · (2) สคริปต์ ops ไม่อยู่ใน 7a5906e → **ops worktree แยก** ตรึง `978a88e658af49b71e1dbf153cdf32641193b7ae` + absolute path + sha256 (§6a) · (3) การกู้ข้อความใช้ `grant-notify-recover.sh` วนหลาย batch/รอแถวอายุ < 2 นาที จน `pending_notify=0` จริง (query ล้ม = exit 3 ไม่ถือเป็นศูนย์ · RPC list ล้ม = exit 2 · ค้างเกินเวลา = exit 5 + รายงาน) และ rollback รายบริการด้วย `--keep worker-maintenance` (§7/§10)

## 0. ขอบเขตรอบนี้
- โค้ดแอปที่ deploy: **`7a5906e5914120a0cb25d24c9aae01ec58b1e093` เท่านั้น** (detached checkout ตรึง SHA — ไม่ใช่ branch HEAD, ไม่มี `git pull`) · สคริปต์ ops ใช้จาก **worktree แยก** ที่ตรึง `978a88e658af49b71e1dbf153cdf32641193b7ae` (ไม่อยู่ใน 7a5906e; ไม่เปลี่ยน SHA แอป) — ดู §6a
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
| nginx private-token masking | **เงื่อนไขก่อน GO (Codex 15 ต.ค.)** — ชุดขออนุมัติ §9 (snippet ทดสอบในคอนเทนเนอร์แยกผ่าน 15 ต.ค.) ต้อง apply+reload ก่อนขั้น 6 |
| หน้า Admin โชว์ Environment=production บน staging | cosmetic — Pro จะโชว์ production ถูกต้อง |
| กติกาซื้อแพ็กซ้ำ | ยังไม่เคาะ ไม่อยู่ในชุดนี้ |
| harness/gate | Codex ยังไม่ได้รันซ้ำเอง (อ้างอิงรายงาน Claude: line 8/8, bonus 20/20, telegram 21/21, gate ✅ ที่ 7a5906e) |

## 5. ops ที่ต้องตัดสินแยก (ไม่ทำในรอบ deploy)
- **key หน้า Admin บน Pro (ขออนุมัติแยก — ทำได้หลัง deploy):** หน้า `/admin/free-policy` อ่านได้ทันทีหลัง deploy แต่ **บันทึก/ตั้งเวลาไม่ได้** จนกว่า `.env` Pro มี `FREE_POLICY_DB_KEY` (JWT HS256 role `free_policy_admin` เซ็นด้วย `POSTGREST_JWT_SECRET` ของ Pro, exp 2038)
  1. `node /root/ener-ops-978a88e/scripts/ops/gen-restricted-jwt.mjs /root/ener-scan-pro/.env FREE_POLICY_DB_KEY free_policy_admin --dry-run` (ไฟล์จาก ops worktree §6a) → พิมพ์แค่ role/exp/fingerprint (sha256 8 ตัว) · แล้วรันจริง: สคริปต์ backup `.env` → `.env.bak-<ts>` (600) และต่อท้ายตัวแปร **ไม่พิมพ์ค่า** · ปฏิเสธถ้ามีอยู่แล้ว (ทดสอบบนไฟล์ชั่วคราวแล้ว: เซ็นถูก, role ถูก, run ซ้ำ exit 3, บรรทัดเดิมคงอยู่)
  2. compose ใช้ `env_file: .env` → **restart ไม่รับค่าใหม่** ต้อง **recreate** เฉพาะบริการที่ใช้ key: `worker-maintenance` (apply_due) และ `ener-scan` (หน้า Admin) · ตรึง image: บันทึก `docker inspect --format '{{.Image}}'` ของทั้งสองก่อน แล้ว `docker compose up -d --no-build --force-recreate --no-deps worker-maintenance ener-scan` → image id หลังต้องเท่าก่อน (ไม่ build ใหม่) · ener-scan recreate = เว็บดับ ~5–10 วิ (nginx `proxy_next_upstream` มีขาเดียวนอกช่วง deploy) → ทำช่วงคิวว่าง หรือเลือกทางเลือก **ตั้ง key ก่อนขั้น 6 ของ §6** ให้ deploy recreate ครั้งเดียว (ถ้ากบอนุมัติ key พร้อม deploy)
  3. ตรวจค่าแบบไม่โชว์ secret: `docker exec ener-scan-pro node -e 'const k=process.env.FREE_POLICY_DB_KEY||"";const p=k.split(".");console.log(JSON.stringify({parts:p.length,role:p[1]?JSON.parse(Buffer.from(p[1],"base64url")).role:null,fp:require("crypto").createHash("sha256").update(k).digest("hex").slice(0,8)}))'` → `{parts:3, role:"free_policy_admin", fp:<ตรงกับสคริปต์>}` ทั้ง ener-scan และ worker-maintenance · log worker หลัง recreate ต้องไม่มี `FREE_POLICY_APPLY_SKIPPED` อีก · หน้า Admin ปุ่มบันทึกเปิด (ยังไม่กด)
  - rollback key: คืน `.env` จาก `.env.bak-<ts>` แล้ว recreate 2 บริการเดิมด้วย image id เดิม
- ลบ `migrate-*.mjs` untracked เก่า — ไม่ทำ (ไม่จำเป็น)
- `APP_ENV=production` — optional

## 6. ขั้นตอนที่จะทำเมื่อได้ GO + กบอนุมัติ (ทีละขั้น หยุดเมื่อผิดคาด)
0. **เงื่อนไขก่อน GO:** nginx masking (§9) apply+reload+ตรวจแล้ว · ช่วงคิวว่าง (pending_verify/queued = 0 เหมือนตอนตรวจ) · กบรับทราบว่า Pro จะ recreate containers (blue-green เว็บไม่ดับ, worker หยุดสั้น ๆ งานค้างถูก sweeper โยนกลับ)
1. **backup** → `/root/backup-ops-20261002/pro-three-tasks-<ts>/` (700): `pg_dump --schema-only`, `COPY app_settings`, snapshot `app_users` (id, paid_*, bonus_scans, created_at), count ตาราง, `git rev-parse HEAD`, `git diff docker-compose.yml` (เก็บ local edit), `docker ps`, `.env` (cp โดยไม่อ่าน)
2. **preflight ก่อน** (ไฟล์ 7a5906e stdin, read-only) → prereq 18/18 t
3. **apply ทีละไฟล์** `057 → 061 → 062 → 063 → 064 → 065 → 066 → 067` ด้วย `psql -v ON_ERROR_STOP=1` (ทุกไฟล์ idempotent; ล้มไฟล์ไหน = หยุด รายงาน ไม่ไปต่อ; 057 ผ่านแต่ 064 ไม่ผ่าน = **ห้ามเปิด trial และห้าม deploy โค้ดใหม่**) · บันทึก sha256 ทุกไฟล์ · `NOTIFY pgrst, 'reload schema'`
4. **preflight หลัง** → applied ทุกแถว t · **md5 31/31** (`verify-migration-versions.sh` จาก 7a5906e)
5. **ยืนยันคงฟรีรายวัน:** `free_policy_mode_now()` mode=daily, trial enabled=false, eligible_since null, schedule 0, audit 0 · `new_customer_trial_status(null)`.daily_enabled=true · สิทธิ์ app_users diff ว่าง
6. **deploy โค้ดแบบตรึง SHA — ไม่มี `git pull` (ตรวจก่อน build และก่อนสลับ):**
   a. **ops worktree** (ครั้งเดียว, อ่านอย่างเดียวต่อแอป): `git clone --no-checkout /root/ener-scan-mirror.git /root/ener-ops-978a88e && git -C /root/ener-ops-978a88e checkout --detach 978a88e658af49b71e1dbf153cdf32641193b7ae` → ตรวจ `git -C /root/ener-ops-978a88e rev-parse HEAD` = `978a88e658af49b71e1dbf153cdf32641193b7ae` และ sha256 ไฟล์ที่ใช้ตรงค่าด้านล่าง (ไม่ตรง = หยุด):
      | ไฟล์ (absolute) | sha256 |
      |---|---|
      | `/root/ener-ops-978a88e/scripts/ops/deploy-pinned.sh` | `01e8037834971d6e27190b60646f54e8712dfdb9bb25ce47c47c4c9227c1b3a9` |
      | `/root/ener-ops-978a88e/scripts/ops/grant-notify-oneshot.mjs` | `5b59185d5e8980383d8f144b16b7221d1f432b83eceed281cb07d41ce09ad090` |
      | `/root/ener-ops-978a88e/scripts/ops/grant-notify-recover.sh` | `4fa78027e75b8310a4f6729c1ea0322fa83cc0d39ee89b44869065252341093b` |
      | `/root/ener-ops-978a88e/scripts/ops/gen-restricted-jwt.mjs` | `78d5d9628b855b4d7c014b8c65f616ad258dc42361430e1431e6533a9ec42a12` |
      | `/root/ener-ops-978a88e/scripts/ops/check-grants-pending-notify.sql` | `86aff66662bb883f6d7eaf295ef60213b9af55ba267fff7d28879a7ba5c48dbe` |
      (SQL 067/preflight/md5 reference ที่ใช้ในขั้น 2–5 ก็อ่านจาก worktree นี้ — เนื้อหาเท่ากับ 7a5906e: `git diff 7a5906e 978a88e658af49b71e1dbf153cdf32641193b7ae -- sql scripts/ops/preflight-three-tasks-migrations.sql scripts/ops/migration-function-md5.reference.txt scripts/ops/verify-migration-versions.sh` ว่าง ตรวจแล้ว)
   b. ref แช่แข็ง: `origin/pro/three-tasks-7a5906e` → `7a5906e` · rollback `origin/pro/optout-be67a98` → `be67a98` (Git ไม่ห้ามขยับ branch — สคริปต์จึง **fetch ref แบบระบุชื่อแล้วเทียบกับ SHA ทุกครั้ง** ไม่ตรง = exit 13 ไม่ build)
   c. **รัน** `bash /root/ener-ops-978a88e/scripts/ops/deploy-pinned.sh pro 7a5906e5914120a0cb25d24c9aae01ec58b1e093 --frozen-ref origin/pro/three-tasks-7a5906e` ใน `/root/ener-scan-pro` (script ทำเอง: fetch ref → เทียบ → `checkout --detach 7a5906e` → gate `after-checkout` (HEAD = SHA, tracked ที่แก้ได้มีแค่ `docker-compose.yml` — ไฟล์อื่นถูกแก้ = exit 11) → `docker compose build ener-scan` หลัง gate `before-build` → GREEN healthy → gate `before-switch` → `docker compose up -d --build` → BLUE healthy → ลบ GREEN → gate `after-deploy` → พิมพ์ image id ทุก service) · ลำดับ blue-green เท่ากับ `/root/deploy-ener.sh` เดิมทุกขั้น ต่างแค่ขั้น git และ gate · **ไม่แก้ไฟล์ `/root/deploy-ener.sh`**
   d. ผลที่ต้องเห็น: `git -C /root/ener-scan-pro rev-parse HEAD` = 7a5906e (detached) · md5 ไฟล์ runtime ในคอนเทนเนอร์ 5 ไฟล์ตรง 7a5906e · บันทึก image id ใหม่ของทุก service (ใช้ตรึงใน §5/§7/§10)
7. **ตรวจหลัง deploy:** health 200 · 6 containers Up · log app/worker 5 นาที: error 0, `FREE_POLICY_APPLY_SKIPPED` 1 ครั้ง (ไม่มี key — คาด), ไม่มี `FREE_POLICY_SCHEDULE_APPLIED` · `/admin/*` ไม่ login → 302 · กบเปิด `/admin/free-policy` เห็น "ฟรีรายวัน (1 ครั้ง/วัน)" + "ops ยังไม่ตั้ง FREE_POLICY_DB_KEY" (อ่านอย่างเดียว) · ส่งรูปด้วยบัญชีทดสอบกบบน Pro 1 ครั้ง → ได้ฟรีรายวันตามปกติ / paywall ชุดใหม่โหมด daily · LIFF แสดง "ฟรีวันนี้" · คลังของฉันเปิดได้
8. **รายงาน** exact SHA, sha256 8 ไฟล์, preflight ก่อน/หลัง, md5, ค่าโหมด/สิทธิ์ก่อน/หลัง, health/log, image id ทุก service, `pending_notify=0` (§10)

## 7. Rollback
- **โค้ด (รายบริการ คง maintenance ใหม่ไว้จริง):** ขั้น 1 `bash /root/ener-ops-978a88e/scripts/ops/deploy-pinned.sh pro be67a98185e3b2b2379303b919c69b5c37632cde --frozen-ref origin/pro/optout-be67a98 --keep worker-maintenance` → recreate เฉพาะ ener-scan/worker-scan/worker-delivery เป็น be67a98 (gate SHA เดียวกัน) **worker-maintenance ยังรัน image ใหม่** · ขั้น 2 รัน §10 recover จน `pending_notify=0` (exit 0) · ขั้น 3 `cd /root/ener-scan-pro && docker compose up -d --build --no-deps worker-maintenance` (ตอนนี้ working tree = be67a98 แล้ว; ตรวจ `git rev-parse HEAD` = be67a98 ก่อน) · ถ้า §10 จบด้วย exit 2/3/5 → **ไม่ย้อน maintenance** รายงานค้าง · ปลอดภัยเพราะนโยบายฟรียังเป็น daily และ Telegram ปิด (ไม่ต้องปิดสวิตช์ก่อน) · โค้ดเก่าอยู่กับ DB ใหม่ได้ (§3 ข้อสุดท้าย) · uq approve_notify: โค้ดเก่าส่ง approve_notify ซ้ำต่อ payment ไม่ได้อีก (dup=0 ปัจจุบัน; ถ้าเกิดจะเป็น error ตอน enqueue ไม่ใช่สิทธิ์หาย)
- **DB:** **ไม่ย้อน schema ไม่ DROP** (additive; `payment_approval_audit` ห้ามลบ) · ถ้าต้องปิดอะไร: ไม่มีสวิตช์ที่เปิดอยู่
- **ข้อมูลลูกค้า:** ไม่มีการแก้สิทธิ์ใด ๆ ในรอบนี้ จึงไม่มีอะไรต้องคืน
- **ข้อความแจ้งเติมสิทธิ์ที่ค้าง (Codex 15 ต.ค.):** โค้ดใหม่อนุมัติสลิป → RPC เติมสิทธิ์ + แถว `payment_entitlement_grants` → enqueue approve_notify → stamp `notified_at` (เฉพาะเมื่อ enqueue สำเร็จ/dedup) · ถ้า enqueue ล้ม สิทธิ์เติมแล้วแต่ยังไม่แจ้ง → `runPaymentGrantNotifySweep` ใน worker-maintenance ใหม่กู้ทุก 60 วิ · **`be67a98` ไม่มี sweep นี้** → ขั้นตอน §10 ก่อน/หลังย้อนบังคับ (ห้ามเติมสิทธิ์ซ้ำ ห้าม stamp มือ)

## 8. สิ่งที่ Codex ควรตรวจเป็นพิเศษ
1) ลำดับ 8 ไฟล์และเงื่อนไข "057 ผ่าน 064 ไม่ผ่าน" 2) uq `uq_outbound_approve_notify_per_payment` กับ path อนุมัติของโค้ดเก่าช่วง blue-green 3) role cluster-wide ที่มีอยู่แล้ว (066/067 ทำ `CREATE ROLE IF NOT EXISTS` + GRANT ซ้ำได้) 4) `git checkout release/three-tasks` บน Pro ทับ `pro-optout` ที่มี compose แก้บนเครื่อง (ไฟล์ไม่ต่างระหว่าง branch — ตรวจแล้ว `git diff --name-status be67a98 7a5906e -- docker-compose.yml` ว่าง) 5) การตั้ง key §5 เป็นเงื่อนไขก่อนกบตั้งเวลาจริง

## 9. nginx private-token masking — ชุดขออนุมัติ (ขั้นก่อน GO · nginx แชร์ Pro+staging → reload กระทบทั้งสอง แบบ graceful)
**ปัญหา:** `/etc/nginx/nginx.conf` บรรทัด 40 `access_log /var/log/nginx/access.log;` = format `combined` ระดับ http (มี `$request` เต็มรวม query + `$http_referer`) · site `ener-scan` (scan.my-ener.uk) และ `test.my-ener.uk` ไม่มี access_log ของตัวเอง → **สืบทอด combined** → token ใน `/myscans/<token>`, `/r/<token>/…`, `/api/public-report/<token>`, `?token=` และ Referer ลง access.log (รวม .gz 14 วันย้อนหลัง) · app masking ไม่ช่วยชั้นนี้
**snippet (มีใน repo แล้ว):** `ops/nginx/private-token-access-log.conf` — `map $uri $ener_safe_log_uri` (3 path → `[redacted]`) + `log_format ener_private` (ไม่มี query/referrer/$request) · ไม่มี location → routing ไม่เปลี่ยน · เทสต์คอนเทนเนอร์แยก `scripts/ops/test-private-token-nginx.mjs` **PASS 15 ต.ค.** (nginx -t, 5 route ผ่านเหมือนเดิม, ไม่มี SYNTHETIC/QUERY_SECRET/REFERER_SECRET ใน log, /health ยังเห็น)
**ขั้นตอน (เมื่ออนุมัติ):**
1. backup: `cp -a /etc/nginx /root/backup-ops-20261002/nginx-<ts>/` (600) + `nginx -T > nginx-T-before.txt` (เก็บในโฟลเดอร์ 700 ไม่แปะในรายงาน)
2. วาง `/etc/nginx/conf.d/ener-private-log.conf` = เนื้อ snippet (ถูก include ใน http{} โดย `include /etc/nginx/conf.d/*.conf` บรรทัด 59 — map/log_format ต้องอยู่ระดับ http ✓)
3. แก้ **เฉพาะ** `access_log` ใน server blocks ของ `sites-enabled/ener-scan` (443 และ 80) และ `sites-enabled/test.my-ener.uk` (443 และ 80): เพิ่ม `access_log /var/log/nginx/access.log ener_private;` — ไม่แตะ location/proxy_pass/upstream/ssl · site อื่น (n8n/postiz/monitor/default) ไม่แตะ (ไม่มี token ของเรา) · config diff เก็บเป็นไฟล์ในโฟลเดอร์ backup ให้ Codex ดูได้
4. `nginx -t` ต้อง ok · `nginx -s reload` (graceful: worker เก่าปิดเมื่อหมด request)
5. ตรวจ: ยิง `GET /health` และ `GET /myscans/SYNTHETIC_TOKEN_<ts>?token=QUERY_SECRET_<ts>` + Referer สังเคราะห์ ไปที่ scan.my-ener.uk และ test.my-ener.uk (token ปลอม → แอปตอบ 401/404 ตามปกติ routing ไม่เปลี่ยน) → `grep -c SYNTHETIC_TOKEN_<ts> /var/log/nginx/access.log` = 0 และเห็น `/myscans/[redacted]` · route จริง: health 200, หน้า LIFF/report ด้วยลิงก์ของกบเปิดได้ (กบตรวจ)
6. **rollback:** `rm /etc/nginx/conf.d/ener-private-log.conf` + คืน 2 ไฟล์ site จาก backup → `nginx -t && nginx -s reload` (routing ไม่เคยเปลี่ยนทั้งไป-กลับ)
**ไม่อยู่ในชุดนี้ (แยก):** log เก่าที่มี token แล้ว (retention/ลบ/หมุน token) · error_log/upstream log/APM · `ไม่ลบ access.log*` ในรอบนี้

## 10. Rollback coverage: grant ที่เติมสิทธิ์แล้วแต่ยังไม่แจ้ง (Codex 15 ต.ค.)
- **ตรวจ (read-only) ทุกครั้งก่อนย้อนโค้ด:** `sudo -u postgres psql -d ener_scan_pro -Atq -f scripts/ops/check-grants-pending-notify.sql` → `pending_notify`, อายุแถวที่ค้างนานสุด, จำนวน outbound approve_notify ของแถวค้าง, รายการ 20 แถว (payment prefix 8 ตัว ไม่มีข้อมูลลูกค้า)
- **ข้อจำกัดของ sweep (ต้องรู้):** RPC `list_payment_grants_pending_notify` หยิบเฉพาะ grant **อายุ > 2 นาที** ครั้งละ **≤ 200** (worker ใช้ 20) → แถวอายุน้อยต้องรอ และหลาย batch อาจต้องวนหลายรอบ · `runPaymentGrantNotifySweep` คืน exit 0 แม้ list ล้ม (`PAYMENT_GRANT_NOTIFY_LIST_FAILED`) → **ห้ามใช้ exit 0 ของ sweep เป็นหลักฐาน** ต้องนับใน DB เอง
- **ก่อนย้อน:** ย้อน ener-scan/worker-scan/worker-delivery ด้วย `--keep worker-maintenance` (§7) แล้วรัน `bash /root/ener-ops-978a88e/scripts/ops/grant-notify-recover.sh pro <image-id ใหม่จาก §6d> /root/ener-ops-978a88e/scripts/ops/grant-notify-oneshot.mjs 900` → วน: นับ `pending_notify` ด้วย psql (ล้ม = exit 3 "ไม่ทราบ" ไม่ใช่ศูนย์) → ถ้า > 0 รัน one-shot ในคอนเทนเนอร์ของ image ตรึง (mount ไฟล์ oneshot เข้า /app; probe RPC list ก่อน ล้ม = exit 2 หยุด; `limit 200`; failed > 0 = exit 4 รอแล้วลองใหม่) → sleep 30 → นับใหม่ จน 0 หรือครบ 900 วิ → ค้าง = exit 5 + รายการ prefix 8 ตัว · **exit 0 เท่านั้น** จึงย้อน worker-maintenance (§7 ขั้น 3)
- **หลังย้อนครบแล้วพบค้าง (เช่น grant เกิดช่วง blue-green):** รัน `grant-notify-recover.sh` เดิมอีกครั้ง (image id ใหม่ยังอยู่ในเครื่อง ไม่ต้อง build) — one-shot enqueue approve_notify ผ่าน RPC (uq ต่อ payment กันซ้ำ) แล้ว stamp เฉพาะที่สำเร็จ · worker-delivery เก่าส่ง outbound ตามปกติ (kind approve_notify มีอยู่ก่อน 062) · รันซ้ำได้ (idempotent) · ผลต้องเป็น exit 0 ไม่งั้นรายงานค้าง
- **ห้าม:** UPDATE `notified_at` มือ · เรียก approve RPC ซ้ำ · แก้ `paid_remaining_scans`/`paid_until` มือ · ลบแถว grant/audit
- **ตอนนี้บน Pro:** ยังไม่มีตาราง (ก่อน 062) · หลัง apply จะว่าง · ค่าที่ต้องเห็นก่อนย้อน worker-maintenance ทุกครั้ง = recover **exit 0** (`pending_notify=0` จาก psql ไม่ใช่จาก exit ของ sweep)
- **เทสต์สคริปต์ (15 ต.ค.):** `deploy-pinned.sh` 5 เคสบน clone ชั่วคราว DRY_RUN (ปกติ ✓, ref ถูกขยับ → exit 13 ✓, tracked อื่นถูกแก้ → exit 11 ✓, rollback+keep ✓, SHA ไม่ครบ → ปฏิเสธ ✓) · recover/one-shot: ตรวจ syntax + ตรรกะ exit code ตามที่ระบุ (ยังไม่ได้รันกับ DB จริง — รันครั้งแรกบน staging ก่อน Pro ได้ถ้า Codex ต้องการ)
