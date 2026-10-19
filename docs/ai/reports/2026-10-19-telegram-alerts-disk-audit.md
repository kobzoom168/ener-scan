# ตรวจแจ้งเตือน Telegram ในภาพ 19 ต.ค. 2026 (read-only) — ดิสก์ 85% · Health Warning · Server Alert · DLQ staging

ตรวจ 15:35–16:10 ไทย โดย Claude ตามคำสั่ง Codex · **ไม่ลบไฟล์ ไม่ prune ไม่เปลี่ยนระบบ ไม่ส่งข้อความทดสอบ**

## 1. ข้อความในภาพ — ต้นทางแต่ละข้อความ
ทั้ง 3 แบบเข้าแชตเดียวกันเพราะ **bot token เดียวกัน (@Eneraibot "Ener AI") + chat id เดียวกัน** ในสามระบบ: `/root/ener-ai/.env`, ener-scan Pro, ener-scan staging (เทียบ hash/ค่าเท่ากัน ไม่พิมพ์ค่า)
| ข้อความ | ต้นทาง | ความถี่/cooldown | env label |
|---|---|---|---|
| `⚠️ Health Warning: disk usage ของ /app/data เกิน 80% แล้ว` (12:59, 13:29, 13:59, 14:29, 14:59, 15:29) | **ener-ai** (`/root/ener-ai/app/scheduler.py` job `health_check`, `CronTrigger(minute="*/30")`) ตรวจ `shutil.disk_usage(/app/data)` · `/app/data` = bind mount `/root/ener-ai/data` บนดิสก์ root เดียวกัน (`/dev/sda1`) → 85% > 80 | ทุก 30 นาที **ไม่มี cooldown** (ส่งซ้ำตราบใดที่ >80%) | ไม่มี (ระบบ ener-ai ไม่ใส่ env) |
| `⚠️ Server Alert · Disk สูง 86% · 🤖 สรุป: มี exception ในแอป…` (14:49) | **ener-ai** `monitor_agent.check_and_alert` job `monitor_check` (`*/10`) · `disk_percent>85` → alert · cooldown 60 นาทีต่อ key "disk" | ทุก 10 นาที, ส่งไม่เกิน 1/ชม. | ไม่มี |
| `[test.my-ener.uk][dlq][high] [DLQ Alert] … dead = 1` (14:47) | **ener-scan staging** (adminAlert ใหม่ `c102b71`, worker-maintenance) — ข้อความเดียวที่มี env label | 1 ครั้ง แล้ว dedupe 6 ชม. (log `DLQ_ALERT_SKIPPED` 14:48) | `test.my-ener.uk` ✓ |
| การ์ดโพสต์ "หนุนดวง 8.0/10" (12:37) | ener-ai/autopost (โพสต์ FB/การ์ด) — นอกขอบเขต | — | — |

**สรุปการซ้ำ:** เหตุเดียวกัน (ดิสก์ root 85–86%) ถูกแจ้งจาก 2 job ของ ener-ai (health_check ทุก 30 นาที + monitor_check ทุกชั่วโมง) · ไม่มีข้อความใดมาจาก Pro ener-scan · **ภาพปิดหลักฐาน "ได้รับ DLQ staging ทาง Telegram" ได้** แต่ไม่ใช่หลักฐาน alert จาก Pro หรือ LINE 2 ข้อความ (§10)

## 2. คำว่า "มี exception ในแอป" — มีหลักฐานหรือไม่
- มาจาก `monitor_agent._basic_error_analysis()` (template ตายตัว): ถ้า log ที่กรองมี "traceback"/"exception" → ใส่ประโยคนี้ · log ที่อ่าน = **`docker logs --tail 200` ของคอนเทนเนอร์ `ener-ai-ener-ai-1` เอง** (ไม่ใช่ ener-scan) · ไม่ได้เรียก LLM (Groq) เพราะไม่มี high-pattern
- **มีหลักฐานจริงใน log ener-ai:** 19 ต.ค. 02:00:02Z (09:00 ไทย) `RuntimeError: Featherless request failed: HTTP 403 {"error":{"message":"You do not have an active subscription. Please upgrade your plan."}}` + traceback (12 บรรทัด error-keyword ใน tail 200) = job ของ ener-ai ที่เรียก Featherless (LLM provider) ล้มเพราะ **subscription Featherless หมด/ไม่ active** — ไม่เกี่ยวกับดิสก์ ไม่เกี่ยวกับ ener-scan
- ดังนั้น: ข้อความสรุป **ไม่ได้เดา** แต่ **สื่อผิดบริบท** (ผูก exception ของ ener-ai 09:00 ไทย เข้ากับ alert ดิสก์ 14:49 ราวกับเป็นเรื่องเดียวกัน) · ไม่มี exception ใน ener-scan Pro (web error 0 หลัง deploy)

