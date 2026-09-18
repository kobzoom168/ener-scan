# Runbook — deploy ชุด optout ขึ้น Pro

> **สถานะ: Codex GO ด้านโค้ดแล้ว (18 ก.ย. 2026) · รอกบสั่ง "GO Pro เฉพาะ optout" เท่านั้นจึงเริ่มได้**
> ห้ามเริ่มขั้นใดขั้นหนึ่งก่อนได้คำสั่งจากกบ

## ชุดที่จะขึ้น
- **exact SHA: `be67a98185e3b2b2379303b919c69b5c37632cde`** · branch `release/optout-notification`
- **rollback point: `0bb11bc16a92ab564173f1753eebe9af1dd571fa`** (`main` บน Pro ตอนนี้)
- diff ทั้งชุดเทียบ Pro: **13 ไฟล์ +1,215 / −22**
  (โค้ด+SQL+manifest 9 ไฟล์ +491/−22 · tests 3 ไฟล์ +608 · เอกสาร 1 ไฟล์ +116)
- ไม่มี trial / W2 ปน (ตรวจ 9 marker: diff=0 และทั้ง tree=0)

## ขั้นที่ 1 — ยืนยัน rollback point
```bash
ssh ener 'cd /root/ener-scan-pro && git rev-parse HEAD && git rev-parse --abbrev-ref HEAD'
```
ต้องได้ `0bb11bc16a92ab564173f1753eebe9af1dd571fa` บน `main` · **ถ้าไม่ตรง หยุดทันทีและรายงานกบ**
บันทึกค่าที่ได้ลง LOG ก่อนทำต่อ

## ขั้นที่ 2 — สำรอง schema/config แล้ว apply migration

### 2.1 สำรองก่อน (เก็บใน `/root/backup-optout-<วันที่>/` chmod 600)
```bash
# โครงสร้างตารางที่เกี่ยวข้อง + นิยาม RPC เดิม + constraint เดิม
sudo -u postgres pg_dump -d ener_scan_pro --schema-only \
  -t public.outbound_messages -t public.notification_preferences \
  > schema-before.sql
# ค่า config ที่เกี่ยวข้อง (ไม่มี secret)
sudo -u postgres psql -d ener_scan_pro -c "\copy (SELECT key, value FROM app_settings) TO 'app_settings-before.csv' WITH CSV HEADER"
# นับแถวไว้เทียบหลัง migration
sudo -u postgres psql -d ener_scan_pro -tA -c "SELECT status, count(*) FROM outbound_messages GROUP BY status ORDER BY 1"
```

### 2.2 apply ตามลำดับ — ห้ามสลับ ห้าม deploy โค้ดก่อน
| ลำดับ | ไฟล์ | sha256 (16 หลักแรก) |
|---|---|---|
| 1 | `sql/058_notification_preferences.sql` | `48bc8427995b88cc` |
| 2 | `sql/059_outbound_suppressed_optout.sql` | `d3bd74c7776a5d76` |
| 3 | `sql/060_daily_pick_optout_migrate_if_absent.sql` | `7b6b9f6eff9a1d7e` |

ทั้งสาม idempotent · **ไม่ backfill ข้อมูลลูกค้า** · ส่งผ่าน stdin (`psql < file`) เพราะ user `postgres` อ่านไฟล์ใต้ `/root` ไม่ได้

### 2.3 ตรวจก่อน deploy โค้ด (ทุกข้อต้องผ่าน ไม่ผ่าน = หยุด)
```sql
-- ตาราง + RPC ครบ
SELECT count(*) FROM information_schema.tables WHERE table_name='notification_preferences';           -- 1
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname LIKE '%daily_pick_optout%');                                  -- 3
-- privileges: PUBLIC ต้องเรียกไม่ได้ · web_anon/service_role เรียกได้
SELECT p.proname, has_function_privilege('public',p.oid,'EXECUTE'),
       has_function_privilege('web_anon',p.oid,'EXECUTE'),
       has_function_privilege('service_role',p.oid,'EXECUTE')
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE '%daily_pick_optout%';                                    -- false/true/true ทุกตัว
-- web_anon ต้องเขียนตารางตรงไม่ได้ (แก้ได้เฉพาะผ่าน RPC)
SELECT has_table_privilege('web_anon','notification_preferences','INSERT'),
       has_table_privilege('web_anon','notification_preferences','UPDATE'),
       has_table_privilege('web_anon','notification_preferences','DELETE'),
       has_table_privilege('web_anon','notification_preferences','SELECT');                            -- f/f/f/t
-- CHECK ต้องมีสถานะใหม่
SELECT pg_get_constraintdef(oid) LIKE '%suppressed_optout%'
  FROM pg_constraint WHERE conname='outbound_messages_status_check';                                   -- true
-- ต้องไม่มีการ backfill
SELECT count(*) FROM notification_preferences;                                                          -- 0
```

## ขั้นที่ 3 — deploy exact SHA
```bash
ssh ener 'cd /root/ener-scan-pro && git fetch origin && \
  git checkout release/optout-notification && \
  git reset --hard be67a98185e3b2b2379303b919c69b5c37632cde && git rev-parse HEAD'
ssh ener 'bash /root/deploy-ener.sh pro'
```
### ตรวจ runtime hash — **ทั้ง web และ worker ทุกตัว**
เทียบกับ git object ของ `be67a98` (ไม่ใช่ working tree) สำหรับ
`ener-scan-pro` · `ener-scan-pro-worker-delivery` · `ener-scan-pro-worker-scan` · `ener-scan-pro-worker-maintenance`

