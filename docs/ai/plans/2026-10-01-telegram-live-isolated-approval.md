# ชุดขออนุมัติ live ครั้งเดียว — Telegram จริง → ระบบทดสอบแยก (วิธี A) · ปรับ 2 ต.ค. 2026 (แก้ 4 จุด Codex)

สิ่งที่จะพิสูจน์: "กบเห็นรายการและกดอนุมัติสองขั้นใน Telegram โดยไม่ login เว็บ → payment=paid, grant ครั้งเดียว, audit ครบ, กดซ้ำไม่เติมซ้ำ, ข้อความแจ้งลูกค้าอยู่ใน DB ทดสอบ, ไม่มี LINE จริง"
สิ่งที่ **ไม่ใช่**: ไม่ใช่ staging ทั้งชุด (ไม่ deploy แอป staging ไม่เปิด flag staging ไม่แตะ DB/คิว staging/Pro) · "ปฏิเสธสลิปโดยเจ้าหน้าที่ผ่าน Telegram" ยังไม่มี ไม่นับเป็นฟีเจอร์ที่ผ่าน
ผลที่จะรายงานหลังผ่าน: **live Telegram บนระบบแยก PASS** · deploy/config บน staging จริง = ขั้นถัดไป

## 0. โค้ด/หลักฐานภายใน (ทำแล้ว 2 ต.ค.)
- **exact SHA ที่ใช้รัน: `db993b3`** (parser fix `90a400c` + โหมด `--live` ฉบับแก้ 4 จุด) — launcher `scripts/ops/tg-live-start.sh` ต้องถูกเรียกจาก **worktree ที่ HEAD = SHA นี้** (ตรวจ `rev-parse` ไม่ตรง = หยุด) · schema/migrations/child script อ่านจาก codeRoot เดียวกัน ไม่พึ่งไฟล์ใน checkout staging (`1094347` ไม่มีสคริปต์นี้)
- **transport:** mock **เฉพาะ** automated และ `--dry-run` · โหมด live ใช้ `fetch` จริงไป `api.telegram.org` (host เดียวที่ guard อนุญาต; LINE/AI บล็อกก่อนส่ง) — regression `tests/tgTransportSelect.test.js` (spy แทน fetch ไม่ส่งจริง) 3/3 + regression ระบบจริง: รัน `--live` โดยให้ guard ไม่อนุญาต Telegram (`ENER_TG_LIVE_BLOCK_TELEGRAM=1`) → เลือก transport `real`, ถูกบล็อก `ENETBLOCKED` ที่ seed → **ไม่ READY**, `FAILED.json` + `KEEP`, exit 3, ทรัพยากรถูกเก็บไว้ (ยืนยันแล้ว 2 ต.ค.)
- **READY** เกิดหลังส่งรายการทดสอบทั้ง 2 สำเร็จ (Telegram ตอบ ok) เท่านั้น · **STOP**: ปิดรับ callback (503) → ปิด listener → รอ in-flight จบ (≤30 วิ) → เก็บหลักฐาน → **ตรวจความครบ** (ทุก query ไม่ล้ม, จำนวนรายการครบ, in-flight = 0) → ครบ = `evidence-<ts>.json` + parent ลบ container/network/worktree · ไม่ครบ = `evidence-PARTIAL-<ts>.json` + `KEEP` + exit 3 + **ไม่ลบอะไร** พร้อมพิมพ์คำสั่ง cleanup ให้ทำเองหลังตรวจ
- dry-run ผ่าน launcher ที่ `db993b3`: preflight สด (disk/RAM/port) → READY (transport=mock) → 401/denied/ขั้น 1/ขั้น 2/กดซ้ำ/3 พร้อมกัน → stop → `complete:true problems:[]`, grants 1+1, blocked=0, ไม่มี token/secret ในไฟล์, containers=0 port ปิด · automated 12/12 · gate ✅

