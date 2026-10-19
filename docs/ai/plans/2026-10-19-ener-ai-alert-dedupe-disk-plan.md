# แผน G (กันแจ้งซ้ำ ener-ai) + E/F (journal/btmp ระบุอายุเก็บ) + ข้อค้นพบ cron cleanup — 19 ต.ค. 2026 (Codex สั่งลำดับ)

**สถานะ: แผนเท่านั้น ยังไม่แก้ระบบ ไม่ลบ ไม่ prune** · อ้างอิงรายงาน `docs/ai/reports/2026-10-19-telegram-alerts-disk-audit.md`

## 1. แผน G — ener-ai: แจ้งดิสก์/ทรัพยากรแบบ "สถานะ" ไม่ซ้ำสองทาง (repo `/root/ener-ai` HEAD `b13567f`)
**ปัญหา:** `scheduler.run_health_check` (*/30 นาที, ไม่มี cooldown) และ `monitor_agent.check_and_alert` (*/10 นาที, cooldown 60 นาที key "disk") ตรวจดิสก์ลูกเดียวกัน (`/app/data` = root fs) ด้วยเกณฑ์ต่างกัน (80 / 85) และส่งแยกกัน → เหตุเดียวซ้ำ 2 ทาง · ข้อความไม่มีระบบต้นทาง/เวลา · "สรุป: มี exception" เป็น template จาก log ener-ai ย้อนหลัง (tail 200 ไม่จำกัดเวลา)

**แบบ (ไม่ปิด alert ไม่ขยับเกณฑ์):**
1. **โมดูลกลาง `app/agents/alert_state.py`** — state machine ต่อ "เรื่อง" (`disk`, `cpu`, `ram`, `sqlite`, `api_key`): ระดับ `ok < warn(≥80%) < high(≥85%) < critical(≥90%)` เก็บใน SQLite `memories` key `alert_state_<topic>` = `{level, value, since, last_sent}`
   - ส่งทันทีเมื่อ **ระดับเพิ่ม** (ok→warn, warn→high, high→critical) และเมื่อ **กลับมาปกติ** (→ok: "✅ กลับสู่ปกติ") · ระดับเท่าเดิม = เตือนซ้ำแบบ reminder ตามระดับ: warn ทุก 6 ชม., high ทุก 2 ชม., critical ทุก 30 นาที (ยังเตือนอยู่ ไม่เงียบ) · ระดับลดแต่ยังไม่ ok = แจ้งว่าลดลง
   - ทั้ง `run_health_check` และ `check_and_alert` เรียก `alert_state.evaluate("disk", percent)` ตัวเดียวกัน → ใครเจอก่อนส่งก่อน อีก job เห็น state เดิมไม่ส่งซ้ำ (แทน `_should_send_alert` แบบ cooldown ต่อ job)
2. **รูปแบบข้อความ:** `[ener-ai][disk][high] 19 ต.ค. 14:49 ไทย · root fs (/app/data) 86% ใช้ 61G/75G ว่าง 12G · ตั้งแต่ 12:59 · ผู้ใช้หลัก: containerd images 25G, ollama 13.5G, docker logs 8G` (ข้อมูล du แบบ cache ไม่เกิน 1 ครั้ง/ชม.) — มีระบบต้นทาง ระดับ เวลา ค่าจริง
3. **"สรุป" จาก log:** `_basic_error_analysis` เปลี่ยนเป็นแนบ **บรรทัด error จริง + timestamp + container** (เช่น `02:00:02Z ener-ai RuntimeError: Featherless … HTTP 403 no active subscription`) และจำกัด log ที่อ่านเป็น **ช่วง 15 นาทีล่าสุด** (`since=`) ไม่ใช่ tail 200 ย้อนไม่จำกัด · ถ้าไม่มี error ในช่วงนั้น = ไม่ใส่ประโยค exception · แยกข้อความ "exception ในแอป" ออกเป็น topic `app_error` ของ state machine (ไม่ผูกกับ disk) · ไม่เรียก LLM เพื่อสรุปถ้าไม่มี high-pattern (คงเดิม)
4. **ไม่แตะ:** เกณฑ์ 80/85/90 เดิม (เพิ่ม critical 90 เป็นระดับใหม่ ไม่ใช่ขยับ) · `disk_cleaner.scan()` ขออนุมัติ `/clean_ok` คงเดิม · ช่องทาง Telegram เดิม
5. **ทดสอบ:** unit สำหรับ state machine (เพิ่ม/ลด/reminder/recovery/สอง job เรียกพร้อมกันส่งครั้งเดียว) · replay ค่า 84→86→91→70 · ข้อความต้องมี `[ener-ai]`
6. **ขั้นตอน:** กบเคาะแบบ → patch บน branch ใน `/root/ener-ai` (git มี remote) → ทดสอบในคอนเทนเนอร์แยก → ขออนุมัติ restart `ener-ai-ener-ai-1` (ไม่เกี่ยว Pro ener-scan ไม่ต้อง recreate Pro)