| ไฟล์ | sha256 (16 หลักแรก) |
|---|---|
| `src/routes/lineWebhook.js` | `3b8dd404a35599d3` |
| `src/services/dailyLuckyPickPush.service.js` | `dd043ba1648ed581` |
| `src/services/scanV2/deliverOutbound.service.js` | `1be069b7c50a814a` |
| `src/utils/dailyPickNotifyCommand.util.js` | `ab8fd8cf63201d8b` |
| `src/workers/deliveryWorker.js` | `1b25ac2de46b6143` |
| `package.json` | `e24bcbb164deaca2` |

ไม่ตรงแม้ไฟล์เดียว = หยุดและเข้า rollback

## ขั้นที่ 4 — smoke เปิด–ปิด
**ต้องใช้บัญชีทดสอบที่กบระบุและอนุญาตตอนสั่ง GO เท่านั้น** (ห้ามเลือกบัญชีเอง ห้ามใช้บัญชีลูกค้าจริง)
ตั้ง marker เวลา UTC ก่อนเริ่ม แล้วให้กบพิมพ์ `หยุดแจ้งเตือน` → รอคำตอบ → `เปิดแจ้งเตือน`

ต้องได้ครบ:
- **acknowledgement**: `replyType=daily_pick_notify_toggle`, `suppressed:false` ทั้งสองครั้ง + ภาพหน้าจอจากกบ
  (log ยืนยันได้แค่ว่า LINE รับคำขอส่ง ไม่ใช่ว่าลูกค้าเห็นแล้ว)
- **DB**: `DAILY_PICK_OPTOUT_SAVED optedOut:true` แล้ว `optedOut:false` · `get_daily_pick_optout` คืน `{"known":true,"optedOut":false}`
- **AI=0**: `LLM_USAGE` = 0 ทั้ง web และ worker-scan ในหน้าต่างนั้น

จบแล้วคืนค่าตามที่กบต้องการ (ถ้ากบอยากปิดไว้ ให้พิมพ์ `หยุดแจ้งเตือน` เอง — **ห้ามแก้ค่าใน DB ให้**)

## ขั้นที่ 5 — เฝ้า 30 นาที
ทุก ~5 นาที เก็บ:
- `/health` = 200 · container ทุกตัว Up ไม่ restart วน
- **delivery**: `OUTBOUND_SEND_SUCCESS` ยังเกิดตามปกติ · ไม่มี `OUTBOUND_SEND_FAIL` เพิ่มผิดปกติ
- **optout errors/retries**: นับ `OUTBOUND_OPTOUT_CHECK_FAILED` · `OUTBOUND_SUPPRESS_PERSIST_FAILED` ·
  `DAILY_PICK_OPTOUT_READ_FAILED` · `DAILY_PICK_OPTOUT_READ_MALFORMED` · `OUTBOUND_SEND_RETRY reason=optout_*`
  → **คาดหวัง 0 ทั้งหมด** · ถ้ามีต่อเนื่องให้เข้า rollback
- **ข้อความธุรกรรมยังทำงาน**: มี `scan_result` / `scan_failure_notify` / `renewal_reminder` ที่ `status='sent'` ใหม่
  และไม่มีแถวใดของสองชนิดนี้ได้ `suppressed_optout` (ต้องเป็น 0 เสมอ)
```sql
SELECT kind, status, count(*) FROM outbound_messages
 WHERE updated_at > <marker> GROUP BY 1,2 ORDER BY 1,2;
```

## เกณฑ์ยกเลิก (เข้า rollback ทันที)
- runtime hash ไม่ตรง · `/health` ไม่ 200 · container restart วน
- `OUTBOUND_OPTOUT_CHECK_FAILED` หรือ `OUTBOUND_SUPPRESS_PERSIST_FAILED` เกิดต่อเนื่อง
- ข้อความธุรกรรมชนิดใดได้สถานะ `suppressed_optout`
- ลูกค้าจริงรายงานว่าไม่ได้รับผลสแกน

## Rollback
ใช้ [2026-09-18-optout-rollback-plan.md](./2026-09-18-optout-rollback-plan.md) **ตามลำดับเต็ม**:
ปิด producer ทั้งสองสวิตช์ (`DAILY_PICK_PUSH_ENABLED` + `FB_CONSENT_ASK_ENABLED`) → หยุด worker-delivery + worker-maintenance →
snapshot + พักคิว (ครอบ `queued`/`retry_wait`/`sending`) → ย้อนโค้ดเป็น `0bb11bc` → ปลดพักได้เฉพาะเมื่อโค้ดตรวจ optout แล้ว

**ห้าม**: ย้อน schema · เปลี่ยน `suppressed_optout` เป็น `sent` · ลบ/แก้ `notification_preferences`

## ขอบเขตที่ไม่รวมในงานนี้
ไม่มี trial (ยัง OFF `eligible_since=null` คนละชุด) · ไม่มี W2 · ไม่เปิดนโยบายฟรี · ไม่ broadcast ·
**ไม่ backfill preference ของลูกค้าจริง** (รวมถึง 10 บัญชีที่เคยกดปิดแล้วค่าหายจาก TTL — ต้องขออนุมัติแยก)