## 1. สิ่งที่กบเตรียม (ไม่ส่ง token/secret ในแชท)
- bot ใหม่จาก BotFather (คนละตัวกับ bot แจ้งเตือนกลางและ Pro) · เพิ่ม bot เข้า **ห้องทดสอบ** (กลุ่ม/ซูเปอร์กรุ๊ปใหม่) · ได้ `chat id` ตัวเลข (ติดลบสำหรับกลุ่ม) · Telegram user id ตัวเลขของผู้อนุมัติ (กบ และถ้ามีคนที่ 2 ไว้ทดสอบ "ไม่มีสิทธิ์")
- สร้างไฟล์ secret บนเซิร์ฟเวอร์ `/root/ener-tg-live/.env.tg-live` (chmod 600) 5 บรรทัด: `TELEGRAM_APPROVAL_BOT_TOKEN=…` · `TELEGRAM_APPROVAL_CHAT_ID=…` · `TELEGRAM_APPROVER_USER_IDS=111,222` · `TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)` · `TELEGRAM_SLIP_APPROVAL_ENABLED=true` — harness ตรวจรูปแบบทุกค่าโดยไม่พิมพ์ (token `^\d+:[A-Za-z0-9_-]{30,}$`, secret `[A-Za-z0-9_-]{32,256}`) · ไฟล์นี้ **แยกจาก** `/root/ener-scan-staging/.env` (ไม่แตะ staging)
- ยืนยัน bot ใหม่ยังไม่มี webhook: `getWebhookInfo` → `url` ว่าง (ทำโดยกบ หรือผมโดย source ไฟล์ secret แล้ว curl โดยไม่ echo)

## 2. nginx diff (แชร์กับ Pro → ต้องอนุมัติก่อน include / `nginx -t` / reload)
ไฟล์: `/etc/nginx/sites-enabled/test.my-ener.uk` — เพิ่ม **เฉพาะ** location ชั่วคราวใน server block ของ `test.my-ener.uk` (ไม่แตะ `scan.my-ener.uk` และไม่แตะ location อื่น):
```nginx
    # TEMP (Telegram live test, 1 ต.ค. 2026) — ถอดออกหลังจบ
    location = /telegram/webhook-it {
        limit_except POST { deny all; }
        proxy_pass http://127.0.0.1:3390/telegram/webhook;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Telegram-Bot-Api-Secret-Token $http_x_telegram_bot_api_secret_token;
        proxy_set_header Content-Type $content_type;
        proxy_read_timeout 15s;
        client_max_body_size 256k;
        access_log off;
    }
```
(ต้นฉบับ `ops/nginx/telegram-live-isolated.conf.PROPOSED`) · ขั้นตอน: `cp -p` backup config → แทรก → `nginx -t` → reload (อนุมัติ) → **smoke ที่คาด:** ก่อนเซิร์ฟเวอร์ทดสอบรัน `curl -s -o /dev/null -w '%{http_code}' -X POST https://test.my-ener.uk/telegram/webhook-it -d '{}'` = **502** (proxy ไปพอร์ตที่ยังไม่เปิด) · `GET` = **405** (limit_except) · หลัง READY แต่ไม่ส่ง secret header = **401** (แอปตรวจ secret; flag ในระบบทดสอบเป็น true จึงไม่ใช่ 404) · ไม่กระทบ route เดิม (`/`, `/health`, `/r/...`, `/webhook/line` ตอบเหมือนเดิม) · ย้อน = ลบ block + `nginx -t` + reload