## 2. E — journald: ระบุอายุเก็บ
- ปัจจุบัน: 3.9G, 102 ไฟล์, เก่าสุด ต.ค. 2025 · ขนาดต่อเดือน: ก.ย. 2026 **2.9G** (ช่วง incident 29 ก.ย.), ต.ค. 1.4G (19 วัน) · ผู้เขียนหลัก 24 ชม.: `sshd` 86,781 บรรทัด (brute force), kernel 18,642, systemd/containerd/dockerd · ข้อความ ~15MB/วัน
- **ข้อเสนอ:** `/etc/systemd/journald.conf.d/50-retention.conf`: `SystemMaxUse=1G` + `MaxRetentionSec=2month` แล้ว `journalctl --vacuum-size=1G` (หรือ `--vacuum-time=2months`) → **คงไว้ ≈ 2 เดือนล่าสุด / ไม่เกิน 1G** · **ลบ**: journal ที่เก่ากว่า (ต.ค. 2025 – ก.ค. 2026 + บางส่วน ส.ค.–ก.ย.) · **คืนประมาณ 2.9G** (3.9→1G; ตัวเลขจริงหลัง vacuum) · ผลกระทบ: เสีย log ระบบเก่ากว่า 2 เดือน (sshd/kernel/docker daemon) ไม่ใช่ log แอป (อยู่ใน docker json-file) · ถ้ากบต้องการเก็บช่วง incident 29 ก.ย. ให้ export ก่อน: `journalctl --since 2026-09-28 --until 2026-10-01 -o export | zstd > /root/backup-ops-20261002/journal-incident-20260929.export.zst`

## 3. F — btmp: หลักฐาน SSH ล้มเหลว ไม่ใช่ "ไม่มีผลกระทบ"
- ปัจจุบัน: `btmp` 184MB (1–19 ต.ค.) + `btmp.1` 440MB (ก.ย.) · logrotate.d/btmp = monthly, rotate 1, ไม่บีบอัด → รอบ 1 พ.ย. จะลบ btmp.1 ทิ้ง (หลักฐานเดือนก.ย. หายเองอยู่แล้ว) · failed logins **31,382 ครั้ง/24 ชม.** · fail2ban ติดตั้งแต่ **inactive**, ufw inactive, sshd `passwordauthentication yes` (root = without-password)
- **ข้อเสนอ F (เก็บหลักฐาน + ลดพื้นที่):** แก้ `/etc/logrotate.d/btmp` → `monthly, rotate 6, compress, delaycompress, missingok, create 0660 root utmp` = **เก็บ 6 เดือนแบบบีบอัด** (btmp บีบได้ ~90% → ~40–60MB/เดือน) · การตั้ง rotation **ไม่คืนพื้นที่ทันที**; ถ้าต้องการคืนตอนนี้ต้องรัน `logrotate -f /etc/logrotate.d/btmp` 1 ครั้ง → btmp→btmp.1 (184MB ไม่บีบเพราะ delaycompress), btmp.1→btmp.2.gz (~45MB) → **คืน ~395MB** · ไม่ลบไฟล์ใด (`lastb -f /var/log/btmp.2.gz` ยังอ่านได้หลัง zcat)
- **ข้อเสนอ F2 (ลดต้นตอ — ความปลอดภัย):** เปิด `fail2ban` jail sshd (ban 1 ชม. หลัง 5 ครั้ง) และ/หรือ `PasswordAuthentication no` (เราเข้าด้วย key อยู่แล้ว — ต้องยืนยันว่ากบ/ทุกคนใช้ key) → ลด btmp/journal จาก sshd ~90% · **ต้องอนุมัติแยก** เพราะกระทบการเข้า SSH