## 3. ดิสก์ — ค่าปัจจุบันและอะไรโต (read-only)
`/dev/sda1` 75G ใช้ 61G ว่าง 12G = **85%** · inode 18% (ไม่ตัน) · ดิสก์เดียวทั้งเครื่อง (Pro, staging, legacy, ener-ai, ener-autopost, ener-local, postgres ทั้งหมดอยู่บน root fs เดียวกัน)
| ที่ | ขนาด | หมายเหตุ |
|---|---|---|
| `/var/lib/containerd` (image layers, driver overlayfs/containerd) | **25G** | `docker system df`: images 25.8GB, reclaimable 6.36GB · ใหญ่สุด: `ener-ai-ener-ai` 8.42GB, `postiz-app` 5.66GB, `vision-sidecar` 3.52GB, `n8n` 2.51GB, `ener-local` 1.39GB, staging 3 images ×1.15GB |
| `/usr/share/ollama` + `/usr/local/lib/ollama` | **10G + 3.5G** | โมเดล ollama (dolphin-mistral, qwen2.5, qwen3b-lite) · service `ollama` **inactive** · ไม่มีการเรียกใช้ใน journal 7 วัน |
| `/var/lib/docker/containers` | **8.1G** | เกือบทั้งหมด = log ของ **legacy** `ener-scan-worker-delivery`: **8.22GB** (ตั้งแต่ 17 มิ.ย.) โต ~0.26MB/10 นาที ≈ **37MB/วัน** จาก `OUTBOUND_CLAIM_RPC_START/RAW` 171,633 ครั้ง/24 ชม. (poll ทุก ~0.5 วิ ไม่มีงานจริง LINE calls 24 ชม. = 0) · legacy maintenance log 92MB · **ไม่มี log rotation** (`/etc/docker/daemon.json` ไม่มี) |
| `/var/log/journal` | **3.9G** | journald ไม่ตั้ง `SystemMaxUse` (default ≤10% ของ fs ≈ 7.5G) |
| `/var/log/btmp` + `btmp.1` | 0.6G | failed SSH logins (brute force) — ค้างอนุมัติ log rotation ตั้งแต่ 30 ก.ย. |
| `/usr/local/lib` อื่น, `/usr/lib`, `/usr/bin` | ~2G | ระบบ |
| `/root` | 1.7G | ener-ai 772M (data/vdo), storage 394M, backups 63M+ |
| postgres | 0.5G | เล็ก |
| cron 04:00 `ener-cleanup.sh` | — | `docker builder/image/container prune -f` (dangling เท่านั้น) + ลบคลิป vdo เก่า · ทำงานอยู่แล้วทุกคืน แต่ไม่แตะ image ที่ยังมี tag / log / journal |

**สรุป:** ดิสก์ 85% **เป็นเรื่องจริง** แต่ **ไม่เร่งด่วนระดับชั่วโมง** (ว่าง 12G, โตช้า ~40MB/วันจาก log legacy + journal) · ผู้ใช้พื้นที่หลัก = image ของระบบอื่น (ener-ai/postiz/vision/n8n) 25G, โมเดล ollama ที่ไม่ได้ใช้ 13.5G, log legacy 8.2G, journal 3.9G

## 4. อะไรผิดปกติจริง / อะไรซ้ำ
| รายการ | ประเภท | เร่งด่วน |
|---|---|---|
| ดิสก์ root 85% (เกณฑ์ ener-ai 80/85) | จริง | กลาง — ถ้าถึง 90% ener-scan (Pro) จะเสี่ยง (postgres/redis/log เขียนไม่ได้) |
| Featherless 403 no active subscription (ener-ai 09:00 ไทย) | จริง — job ของ ener-ai ที่ใช้ Featherless ล้ม | ต่ำ–กลาง (ไม่กระทบ ener-scan) — กบตัดสินว่าจะต่อ subscription หรือเปลี่ยน provider ใน ener-ai |
| Health Warning ซ้ำทุก 30 นาที + Server Alert ทุกชั่วโมง เหตุเดียวกัน | แจ้งซ้ำ (ออกแบบ ener-ai ไม่มี cooldown ที่ health_check) | รบกวน ไม่ใช่ปัญหาใหม่ |
| legacy `ener-scan-worker-delivery` poll ทุก 0.5 วิ + log 8.2GB ไม่หมุน, `APP_BASE_URL=https://scan.my-ener.uk`, มี `ADMIN_LINE_USER_ID`+`CHANNEL_ACCESS_TOKEN` (ยังส่ง LINE ได้ในทางทฤษฎี; 24 ชม. ไม่ได้ส่ง) ชี้ DB `ener_scan` (legacy) | ค้างตัดสินใจ (งานนอกแอปข้อ X1) | กลาง — ทั้งดิสก์และความเสี่ยงส่ง LINE ผิดระบบ |
| DLQ staging dead=1 (`9cd40af1…` 14 ต.ค.) | แจ้งถูกต้องตามออกแบบ (ไม่ใช่ปัญหาใหม่) | ต่ำ — แถว dead staging เดิม ห้ามลบ/requeue |