## 3. รันเซิร์ฟเวอร์ทดสอบแยกบนเซิร์ฟเวอร์ (หลังข้อ 1–2) — ทุกอย่างจาก worktree ของ `db993b3`
```bash
# 3.1 bootstrap worktree ของ exact SHA (ไม่ checkout/ไม่แตะ container staging — ใช้แค่ object store ของ repo)
cd /root/ener-scan-staging && git fetch -q mirror release/three-tasks
git worktree add --detach /root/ener-tg-live/src-db993b3 db993b3 && git -C /root/ener-tg-live/src-db993b3 rev-parse --short HEAD   # ต้องได้ db993b3
# 3.2 เริ่ม (launcher ตรวจสด: HEAD=SHA · node/docker · disk ≥3G · RAM ≥1G · port 3390 ว่าง · ไฟล์ secret 600 ครบ 5 ตัว · npm ci ถ้าไม่มี node_modules · pull image ถ้าไม่มี)
mkdir -p /root/ener-tg-live/out
bash /root/ener-tg-live/src-db993b3/scripts/ops/tg-live-start.sh db993b3 /root/ener-tg-live/.env.tg-live /root/ener-tg-live/out 3390
#   → พิมพ์ preflight · started pid · แล้วรอจน READY (ห้องทดสอบได้รับ 2 ข้อความ) หรือ FAILED (exit 3, ทรัพยากรถูกเก็บไว้ให้ตรวจ run.log/FAILED.json)
```
- โฮสต์มี node v20, ไม่มี `node_modules` → launcher รัน `npm ci --omit=dev` ใน worktree (ต้องถึง npm registry ~2–3 นาที) · pull `pgvector/pgvector:pg16` + `postgrest/postgrest:v12.2.3` ถ้ายังไม่มี
- READY = ในห้องทดสอบมีข้อความสลิป `LIVE-IT-1`, `LIVE-IT-2` (แพ็ก "สแกน 4 ครั้ง (ทดสอบระบบแยก)" 49 บาท, เหตุผล "ทดสอบระบบแยก — ไม่ใช่ลูกค้าจริง") พร้อมปุ่ม "อนุมัติรายการนี้" · `READY.json` ระบุ `transport: "real"`, `sha: "db993b3"`
- ระบบแยกทั้งหมด: Postgres/PostgREST ใช้แล้วทิ้ง (schema staging ไม่มีข้อมูล) · ไม่มี delivery worker · ไม่เชื่อม DB/คิว staging/Pro · บัญชี/รายการสังเคราะห์ `Utg…` · log ไม่มี token/secret

## 4. setWebhook (เฉพาะ bot ใหม่ · หลังเซิร์ฟเวอร์ READY)
```bash
set -a; . /root/ener-tg-live/.env.tg-live; set +a   # ไม่ echo ค่า
curl -s "https://api.telegram.org/bot$TELEGRAM_APPROVAL_BOT_TOKEN/setWebhook" \
  -d url=https://test.my-ener.uk/telegram/webhook-it -d secret_token="$TELEGRAM_WEBHOOK_SECRET" -d 'allowed_updates=["callback_query"]' -d drop_pending_updates=true | sed -E 's/"description":"[^"]*"//'
curl -s "https://api.telegram.org/bot$TELEGRAM_APPROVAL_BOT_TOKEN/getWebhookInfo" | sed -E 's/"url":"[^"]*"/"url":"<set>"/'   # ตรวจ pending_update_count=0, last_error ว่าง
```
ห้าม: setWebhook ของ bot กลาง/bot Pro · URL อื่นนอกจาก `test.my-ener.uk/telegram/webhook-it`

## 5. ลำดับกดทดสอบในห้อง Telegram (กบ)
1. รายการ `LIVE-IT-1`: กด "อนุมัติรายการนี้" → bot ตอบข้อความ "ยืนยันการอนุมัติ … IT-1" พร้อมปุ่ม "ยืนยันอนุมัติ" (ยังไม่เปลี่ยนสถานะ) → กด "ยืนยันอนุมัติ" → popup "อนุมัติแล้ว เติมสิทธิ์ให้ลูกค้าเรียบร้อย" → กด "ยืนยันอนุมัติ" **ซ้ำ** → popup "ปุ่มนี้ใช้ไม่ได้แล้ว (หมดอายุหรือถูกใช้ไปแล้ว)" → กด "อนุมัติรายการนี้" ซ้ำ → "รายการนี้ไม่อยู่ในสถานะรอตรวจแล้ว (ตอนนี้: paid)"
2. รายการ `LIVE-IT-2`: กด "อนุมัติรายการนี้" → กด "ยืนยันอนุมัติ" รัว ๆ 2–3 ครั้ง → สำเร็จครั้งเดียว ที่เหลือ "ใช้ไม่ได้แล้ว"
3. (ถ้ามีบัญชีที่ 2 ที่ไม่อยู่ในรายชื่อ) ให้กดปุ่มใด ๆ → "บัญชีนี้ไม่มีสิทธิ์อนุมัติ"
4. ไม่ต้อง login เว็บใด ๆ · ทุกครั้งระบบตรวจ secret header + numeric user id + chat id
5. แจ้งผม → `bash /root/ener-tg-live/src-db993b3/scripts/ops/tg-live-stop.sh /root/ener-tg-live/out` → ปิดรับ callback, รอ in-flight, เขียน+ตรวจหลักฐาน → ครบ: `evidence-<ts>.json` (payments paid/approved_by, grants=1, paid_remaining=4, audit, tokens used, outbound `approve_notify|queued`, telegramCalls status 200, blocked=0) และ container/network ถูกลบ · ไม่ครบ: `evidence-PARTIAL-*.json` + `KEEP` → **ไม่ลบ** รายงานก่อน (ไม่ถือว่าผ่าน)