## 4. ข้อค้นพบ cron cleanup (ข้อ 4 ของ Codex)
- cron 04:00 ไทย: `ener-cleanup.sh` (`docker builder prune -f`, `docker image prune -f` = dangling เท่านั้น, `docker container prune -f`, ลบคลิป vdo เกิน 20 ไฟล์) + อีกบรรทัด `docker builder prune -af --filter until=72h` + `docker image prune -f`
- **image สำหรับ rollback ไม่ได้ถูกเก็บ:** ตอนนี้ไม่มี image `<none>` ของ ener-scan เหลือเลย — image ที่ build จาก `eedec5b` (Pro เดิม) **หายไปแล้ว** (compose build ทับ tag `:latest` แล้ว dangling ถูก prune / ถูกลบตอน blue-green) · rollback ตาม runbook (`deploy-pinned.sh pro eedec5b…`) จึง = **build ใหม่จาก git** (เวลา build ~2–4 นาที, build cache 990MB ถูก prune ถ้าเกิน 72 ชม.) ไม่ใช่สลับ image ทันที
- **ข้อเสนอ:** เพิ่มขั้นใน deploy-pinned/runbook ก่อน build: `docker tag ener-scan-pro-<svc>:latest ener-scan-pro-<svc>:rollback-<sha7เดิม>` ทั้ง 4 บริการ (tag แล้วไม่ใช่ dangling → prune ไม่ลบ) และเก็บไว้ 1 ชุด (ลบชุดก่อนหน้าเมื่อ deploy ถัดไปสำเร็จ) · ต้นทุนพื้นที่ ≤ 4×1.15GB (layer ร่วมกันมาก จริงอาจ ~1.5G) · ต้องแก้สคริปต์ (commit ใหม่) + อนุมัติ
- cron ไม่แตะ image ที่มี tag, log, journal, ollama → ไม่ช่วยเรื่องดิสก์ 85% ที่เป็นอยู่

## 5. ติดตามพื้นที่ว่างต่อเนื่อง (ข้อท้ายของ Codex)
- ตัวเลข "~40MB/วัน" ครอบเฉพาะ log legacy — journal จริง 1.4–2.9G/เดือน (50–100MB/วัน) และ build/pull image ใช้เป็นก้อน (deploy วันนี้ +8 images ×1.15GB แต่ layer ร่วม) → ต้องวัดจริง
- sysstat เก็บอยู่แล้วทุก 10 นาที แต่ `SADC_OPTIONS="-S DISK"` (ไม่มี FS) และ `HISTORY=7` · **ข้อเสนอ:** `SADC_OPTIONS="-S DISK,XDISK"` + `HISTORY=28` แล้ว restart sysstat → ดูย้อนหลังด้วย `sar -F -f /var/log/sysstat/saDD` (ต้องอนุมัติ: แก้ config + restart service เล็ก) · ทางเลือกไม่แตะ service: cron ทุกชั่วโมง `df -B1 / >> /root/storage/df-history.log`
- จนกว่าจะอนุมัติ: ตรวจ `df -h /` ด้วยมือทุกครั้งที่ทำงาน ops · ขณะนี้ 85% / ว่าง 12G (`sar -F` สด 15:50 ไทย: 84.91% ใช้, inode 17%)

## 6. ยังไม่เสนอให้ทำ (ตาม Codex ข้อ 3)
- Ollama 13.5G: ener-ai มี provider `_call_ollama`/health check ที่ผู้ใช้เลือกได้ (`OLLAMA_BASE_URL`/`OLLAMA_MODEL` ตั้งอยู่) แม้ไม่มีการเรียก 7 วันและ service inactive → ยังถือเป็น dependency จนกบยืนยันเลิกใช้
- image postiz/n8n/vision/ener-local: ขนาดที่แสดงรวม layer ร่วม → ยอดคืนจริงต้องวัดด้วย `docker image prune -a --dry-run` (ไม่มีใน docker CLI) หรือ `docker system df -v` รายตัว ก่อนอนุมัติ
- legacy stack: รอข้อยุติ X1

## 7. ลำดับขออนุมัติที่เสนอ
1. G (แผนนี้ → patch ener-ai → restart ener-ai เท่านั้น) 2. E (journald 1G/2 เดือน + vacuum, export ช่วง incident ก่อน) 3. F (btmp rotate 6 compress + `logrotate -f` 1 ครั้ง) 4. F2 (fail2ban/PasswordAuthentication) 5. ข้อ 5 (sysstat FS) 6. ข้อ 4 (rollback tag ใน deploy-pinned) 7. ค่อยพิจารณา ollama/image/legacy ด้วยตัวเลขจริง