## 5. ข้อเสนอแก้ (ทุกข้อต้องขออนุมัติแยก — ยังไม่ทำ) · ห้ามปิด alert/เพิ่ม threshold เพื่อซ่อนปัญหา
| # | ข้อเสนอ | คืนพื้นที่ | ผลกระทบ/ความเสี่ยง |
|---|---|---|---|
| A | ตั้ง Docker log rotation ทั้งเครื่อง (`/etc/docker/daemon.json` `json-file max-size=50m max-file=5`) — มีผลเฉพาะคอนเทนเนอร์ที่ **recreate ใหม่** | ป้องกันโตต่อ | ต้อง recreate คอนเทนเนอร์ที่ต้องการให้มีผล (Pro = ต้อง drain + pinned deploy อีกรอบ; legacy = ถ้ายังไม่หยุด) · ไม่กระทบข้อมูล |
| B | legacy stack `ener-scan-*` (X1): **หยุด** (`docker compose stop` ที่ /root/ener-scan) แล้วค่อยพิจารณาลบ log 8.2GB (`truncate` ห้ามตาม constraint → ต้องกบอนุมัติชัดเจน) | 8.2G | ต้องยืนยันก่อนว่าไม่มีใครใช้ DB `ener_scan` legacy/memoboard (constraint เดิม: ห้ามหยุด legacy/memoboard จนกบยืนยัน) |
| C | ollama: service inactive + ไม่ใช้ 7 วัน → ลบโมเดล (`ollama rm` หรือลบ `/usr/share/ollama/.ollama/models`) และ/หรือถอดแพ็กเกจ | 10–13.5G | ถ้า ener-ai/ระบบอื่นเคยตั้งให้ใช้ ollama เป็น fallback จะใช้ไม่ได้ — ต้อง grep config ของ ener-ai ก่อน |
| D | image ที่ไม่ใช้: `docker image prune -a --filter until=…` **ห้ามทำเอง** (constraint ห้าม prune) → เสนอให้กบเลือกเป็นรายตัว: postiz 5.66GB (คอนเทนเนอร์ยังรันไหม?), n8n 2.51GB (0 workflows ตาม §1 X7), vision-sidecar 3.52GB, ener-local 1.39GB, reclaimable 6.36GB | 6–13G | ลบ image ที่คอนเทนเนอร์ยังใช้ไม่ได้ (docker จะปฏิเสธ) · ถ้าลบ tag ที่ต้องใช้ build ใหม่ |
| E | journald: ตั้ง `SystemMaxUse=1G` + `journalctl --vacuum-size=1G` | ~3G | เสีย log ระบบเก่า (ไม่ใช่ log แอป) |
| F | logrotate `btmp` (ค้างตั้งแต่ 30 ก.ย. PROPOSED) | 0.6G | ไม่มี |
| G | ener-ai: เพิ่ม cooldown ให้ `health_check` disk warning (เช่น 6 ชม. ขณะค่าไม่เปลี่ยน) + ใส่ `[ener-ai]` นำหน้าข้อความ + ให้ `_basic_error_analysis` แนบบรรทัด error จริง/เวลา แทนประโยคกว้าง ๆ · **ไม่ใช่ปิด alert ไม่ใช่ขยับ threshold** | — | งานใน repo ener-ai (นอก ener-scan) |
| H | Featherless 403: กบตัดสินใจต่อ subscription หรือเปลี่ยน provider ใน ener-ai | — | นอกขอบเขต ener-scan |
ลำดับที่แนะนำถ้ากบอนุมัติ: F + E (ปลอดภัยสุด ~3.6G) → C (13.5G ถ้ายืนยันไม่ใช้) → B (ตัดสินใจ legacy) → A → D รายตัว → G/H

## 6. ที่ไม่ได้ทำ
ไม่ได้อ่านค่า token/secret · ไม่ได้แตะ DLQ/outbox/สลิป/ข้อมูลลูกค้า · ไม่ได้ run `disk_cleaner.scan()` ของ ener-ai · ไม่ได้ตรวจว่า postiz/vision/n8n/ener-local ยังถูกใช้งานหรือไม่ (รอกบ)