## 6. เกณฑ์ผ่าน (ตาม Codex)
- กบเห็นรายการและกดอนุมัติสองขั้นใน Telegram โดยไม่ login เว็บ ✔ (ข้อ 5.1)
- payment=paid · grant เกิดครั้งเดียว · audit ครบ (notify_sent / approve_requested ok / approve_confirmed ok ×2 โดยดีไซน์ RPC+handler) ✔
- กดซ้ำไม่เติมซ้ำ · ข้อความแจ้งลูกค้าอยู่ใน DB ทดสอบ (`outbound_messages` queued) · ไม่มี LINE จริง (ไม่มี delivery worker + guard `blocked=0`) ✔
- ปฏิเสธสลิปโดยเจ้าหน้าที่ยังไม่มี — ไม่รวม ✔

## 7. Cleanup หลังจบ (เก็บหลักฐานก่อนลบ · ถอดเฉพาะที่สร้างรอบนี้ · ทำเมื่อหลักฐาน `complete:true` เท่านั้น)
1. คัดลอกหลักฐาน: `mkdir -p /root/backup-ops-20260930/tg-live-$(date +%F) && cp /root/ener-tg-live/out/{evidence-*.json,READY.json,run.log} /root/backup-ops-20260930/tg-live-$(date +%F)/` · ตรวจก่อนเก็บว่าไม่มี token/secret: `set -a; . /root/ener-tg-live/.env.tg-live; set +a; grep -c "$TELEGRAM_APPROVAL_BOT_TOKEN\|$TELEGRAM_WEBHOOK_SECRET" /root/ener-tg-live/out/run.log` ต้อง 0
2. `deleteWebhook` ของ bot ใหม่ (`-d drop_pending_updates=true`) → `getWebhookInfo` url ว่าง
3. ถอด location `/telegram/webhook-it` ออกจาก nginx → `nginx -t` → reload (อนุมัติรอบเดียวกับข้อ 2) → `POST …/telegram/webhook-it` ต้อง 404 จาก nginx (route หาย)
4. container/network ถูกลบโดย harness ตอน STOP เมื่อหลักฐานครบ (ตรวจ `docker ps -a | grep -c ener-tg-it` = 0, port 3390 ปิด) · ถ้ามี `KEEP` ให้ตรวจ/รายงานก่อน แล้วรันคำสั่งใน log `TG_LIVE_RESOURCES_KEPT.cleanupWhenDone`
5. ลบ worktree bootstrap: `git -C /root/ener-scan-staging worktree remove --force /root/ener-tg-live/src-db993b3` (ไม่แตะ checkout/branch ของ staging)
6. ไฟล์ secret: กบเลือก เก็บไว้ (600) สำหรับรอบ staging จริง หรือ `shred -u`
7. ไม่มีอะไรต้องล้างใน DB staging/Pro (ไม่เคยแตะ)

## 8. สิ่งที่ยังไม่ทำจนกบอนุมัติชุดนี้
ไม่แก้/reload nginx · ไม่ setWebhook · ไม่ส่งข้อความ Telegram จริง · ไม่รันเซิร์ฟเวอร์ทดสอบบนเซิร์ฟเวอร์ · ไม่แตะ Pro/staging
