# ชุดขออนุมัติ live ครั้งเดียว — Telegram จริง → ระบบทดสอบแยก (วิธี A) · 1 ต.ค. 2026

สิ่งที่จะพิสูจน์: "กบเห็นรายการและกดอนุมัติสองขั้นใน Telegram โดยไม่ login เว็บ → payment=paid, grant ครั้งเดียว, audit ครบ, กดซ้ำไม่เติมซ้ำ, ข้อความแจ้งลูกค้าอยู่ใน DB ทดสอบ, ไม่มี LINE จริง"
สิ่งที่ **ไม่ใช่**: ไม่ใช่ staging ทั้งชุด (ไม่ deploy แอป staging ไม่เปิด flag staging ไม่แตะ DB/คิว staging/Pro) · "ปฏิเสธสลิปโดยเจ้าหน้าที่ผ่าน Telegram" ยังไม่มี ไม่นับเป็นฟีเจอร์ที่ผ่าน
ผลที่จะรายงานหลังผ่าน: **live Telegram บนระบบแยก PASS** · deploy/config บน staging จริง = ขั้นถัดไป

## 0. โค้ด/หลักฐานภายใน (ทำแล้ว)
- **exact SHA ที่ใช้รัน: `ec30253`** (มี parser fix `90a400c` + โหมด `--live`) — harness สร้าง git worktree ของ SHA นี้และตรวจ `rev-parse` ก่อนรัน; โค้ด router/handler/RPC/service มาจาก worktree ไม่ใช่ checkout ปัจจุบัน
- dry-run โหมด live (Telegram ปลอม) ที่ `ec30253`: เซิร์ฟเวอร์รอรับ callback จน STOP · เส้นทาง 401 (secret ผิด) → denied (คนนอก/ผิดห้อง) → ขั้น 1 → ขั้น 2 paid+grant 1 → กดซ้ำ "ปุ่มนี้ใช้ไม่ได้แล้ว" → รายการที่ 2: 3 คนกดยืนยันพร้อมกัน → grant 1 → `rj:` "ปุ่มนี้ไม่รองรับ" → STOP → หลักฐาน JSON (payments/grants/audit/tokens/outbound queued/blocked=0) · ไม่มี token/secret ในไฟล์ใด · containers/worktree/port ถูกเก็บกวาดครบ
- automated harness 12/12 PASS · gate ✅ (รวม `tests/itNetworkGuard.test.js`)
- network guard ในโหมด live: อนุญาตเฉพาะ host `api.telegram.org` (ตรงตัว) · LINE/AI/อื่น ๆ บล็อกก่อนส่ง · self-test ยืนยันทุกช่องทางก่อนเริ่ม

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
(ต้นฉบับ `ops/nginx/telegram-live-isolated.conf.PROPOSED`) · ขั้นตอน: `cp -p` backup config → แทรก → `nginx -t` → reload (อนุมัติ) → ตรวจ `curl -X POST https://test.my-ener.uk/telegram/webhook-it` ได้ 404 ขณะเซิร์ฟเวอร์ทดสอบยังไม่รัน/ไม่มี secret → ไม่กระทบ route เดิม (`/`, `/health`, `/r/...`, `/webhook/line` ตอบเหมือนเดิม) · ย้อน = ลบ block + `nginx -t` + reload

## 3. รันเซิร์ฟเวอร์ทดสอบแยกบนเซิร์ฟเวอร์ (หลังข้อ 1–2)
```bash
cd /root/ener-scan-staging && git fetch -q mirror release/three-tasks   # ให้มี SHA ec30253 ใน repo (ไม่ checkout ไม่แตะ container)
mkdir -p /root/ener-tg-live/out && cd /root/ener-scan-staging && \
ENER_TG_LIVE_SHA=ec30253 ENER_TG_LIVE_ENV_FILE=/root/ener-tg-live/.env.tg-live ENER_TG_LIVE_OUT=/root/ener-tg-live/out ENER_TG_LIVE_PORT=3390 \
nohup node scripts/ops/test-telegram-approval-integration.mjs --live > /root/ener-tg-live/out/run.log 2>&1 &
```
- โฮสต์มี node v20 แต่ไม่มี `node_modules` → harness รัน `npm ci --omit=dev` ใน worktree เอง (ต้องถึง npm registry; ~2–3 นาที) · ต้อง pull `pgvector/pgvector:pg16` + `postgrest/postgrest:v12.2.3` (ดิสก์ว่าง 12G พอ)
- สคริปต์ที่รันคือไฟล์ของ **worktree `ec30253`** (parent spawn child จาก worktree) — ตรวจ `TG_LIVE_CODE.sha` ใน log
- พร้อมเมื่อมี `/root/ener-tg-live/out/READY.json` และในห้องทดสอบมีข้อความสลิป 2 รายการ (`LIVE-IT-1`, `LIVE-IT-2`, แพ็ก "สแกน 4 ครั้ง (ทดสอบระบบแยก)" 49 บาท, เหตุผล "ทดสอบระบบแยก — ไม่ใช่ลูกค้าจริง") พร้อมปุ่ม "อนุมัติรายการนี้"
- ระบบแยกทั้งหมด: Postgres/PostgREST ใช้แล้วทิ้ง (schema staging ไม่มีข้อมูล) · ไม่มี delivery worker · ไม่เชื่อม DB/คิว staging/Pro · บัญชี/รายการสังเคราะห์ `Utg…`

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
5. แจ้งผม → ผม `touch /root/ener-tg-live/out/STOP` → หลักฐาน `/root/ener-tg-live/out/evidence-<ts>.json` (payments paid/approved_by, grants=1, paid_remaining=4, audit, tokens used, outbound `approve_notify|queued`, blocked=0) → containers/worktree ถูกลบอัตโนมัติ

## 6. เกณฑ์ผ่าน (ตาม Codex)
- กบเห็นรายการและกดอนุมัติสองขั้นใน Telegram โดยไม่ login เว็บ ✔ (ข้อ 5.1)
- payment=paid · grant เกิดครั้งเดียว · audit ครบ (notify_sent / approve_requested ok / approve_confirmed ok ×2 โดยดีไซน์ RPC+handler) ✔
- กดซ้ำไม่เติมซ้ำ · ข้อความแจ้งลูกค้าอยู่ใน DB ทดสอบ (`outbound_messages` queued) · ไม่มี LINE จริง (ไม่มี delivery worker + guard `blocked=0`) ✔
- ปฏิเสธสลิปโดยเจ้าหน้าที่ยังไม่มี — ไม่รวม ✔

## 7. Cleanup หลังจบ (เก็บหลักฐานก่อนลบ · ถอดเฉพาะที่สร้างรอบนี้)
1. คัดลอกหลักฐาน: `cp /root/ener-tg-live/out/evidence-*.json /root/ener-tg-live/out/run.log /root/backup-ops-20260930/tg-live-$(date +%F)/` (log ไม่มี token/secret — ตรวจ `grep -c` ด้วยค่าจากไฟล์ secret ก่อนเก็บ)
2. `deleteWebhook` ของ bot ใหม่ (`-d drop_pending_updates=true`) → `getWebhookInfo` url ว่าง
3. ถอด location `/telegram/webhook-it` ออกจาก nginx → `nginx -t` → reload (อนุมัติรอบเดียวกับข้อ 2) → `curl -X POST …/telegram/webhook-it` ต้อง 404 จาก nginx
4. containers `ener-tg-it-*`/network/worktree ถูกลบโดย harness ตอน STOP (ตรวจ `docker ps -a | grep ener-tg-it` = 0, `git worktree list` ไม่มี tg-live, port 3390 ปิด)
5. ไฟล์ secret: กบเลือก เก็บไว้ (600) สำหรับรอบ staging จริง หรือ `shred -u`
6. ไม่มีอะไรต้องล้างใน DB staging/Pro (ไม่เคยแตะ)

## 8. สิ่งที่ยังไม่ทำจนกบอนุมัติชุดนี้
ไม่แก้/reload nginx · ไม่ setWebhook · ไม่ส่งข้อความ Telegram จริง · ไม่รันเซิร์ฟเวอร์ทดสอบบนเซิร์ฟเวอร์ · ไม่แตะ Pro/staging
