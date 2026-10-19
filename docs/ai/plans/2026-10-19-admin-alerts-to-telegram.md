# ย้ายแจ้งเตือนแอดมินทั้งหมดไป Telegram (staging + Pro) — สำรวจผู้ส่ง + แบบ + แผน (19 ต.ค. 2026, เวลาไทย)

คำสั่ง Codex/กบ 19 ต.ค.: ย้าย alarm/แจ้งเตือนแอดมินทั้งหมดไป Telegram เท่านั้น · **ยกเว้นงานอนุมัติสลิป (คงเดิม ไม่ย้าย ไม่ปิด ไม่เปิด Telegram approval เพิ่ม)** · ข้อความถึงลูกค้ายัง LINE · ระบุ environment ชัด · กันส่งซ้ำ + retry · **ห้าม fallback LINE** · ตรวจ bot/ห้องให้ชัดก่อน ไม่ส่ง token ในแชต · สำรวจ → patch+staging → SHA ให้ Codex → ขออนุมัติ deploy แยก · ก่อนปิดผู้ส่ง LINE เดิมต้องพิสูจน์ว่า Telegram รับได้

## 1. Inventory ผู้ส่ง (read-only 19 ต.ค. 08:10–08:40 น.)

### 1a. ในแอป ener-scan (staging + Pro รันโค้ดเดียวกัน) — ส่งหาแอดมินทาง **LINE** (ต้องย้าย)
| # | source (ไฟล์) | trigger | ผู้รับ/ช่องทาง | dedupe/retry เดิม | 7 วันที่ผ่านมา (Pro / staging) | ทำอะไร |
|---|---|---|---|---|---|---|
| L1 | `maintenanceDlqAlert.service.js` (worker-maintenance ทุก 60 วิ) | outbound dead/failed ≥ threshold | LINE push `ADMIN_LINE_USER_ID` (=กบ) | signature sha256 · marker 6 ชม. หลังส่งสำเร็จ · lock 50 วิ | Pro 0 / **staging DLQ_ALERT_SENT 15** (แถว dead ทดสอบ 14 ต.ค. — ภาพที่กบส่ง 9:55/15:55/21:55/3:55) | ย้าย → Telegram ผ่าน adminAlert |
| L2 | `scanV2/smartRejection.service.js notifyAdminRejectionStreak` (webhook) | ลูกค้ารูปโดนปัด ≥5 ครั้งติด | LINE push admin (best-effort ไม่มี retry) | ไม่มี (นับครั้งใน redis) | Pro SMART_REJECTION_TEXT 2 (ยังไม่ถึง 5) | ย้าย |
| L3 | `scanV2/processScanJob.service.js:606` (worker-scan) | เดียวกับ L2 ฝั่ง worker (ครั้งที่ ≥5) | **แถว outbound_messages ถึง admin** (worker-delivery ส่ง LINE) | ผ่านคิว outbound (retry/DLQ ของคิว) | 0 | ย้าย (เลิกยืมคิวลูกค้า) |
| L4 | `monitor/customerAlerts.service.js` | ลูกค้ากวน/พิมพ์ซ้ำ ≥3 ใน 15 นาที / ถามว่าเป็น AI | **tg + LINE ทั้งคู่** | lease 60 วิ + sent marker ต่อช่องทาง · timeout 8 วิ | Pro CUSTOMER_ALERT_SENT 1 | ตัดช่อง LINE คง tg (ผ่าน adminAlert ให้มี env) |
| L5 | `adminPaymentSlipNotify.service.js` | สลิปเข้า pending_verify | LINE push admin (+ Telegram approval เมื่อเปิด) | — | — | **ยกเว้น คงเดิม** (งานอนุมัติสลิป) |
| L6 | `config/env.js ADMIN_ERROR_NOTIFY` "critical server errors → LINE" | — | — | — | **ไม่มีผู้เรียกในโค้ดแล้ว** (dead config) | ไม่มีอะไรต้องย้าย (ลบ/คงได้) |
| L7 | `routes/lineWebhook.js` (adminUid) | คำสั่งแอดมิน/ยกเว้นแบน | ไม่ใช่ผู้ส่ง | — | — | ไม่เกี่ยว |
| L8 | `outboundAdminEnqueue.enqueueAdminSystemText` | แอดมินกดรีเซ็ต/ส่งข้อความระบบ **ถึงลูกค้า** | LINE ลูกค้า | — | — | ข้อความบริการลูกค้า ไม่ย้าย |

### 1b. ในแอป — ส่ง **Telegram อยู่แล้ว** (bot `@Eneraibot` → chat private "Kob" · token/chat เดียวกันทั้ง Pro และ staging)
| # | source | trigger | env label? | 7 วัน (Pro / staging) |
|---|---|---|---|---|
| T1 | `chatQualityDailyReport.service.js` (maintenance, ชั่วโมง REPORT_HOUR_BKK, dedupe/วัน) | รายงานคุณภาพแชตรายวัน | **ไม่มี** (Pro/staging ส่งเข้าห้องเดียวกัน แยกไม่ออก) | 4 / 4 |
| T2 | `objectInfoGate/objectInfoDailyReport.service.js` | สรุปเกตเก็บรุ่น/วัดรายวัน | ไม่มี | 4 / 4 |
| T3 | `ban/bannedUsers.repo.js`, `ban/banReconcileQueue.js` | CRITICAL เช็คแบนล้ม/คิว reconcile ใช้ไม่ได้ | ไม่มี | 0 |
| T4 | `stores/conversationMessages.db.js maybeAlertAjarnMoneyBreach` | CRITICAL เสียงอาจารย์หลุดคำการเงิน (dedupe 1 ชม./uid) | ไม่มี · **มี uid เต็ม** ในข้อความ (ควร mask) | 0 |
| T5 | `fbShowcase/*`, `scanYoutubeShort` | S-Alert/คลิป/แคปชันโพสต์ | ไม่มี | — |
| T6 | `customerAlerts` ช่อง tg | ดู L4 | ไม่มี | 1 |

### 1c. นอกแอป (บนเซิร์ฟเวอร์เดียวกัน)
| # | source | ส่งไปไหน | สถานะ | ทำอะไร |
|---|---|---|---|---|
| X1 | **legacy stack** `ener-scan`, `ener-scan-worker-*` (ไม่มี suffix; image ก.ค. 2026; DB `ener_scan` legacy) — มี `maintenanceDlqAlert` + `adminPaymentSlipNotify` และ `ADMIN_LINE_USER_ID` **ค่าเดียวกับ Pro** | LINE กบ (ถ้ามีเหตุ) | 7 วันไม่มี event ส่ง | กติกาเดิม: ห้ามหยุด/แก้ legacy จนกบยืนยัน → **เสนอให้กบตัดสิน**: หยุด stack หรือถอด `ADMIN_LINE_USER_ID` (ต้อง recreate) — ไม่ทำในรอบนี้ |
| X2 | `monitor-proxy/index.mjs` (`ener-scan-monitor-proxy`) | LINE OTP ล็อกอินหน้า monitor → `MONITOR_ADMIN_LINE_USER_ID` | 7 วัน 0 | เป็น OTP ล็อกอิน ไม่ใช่ alarm · **ถามกบ**: ย้าย OTP ไป Telegram ด้วยไหม (ไม่ย้ายในรอบนี้ถ้าไม่สั่ง) |
| X3 | cron `llm-cost-pull.py` (ทุก 30 นาที) | Telegram (อ่าน token/chat จาก `.env` Pro) | ส่งอยู่ | อยู่ Telegram แล้ว · ไม่มี env label (เป็นรายงานต้นทุนรวม) |
| X4 | cron `yt-web-feed.py`, `ener-cleanup.sh`, docker prune | ไม่ส่งแจ้งเตือน | — | ไม่เกี่ยว |
| X5 | `ener-ai` (แอปแยก): `standup_agent.py` → LINE **group** (`line_to` ใน config ของ ener-ai) · `scheduler.py`/`diagnostics.py` → Telegram | 7 วัน 0 push | แอปคนละตัว นอกขอบเขต ener-scan → **ถามกบ** ว่าให้ปิด standup LINE ด้วยไหม |
| X6 | `ener-local` | Telegram bot ของตัวเอง | — | ไม่เกี่ยว |
| X7 | n8n (`ener-autopost-n8n-1`) | workflow **0 รายการ** | — | ไม่มีผู้ส่ง |
| X8 | **Hermes Agent บนเครื่อง kob-dev** ดึง `/internal/chat-quality/latest?token=…` (route `chatQualityReport.routes.js`) แล้วโพสต์ "Cronjob Response: ener_chat_quality (job_id 33595b0feed1)" | ไม่ได้อยู่บนเซิร์ฟเวอร์นี้ · ปลายทางที่กบเห็นคือ chat ของ Hermes | รายงานเดียวกับ T1 ที่ส่ง Telegram อยู่แล้ว | **ถามกบ**: ปิด job ที่ Hermes (ซ้ำกับ T1) หรือคงไว้ — เซิร์ฟเวอร์ทำอะไรไม่ได้ |

### 1d. ข้อความถึงลูกค้า (ไม่ย้าย ไม่แตะ)
ผลสแกน/pre_scan_ack/paywall/ตอบแชต/แจ้งรับชำระ/approve_notify/renewal reminder/daily pick/synergy intro → LINE ลูกค้าเหมือนเดิม

## 2. ห้อง/bot ที่จะใช้ — **ต้องเคาะ ไม่อนุมาน**
- bot/ห้องที่มีอยู่: `TELEGRAM_BOT_TOKEN` = `@Eneraibot` → `TELEGRAM_CHAT_ID` = chat **ส่วนตัว "Kob"** (ใช้ทั้ง Pro+staging; รายงาน T1–T5 และ llm-cost เข้าห้องนี้อยู่แล้ว)
- bot อนุมัติสลิปทดสอบ (`@ener_kob_approval_test_bot`, ห้องกลุ่ม -5440947116, `TELEGRAM_CONFIG_*` staging) — **ไม่ใช้** สำหรับ alert (ตาม Codex ข้อ 5)
- แบบที่เสนอ: ตัวแปรใหม่ **`ADMIN_ALERT_TELEGRAM_CHAT_ID`** (จำเป็น) + `ADMIN_ALERT_TELEGRAM_BOT_TOKEN` (ไม่ตั้ง = ใช้ `TELEGRAM_BOT_TOKEN`) · ไม่ตั้ง chat = alert เข้า outbox ค้าง + log `ADMIN_ALERT_NOT_CONFIGURED` (ไม่ส่ง LINE ไม่เงียบ) · **กบเลือก**: (ก) ห้องส่วนตัว "Kob" เดิม (ตั้งค่า = TELEGRAM_CHAT_ID) หรือ (ข) สร้างกลุ่ม "Ener Alerts" ใหม่ แล้วเชิญ @Eneraibot ส่ง chat id มา (ไม่ต้องส่ง token)

## 3. แบบ (patch)
- **ช่องทางกลาง** `src/services/adminAlerts/adminAlert.service.js`: `sendAdminAlert({ category, severity, text, dedupeKey?, dedupeSec? })` → ข้อความขึ้นต้น `[<env label>][<category>][<severity>]` (env label = APP_ENV หรือ host ของ APP_BASE_URL เช่น `scan.my-ener.uk` / `test.my-ener.uk`) → ส่ง Telegram (sendMessage, ตัดก้อน 3900) → สำเร็จ = ตั้ง dedupe marker (redis) · ล้ม/429/timeout = **เขียน outbox** (ไม่ fallback LINE)
- **outbox durable** `sql/068_admin_alert_outbox.sql`: ตาราง `admin_alert_outbox(…)` · **สิทธิ์ (รอบ 2): web_anon/PUBLIC ไม่มีสิทธิ์ใด ๆ** · เขียน/claim/finish ผ่าน RPC SECURITY DEFINER ด้วย role จำกัด `admin_alert_writer` (JWT `ADMIN_ALERT_DB_KEY`) หรือ service_role · ไม่มีใครเขียนตารางตรง · idempotent
- **sweeper** ใน maintenance ทุก 60 วิ: หยิบ queued ที่ `next_attempt_at <= now` (≤20/รอบ, FOR UPDATE SKIP LOCKED ผ่าน RPC หรือ claim แบบ status flip) → ส่ง → sent / ล้ม → attempts+1, backoff 1,2,4…60 นาที, เคารพ `retry_after` ของ 429, เกิน 24 ชม. = failed (ยังอยู่ในตาราง ตรวจได้) · log `ADMIN_ALERT_SENT/RETRY/FAILED/NOT_CONFIGURED`
- **dedupe**: marker redis หลังส่งสำเร็จเท่านั้น (เหมือน DLQ) · outbox กันซ้ำด้วย `dedupe_key` + partial unique (queued) · DLQ ยังใช้ signature 6 ชม. เดิม
- **ย้าย**: L1 (DLQ), L2, L3 (เลิก insert outbound ถึง admin), L4 (ตัดช่อง LINE; tg ผ่าน adminAlert) · T3/T4 ผ่าน adminAlert (ได้ env label + outbox; T4 mask uid) · T1/T2 รายงานรายวัน: ใส่ env label บรรทัดแรก (ส่งผ่าน adminAlert category `report`)
- **ไม่แตะ**: L5 สลิป · ข้อความลูกค้า · legacy/monitor-proxy/ener-ai/Hermes (รอกบ) · ไม่ปิด alert ไม่ลบแถว DLQ (แถว dead staging คงอยู่ → หลังย้าย DLQ alert จะเข้า Telegram ทุก 6 ชม. แทน LINE)
- **ปิดผู้ส่ง LINE เดิม**: โค้ดใหม่ไม่เรียก LINE อีกเลย (ไม่ใช่สวิตช์) · `ADMIN_LINE_USER_ID` ยังต้องมีเพื่อ L5 และสิทธิ์แอดมินใน webhook
- **ทดสอบ**: unit (prefix/env/dedupe/outbox on failure/no LINE call), sweeper (backoff/429/failed), DLQ+customerAlerts ไม่มี pushMessage ถึง admin · staging: ตั้ง chat → DLQ แถว dead เดิม → ต้องเห็นใน Telegram 1 ครั้ง แล้ว SKIPPED 6 ชม. · จำลอง Telegram ล้ม (token ผิดชั่วคราว? ไม่ทำบน staging จริง — ใช้ unit) · log ไม่มี pushMessage(admin)
- **rollback**: deploy-pinned กลับ SHA ก่อนหน้า · 068 คงไว้ (additive)

## 4. ขั้นตอน
1. (เสร็จ) สำรวจ §1 → 2. กบเคาะห้อง §2 (+ X1/X2/X5/X8) → 3. patch + unit/gate → 4. deploy staging + ตั้ง `ADMIN_ALERT_TELEGRAM_CHAT_ID` staging → พิสูจน์ DLQ alert เข้า Telegram ไม่เข้า LINE → 5. SHA + หลักฐานให้ Codex → 6. กบอนุมัติ deploy Pro (pinned) + ตั้ง env Pro (recreate app+workers) → 7. ตรวจหลัง deploy: ไม่มี LINE admin push (log) · Telegram ได้รับ · outbox ว่าง

## 5. ผลการทำ patch (19 ต.ค. 2026 — ขั้น 3) · **ยังไม่ deploy ที่ไหน รอ Codex ตรวจ + กบเคาะห้อง**
- `sql/068_admin_alert_outbox.sql` — ตาราง outbox + RPC `admin_alert_outbox_claim(limit)` (queued ถึงเวลา / sending ค้าง >10 นาที → sending, FOR UPDATE SKIP LOCKED) + `admin_alert_outbox_finish(id, ok, error, retry_after)` (sent / queued+backoff 1,2,4,8,16,32,60 นาที เคารพ retry_after / failed เมื่อ ≥12 ครั้ง หรืออายุ >24 ชม. — แถวคงอยู่) · grant web_anon/service_role (เหมือน outbound) · partial unique `dedupe_key` ขณะ queued/sending · idempotent ×2 ✓ · DB test `scripts/ops/test-admin-alert-outbox-db.mjs` PASS (container แยก)
- `src/services/adminAlerts/adminAlert.service.js` — `sendAdminAlert({category, severity, text, dedupeKey?, dedupeSec?})`: ขึ้นต้น `[env][category][severity]` · ปลายทาง `ADMIN_ALERT_TELEGRAM_CHAT_ID` (จำเป็น ไม่อนุมานห้อง) + `ADMIN_ALERT_TELEGRAM_BOT_TOKEN`‖`TELEGRAM_BOT_TOKEN` · สำเร็จ → marker redis · ส่งล้ม/429/timeout → outbox (`ADMIN_ALERT_QUEUED`) · outbox เขียนไม่ได้ → `ADMIN_ALERT_LOST` (ไม่ throw) · **ยังไม่ตั้งค่า** (chat id/token ว่างหรือรูปแบบผิด เช่น placeholder) → `ADMIN_ALERT_NOT_CONFIGURED` พร้อมข้อความเต็มใน log ไม่แตะ DB (DLQ ไม่ตั้ง marker จึง log ซ้ำทุกรอบจนตั้งค่า — มองเห็นชัด) · **ไม่มีเส้นทาง LINE** · `sweepAdminAlertOutbox()` ใน maintenance ทุก 60 วิ (`ADMIN_ALERT_OUTBOX_SENT/RETRY/FAILED/SWEEP`) · รองรับผู้เรียกเดิมแบบ string
- ย้ายผู้ส่ง: L1 `maintenanceDlqAlert` (signature/6 ชม./lock เดิม; marker เมื่อ ok หรือ queued; ไม่มี `@line/bot-sdk`) · L2 `smartRejection.notifyAdminRejectionStreak` (dedupe 1 ชม./uid/attempt, mask uid) · L3 `processScanJob` เลิก insert outbound ถึง admin → เรียก L2 · L4 `customerAlerts` ถอดช่อง LINE, tg ผ่าน adminAlert · T3 ban CRITICAL ×3 + T4 money breach → adminAlert severity high (mask uid) · T1/T2/T5 รายงานเดิมยังส่งห้องรายงาน (`TELEGRAM_CHAT_ID`) แต่ `sendTelegramText` ใส่ `[env]` นำหน้าทุกข้อความ · **L5 สลิป pending_verify ไม่แตะ** (ยัง LINE แอดมิน) · ข้อความลูกค้าไม่แตะ
- `.env.example` +`ADMIN_ALERT_TELEGRAM_CHAT_ID`, `ADMIN_ALERT_TELEGRAM_BOT_TOKEN` · preflight +4 แถว 068 · md5 reference 33 ฟังก์ชัน
- เทสต์: `tests/adminAlert.behavior.test.js` 6/6 (config ไม่อนุมานห้อง, ส่งสำเร็จ+dedupe, network/429/500 → outbox + retry_after, not configured → outbox + log, outbox ล้ม → LOST, sweeper sent/retry/not-configured, static: ไม่มี LINE แอดมินใน 4 ผู้ส่ง + สลิปคงเดิม) · `dlqAlert.dedupe` 11/11 (ปรับเป็น adminAlert + เคส queued) · `maintenanceDlqAlert.service` 5/5 (เขียนใหม่) · `banSystem` ปรับเคส channel isolation (LINE ไม่ถูกเรียก) · gate ดูด้านล่าง
- **ก่อน deploy ต้องเคาะ (กบ):** ห้อง alert (§2 ก/ข) → ตั้ง `ADMIN_ALERT_TELEGRAM_CHAT_ID` บน staging ก่อน → deploy staging → DLQ แถว dead เดิมต้องเข้า Telegram 1 ครั้ง (`DLQ_ALERT_SENT channel=telegram`) แล้ว `SKIPPED` 6 ชม. · LINE กบไม่ได้รับ DLQ อีก · outbox ว่าง → SHA ให้ Codex → Pro (apply 068 + env + deploy-pinned)

## 6. Codex รอบ 2 (19 ต.ค. 2026) — แก้ 4 ข้อ บน `d8bd33b` → SHA ใหม่ (ดู git log) · ยังไม่ deploy
| ข้อ | ปัญหาที่ Codex จำลองได้ | ที่แก้ | regression |
|---|---|---|---|
| 1 DLQ ส่งจริงไม่ได้ | `maintenanceDlqAlert` ส่ง `env` จาก config module (ไม่มีตัวแปร Telegram) ทับให้ `sendAdminAlert` → `not_configured` | `resolveAdminAlertEnv(overrides)` = process.env เป็นฐาน ทับเฉพาะ key ที่มีค่า (ใช้ทั้ง sendAdminAlert/sweep/DLQ) · DLQ ส่ง `fetch/db/alertRedis` ต่อให้ adminAlert · token เลือก `ADMIN_ALERT_TELEGRAM_BOT_TOKEN` เฉพาะเมื่อรูปแบบถูก (placeholder → ใช้ `TELEGRAM_BOT_TOKEN`) | `maintenanceDlqAlert.service.test` เส้นจริง: ตั้งค่าใน process.env + deps.env แบบ config (ไม่มี Telegram) → fetch ถึง chat id จริง · adminAlert: merge ทับเฉพาะ key |
| 2 สิทธิ์ web_anon กว้าง | anon insert/claim/finish ได้ → ยัดข้อความ/ปลอม sent | 068 เขียนใหม่: `CREATE ROLE admin_alert_writer NOLOGIN` (+GRANT TO authenticator) · REVOKE ALL จาก PUBLIC/web_anon/service_role/writer บนตาราง+sequence · RPC `admin_alert_outbox_enqueue` ใหม่ (dedupe ใน DB) · EXECUTE 3 RPC ให้ writer+service_role เท่านั้น · service_role SELECT (ops) · แอป: `adminAlertDbClient(ADMIN_ALERT_DB_KEY)` ไม่ใช้ client anon · ไม่มี key → `ADMIN_ALERT_LOST db_key_missing` / sweep ข้าม+log | DB test (container แยก): anon select/insert/enqueue/claim/finish = permission denied · writer insert/update ตรง = denied · RPC ได้ · preflight 3 แถวใหม่ · md5: enqueue `8d79dec9…` finish `94e7d64d…` claim เดิม |
| 3 finish ล้มแต่รายงานสำเร็จ | ไม่ตรวจ `error` ของ finish → `sent:1` ทั้งที่แถวค้าง | `finishWithRetry` ×3 · Telegram รับแล้ว+finish ล้ม = `sentUnrecorded` (ไม่ใช่ sent, ไม่ log SENT) + log `ADMIN_ALERT_OUTBOX_FINISH_FAILED {id, telegramDelivered:true, recovery}` + จำ id ในโปรเซส → รอบถัดไป claim id เดิม = finish(ok) **ไม่ส่งซ้ำ** (`recovered`) · ส่งล้ม+finish ล้ม = `finishFailed` (แถวคง sending → claim ใหม่หลัง 10 นาที) · **ทางกู้:** โปรเซส restart → แถว sending ถูก claim ใหม่หลัง 10 นาที → ส่งซ้ำได้ 1 ครั้ง (ยอมรับ ดีกว่าเงียบ) · finish RPC idempotent บนแถว sent (`already:true`) ไม่ถอยกลับ queued | adminAlert test: finish ล้ม 3 ครั้ง → sentUnrecorded=1 sent=0 ไม่มี log SENT · รอบถัดไป fetch=0 recovered=1 · DB test: finish ซ้ำ = already |
| 4 ตัดข้อความไม่ครบ | `chunkText("header\n"+5000)` → [6, 5000] | เขียน `chunkText` ใหม่: บรรทัดยาวเกินถูกแบ่งเสมอ (ไม่ว่าอยู่หลัง buffer) → [6, 3900, 1100] · `sendTelegramDirect` คืน `sentParts/remainingText` · ส่งสำเร็จบางก้อน → outbox เก็บเฉพาะที่เหลือ (`(ต่อ — ส่วน x-y …)`) · sweeper: finish `p_text` = ส่วนที่เหลือ (068 finish รับ `p_text`) → retry ไม่ส่งก้อนสำเร็จซ้ำ | adminAlert test: chunk [6,3900,1100] ทุกก้อน ≤ limit · ส่ง 2/4 สำเร็จ → outbox มีเฉพาะ b…+TAIL · sweeper 1/2 → p_text = TAIL · DB test: p_text แทนข้อความ / NULL คงเดิม |

**ผลทดสอบรอบ 2:** `adminAlert.behavior` 10/10 · `maintenanceDlqAlert.service` 6/6 · `dlqAlert.dedupe` 11/11 · `banSystem` ผ่าน · DB test 068 PASS (container แยก) · gate ✅ ไม่มี fail ใหม่
**Ops เพิ่มก่อน deploy (ทุก env):** `node scripts/ops/gen-restricted-jwt.mjs <env-file> ADMIN_ALERT_DB_KEY admin_alert_writer` (หลัง apply 068 เพื่อให้ role มีอยู่; JWT ไม่ผูกกับ DB จึงสร้างก่อนได้) → recreate **ทุก** container ที่ส่ง alert (web, worker-scan, worker-maintenance) · ยังรอกบเคาะห้อง `ADMIN_ALERT_TELEGRAM_CHAT_ID`

## 7. Codex รอบ 3 (19 ต.ค. 2026) — ข้อ 3 partial + finish ล้ม · บน `96e177c` → SHA ใหม่ (ดู git log) · ยังไม่ deploy
- **ปัญหา:** ก้อน A สำเร็จ → B ล้ม → finish ล้ม 3 ครั้ง → claim ใหม่ ส่งลำดับ A,B,A,B (จำเฉพาะกรณีส่งครบ)
- **แก้:** sweeper จำ `progress[id] = { delivered, remainingText }` ทุกกรณีที่ finish ล้ม · รอบถัดไป: delivered → finish(ok) ไม่ส่ง · partial → ส่งเฉพาะ `remainingText` (มีหัว "(ต่อ — ส่วน x-y …)" ตรงกับ `p_text` ที่พยายามบันทึก) · finish สำเร็จ → ลบความจำ (`recovered`, `resumedFromPartial` ใน log)
- **ทางกู้ (ถ้อยคำใหม่):** โปรเซส restart = ความจำหาย → แถว sending ถูก claim ใหม่หลัง 10 นาทีและส่งตาม text ใน DB = **at-least-once อาจส่งซ้ำ** (ไม่รับประกันจำนวนครั้ง) — ระบุใน log `ADMIN_ALERT_OUTBOX_FINISH_FAILED.recovery` และ docstring
- **regression:** `adminAlert.behavior` ลำดับ fetch = A,B,B (ไม่ส่ง A ซ้ำ) · กู้แล้ว finish ok → sent/recovered=1 · partial ซ้ำตอนกู้ (B ล้มอีก + finish ล้ม) → ยังจำเฉพาะ B · log ต้องมีคำว่า at-least-once · 10/10 · DB test 068 PASS · gate ✅

## 8. Runbook ขั้น staging (Codex GO ทางเทคนิค 19 ต.ค. 2026 บน `3cde8c0` + replay tool ที่ SHA นี้) — **รอกบเคาะห้อง + อนุมัติก่อน ไม่ทำเอง**
**ก่อนเริ่ม (กบ):** (1) เลือกห้อง: (ก) แชตส่วนตัว "Kob" ผ่าน @Eneraibot เดิม = ค่าเดียวกับ `TELEGRAM_CHAT_ID` · (ข) กลุ่มใหม่ เชิญ @Eneraibot แล้วส่ง chat id (ตัวเลข ไม่ต้องส่ง token) · (2) อนุมัติขั้น 1–6 ด้านล่างสำหรับ **staging เท่านั้น**

ไฟล์จาก ops worktree ที่ SHA นี้ (ตรวจ sha256 ก่อนใช้ ไม่ตรง = หยุด):
| ไฟล์ | sha256 |
|---|---|
| `sql/068_admin_alert_outbox.sql` | `fc455f3825bed8e5f966e480708ab485a8698e62107a5926b9ca0ffcf7a0367b` |
| `scripts/ops/gen-restricted-jwt.mjs` | `78d5d9628b855b4d7c014b8c65f616ad258dc42361430e1431e6533a9ec42a12` |
| `scripts/ops/deploy-pinned.sh` | `01e8037834971d6e27190b60646f54e8712dfdb9bb25ce47c47c4c9227c1b3a9` |
| `scripts/ops/preflight-three-tasks-migrations.sql` | `127189e7bb7c400f9a26eb0bef341adaf7f5224d4de1d61ede4c262488a9ee51` |
| `scripts/ops/migration-function-md5.reference.txt` | `5c6e0a845909cd425952a279020111b30e98673980438c3dc7573fea6a748797` |
| `scripts/ops/chat-quality-replay.mjs` | `bd6b607cbe8528ac7cd1fb7c33f7d2d1f5a0cf5b8ca2861fe6a518e1557e4305` |

1. **ops worktree:** `git clone --no-checkout /root/ener-scan-mirror.git /root/ener-ops-<sha7> && git -C /root/ener-ops-<sha7> checkout --detach <sha40>` → ตรวจ rev-parse + sha256 ตาราง
2. **backup + preflight (read-only):** `pg_dump` ตาราง `admin_alert_outbox` ยังไม่มี → backup เฉพาะ `.env` staging (600) · รัน preflight บน `ener_scan_staging` ผ่าน stdin (แถว 068 ก่อน apply: table/RPC = f ตามคาด, แถวอื่น t)
3. **apply 068** ผ่าน stdin บน `ener_scan_staging` · รัน preflight ซ้ำ: 068 5 แถว = t (table, 3 RPCs, web_anon ไม่มีสิทธิ์, role writer EXECUTE 3, dedupe index) · md5 ฟังก์ชัน 3 ตัวตรง reference (`verify-migration-versions.sh`)
4. **env staging:** `gen-restricted-jwt.mjs /root/ener-scan-staging/.env ADMIN_ALERT_DB_KEY admin_alert_writer --dry-run` → รันจริง (พิมพ์แค่ role/exp/fingerprint) · เพิ่ม `ADMIN_ALERT_TELEGRAM_CHAT_ID=<ตามกบเคาะ>` (ไม่ตั้ง `ADMIN_ALERT_TELEGRAM_BOT_TOKEN` = ใช้ `TELEGRAM_BOT_TOKEN` เดิม) · ห้ามพิมพ์ค่าใน log/แชต
5. **deploy staging แบบตรึง:** `deploy-pinned.sh staging <sha40> --frozen-ref origin/pro/three-tasks-<sha7>` (recreate ครบ web + worker-scan + worker-maintenance เพื่อให้ทุกตัวได้ env ใหม่; **drain worker-scan ก่อน** ตามบทเรียน 15 ต.ค.) · rollback = deploy-pinned กลับ `eedec5b` (068 คงไว้ additive)
6. **พิสูจน์ (หลักฐานส่ง Codex):**
   - DLQ: staging มีแถว dead เดิม → รอบ maintenance ถัดไป log `DLQ_ALERT_SENT channel=telegram` 1 ครั้ง → ข้อความ `[staging][dlq][high]` ถึงห้องที่เลือก → รอบต่อไป `DLQ_ALERT_SKIPPED same_state_already_alerted` (6 ชม.) · **ไม่มี** `pushMessage` ถึง `ADMIN_LINE_USER_ID` ใน log web/worker (grep) · LINE กบไม่ได้รับ DLQ
   - สลิป: ส่งสลิปทดสอบจาก Test UID กบ บน staging → แจ้ง pending_verify ยังเข้า LINE แอดมินเหมือนเดิม (L5 ไม่แตะ) · ลูกค้าได้ข้อความ LINE ตามเดิม
   - outbox: `SELECT status,count(*) FROM admin_alert_outbox GROUP BY 1` = ว่าง (ส่งตรงสำเร็จ) · จำลองส่งล้ม **ไม่ทำบน staging จริง** (ใช้ unit/DB test) · สิทธิ์: `has_table_privilege('web_anon',…)`=f ทั้ง 3, `has_function_privilege('web_anon', rpc)`=f ทั้ง 3, writer = t ทั้ง 3
   - replay รายงานแชตแบบไม่ส่ง: `docker run --rm --env-file /root/ener-scan-staging/.env --network <net> -v /root/ener-ops-<sha7>/scripts/ops/chat-quality-replay.mjs:/app/ops-replay.mjs:ro <image-id> node /app/ops-replay.mjs 2026-10-16` และ `2026-10-19` → ตรวจบรรทัด `CHAT_QUALITY_REPLAY auditState=complete` + POLICY: 16 ต.ค. = ฟรีรายวัน (ประวัติ staging อาจต่างจาก Pro — ถ้าไม่มี audit ก่อนช่วงนั้นต้องขึ้น **unknown ไม่ฟันธง**) · 19 ต.ค. = ตามโหมด staging จริง · ไม่มี Telegram ออก (log ไม่มี `CHAT_QUALITY_DAILY_REPORT`) · ไม่มีข้อความถึงลูกค้า
7. ส่งหลักฐานทั้งหมด (log ที่ mask uid, ผล SQL, ภาพ Telegram) ให้ Codex → ขออนุมัติ Pro แยก (apply 068 + `ADMIN_ALERT_DB_KEY` + chat id + deploy-pinned + recreate ทุก container)
**ยังไม่ถือว่า "ย้ายแจ้งเตือนครบ"** จนกว่างานนอกแอป 4 เรื่อง (legacy stack ADMIN_LINE_USER_ID · monitor-proxy OTP · ener-ai standup LINE group · Hermes job ซ้ำ) จะมีข้อยุติจากกบ

## 9. ผลขั้น staging (19 ต.ค. 2026 14:30–14:55 ไทย) — กบเคาะห้อง (ก) + อนุมัติขั้น 1–6 · **สถานะ: deploy staging แล้ว รอปิดหลักฐาน (ไม่ใช่ผ่านครบ)** · Pro ยังไม่แตะ
| ขั้น | ผล | หลักฐาน |
|---|---|---|
| 1 ops worktree | `/root/ener-ops-c102b71` HEAD = `c102b71715518ed0ada7cc8294c0bc44308ea0fb` · sha256 6 ไฟล์ตรงตาราง §8 ทั้งหมด | ผล `sha256sum` บน server เทียบตาราง |
| 2 backup + preflight | backup `.env` staging → `/root/backup-ops-20261002/staging-alerts-20261019-074416/.env.staging.bak` (600) · preflight 65 แถว: นอก 068 = t ทั้งหมด, 068 = f 5 แถว (ยังไม่ apply) · DLQ staging `dead=1` · 068 objects ไม่มี · role `authenticator`/`free_policy_admin` มี · `free_policy_audit` staging = 0 แถว · โหมดปัจจุบัน new_customer | ผล SQL read-only |
| 3 apply 068 | apply ผ่าน stdin สำเร็จ · preflight 068 = t 5/5 (table, 3 RPCs, web_anon ไม่มีสิทธิ์, writer EXECUTE 3 + เขียนตารางตรงไม่ได้, dedupe index) · md5 3 ฟังก์ชันตรง reference · PostgREST reload (SIGUSR1) | preflight + diff md5 |
| 4 env | `ADMIN_ALERT_DB_KEY` role admin_alert_writer exp 2038 fingerprint `e0856f4f` (backup `.env.bak-2026-10-19T0745`) · `ADMIN_ALERT_TELEGRAM_CHAT_ID` = ค่าเดียวกับ `TELEGRAM_CHAT_ID` (คัดลอกในเชลล์ ไม่พิมพ์ค่า; ยืนยันเท่ากัน, ตัวเลข 10 หลัก) · ไม่ตั้ง `ADMIN_ALERT_TELEGRAM_BOT_TOKEN` (ใช้ bot เดิม) | ชื่อตัวแปร + fingerprint เท่านั้น |
| 5 deploy | `DRY_RUN=1` ผ่าน (origin fetch frozen ref ได้) → `deploy-pinned.sh staging c102b71… --frozen-ref origin/pro/three-tasks-c102b71` สำเร็จ BLUE healthy, recreate web/worker-scan/worker-maintenance/worker-delivery (ไม่มี job ค้างก่อน recreate) · HEAD หลัง deploy = c102b71 dirty=none · images ใหม่: web `91e45639…` worker-scan `38af7ae2…` worker-maintenance `0663b4c0…` worker-delivery `0016718a…` · ทั้ง 3 คอนเทนเนอร์ที่ส่ง alert เห็น `ADMIN_ALERT_DB_KEY`/`ADMIN_ALERT_TELEGRAM_CHAT_ID` (ชื่อตัวแปร) | log deploy |
| 6a DLQ → Telegram | `07:47:08Z ADMIN_ALERT_SENT env=test.my-ener.uk category=dlq parts=1` + `DLQ_ALERT_SENT channel=telegram queued=false outDead=1 dedupe=redis` **1 ครั้ง** → รอบถัดไป `07:48:08Z DLQ_ALERT_SKIPPED same_state_already_alerted` · log 4 คอนเทนเนอร์ไม่มี `pushMessage(admin|ADMIN_LINE_USER_ID|admin_push` = 0 · **รอกบยืนยันภาพข้อความ `[test.my-ener.uk][dlq][high]` ในแชต Kob** | docker logs -t |
| 6b outbox/สิทธิ์ | outbox `empty` (ส่งตรงสำเร็จ ไม่มีแถว) · web_anon select/insert/update = f · web_anon EXECUTE RPC = 0/3 · writer EXECUTE 3/3 + table insert = f · authenticator เป็นสมาชิก writer = t | SQL |
| 6c replay ไม่ส่ง (**ไม่ใช่ offline**: ยังเรียก Gemini = ส่งข้อมูลแชตให้ผู้ให้บริการและมีค่าใช้จ่าย; ไม่ส่ง Telegram/LINE ไม่เขียนรายงาน/dedupe · output ที่แชร์ต้อง mask uid — รายงานต้นฉบับใส่ uid เต็มในเคสมีปัญหา; เคสที่รันไม่มีปัญหาจึงยังไม่ได้ทดสอบจุดนี้ → สคริปต์ mask แล้วใน commit ถัดไป) | `chat-quality-replay.mjs` ใน image worker-maintenance ใหม่: 2026-10-16 และ 2026-10-19 → `auditState=complete` (อ่าน audit ได้แต่ staging ไม่มีประวัติ) → POLICY = **ไม่ทราบ — งดตัดสิน** (ไม่ฟันธง) convCount 0 · 2026-09-26 (วันที่มีแชตจริง 17 แถว) → วิเคราะห์ 1 บทสนทนา ปกติ 1 ปัญหา 0 POLICY unknown · log ไม่มี `CHAT_QUALITY_DAILY_REPORT` = ไม่มี Telegram ออก · ไม่มีข้อความถึงลูกค้า | output replay (uid mask) |
| 6d สลิป/LINE ลูกค้า | โค้ด L5 `adminPaymentSlipNotify` ไม่แตะ (static test) · **รอกบส่งสลิปทดสอบจาก Test UID บน staging OA** เพื่อดู log แจ้ง pending_verify เข้า LINE แอดมินตามเดิม + ลูกค้าได้ข้อความ LINE | รอ |

**ค้างก่อนขอ Pro:** (1) กบยืนยันภาพ Telegram · (2) สลิปทดสอบ staging · (3) Codex ดู diff `3cde8c0..c102b71` (replay tool + runbook) · (4) งานนอกแอป 4 เรื่องยังไม่มีข้อยุติ → ยังไม่นับว่า "ย้ายครบ"
**rollback staging (ถ้าต้อง):** `deploy-pinned.sh staging eedec5bf60ab3b11f34b849963951e0e798e5f66 --frozen-ref origin/pro/three-tasks-eedec5b` · 068 คงไว้ (additive) · env ใหม่ 2 ตัวไม่กระทบโค้ดเดิม

## 10. เคสควบคุมเส้นสลิป pending_verify บน staging (19 ต.ค. 2026 15:05 ไทย) + ข้อค้นพบ
**วิธี (Codex: ไม่โอนเงินจริง ไม่กดอนุมัติ):** probe `scripts/ops/staging-slip-pending-verify-probe.mjs` (commit `d2c7f82`, sha256 `1e9ed008…`, ดึงจาก mirror ตรวจ hash ก่อนรัน) รันใน image web staging `91e45639…` ด้วย .env staging · เรียก **ฟังก์ชันจริง** `maybeNotifyAdminSlipPendingVerify` ด้วย LINE client จริง paymentId สังเคราะห์ (ไม่มีแถว payments ไม่มีสิทธิ์เปลี่ยน) · ปิดช่อง Telegram approval ในโปรเซส (ไม่สร้างปุ่มอนุมัติให้ payment ปลอม) · แล้วส่งข้อความลูกค้า `slip_manual_review` (ถ้อยคำเดียวกับ webhook) ผ่าน gateway push ไป Test UID
**ผล:** `ADMIN_SLIP_PENDING_VERIFY_PUSH_OK` (LINE_TRANSPORT_OK path adminPaymentSlipNotify.push → ADMIN_LINE_USER_ID) · `NONSCAN_GATEWAY_PUSH slip_manual_review suppressed=false` + LINE_TRANSPORT_OK (ลูกค้า) · `telegramApprovalBypassed=true` · ไม่มี adminAlert/Telegram เกี่ยวข้อง · **รอกบยืนยัน** ว่าได้ 2 ข้อความใน LINE (staging ตั้ง `ADMIN_LINE_USER_ID` = Test UID ของกบ จึงเข้าแชตเดียวกัน): "[ชำระเงิน] มีสลิปรอตรวจ (pending_verify) … อ้างอิง: SYNTH-PROBE" และ "รับรูปแล้วครับ ขอเช็กแปปนึง…"
**ข้อจำกัด:** (1) **ทดสอบฟังก์ชันส่งจริง ไม่ใช่ E2E** ผ่าน webhook/LIFF (ต้องมีรูปสลิปจริงผ่าน LINE) — พิสูจน์ว่าฟังก์ชันแจ้งแอดมิน + ช่องลูกค้ายังทำงานด้วยโค้ด/env ใหม่ (2) แถว `line_conversation_messages` ของข้อความลูกค้าไม่ถูกบันทึกเพราะ probe จบโปรเซสก่อน insert แบบ fire-and-forget เสร็จ → แก้ probe ให้รอ 2.5 วิ แล้ว (ไม่รันซ้ำ เพื่อไม่ส่งข้อความซ้ำหากบ) (3) probe รุ่นที่รัน (`d2c7f82`) ใส่ env override `ADMIN_PAYMENT_SLIP_NOTIFY: "1"` ซึ่ง **ไม่จำเป็น** — ค่าเริ่มต้นเมื่อไม่ตั้งคือ `true` อยู่แล้ว (env.js ปิดเฉพาะ `false/0/no`) → ถอด override ออกแล้ว (commit ถัดไป) ผลการส่งไม่เปลี่ยน
**ถอนข้อสรุปเดิม (Codex 19 ต.ค.):** ข้อสรุปว่า "Pro ไม่แจ้งสลิปเพราะไม่มี flag" **ไม่ถูกต้อง** — การไม่มีตัวแปร ≠ ปิด · ตรวจ read-only ในคอนเทนเนอร์จริง (import env.js พิมพ์เฉพาะ boolean/ความยาว): Pro `effectiveFlag=true rawPresent=false adminLineIdPresent=true (len 33)` · staging เช่นเดียวกัน · log web Pro ตั้งแต่คอนเทนเนอร์เริ่ม 15 ต.ค. 08:53Z: สลิปเข้า `pending_verify` 3 รายการ (17 ต.ค. 11:01Z, 19 ต.ค. 04:46Z, 19 ต.ค. 05:13Z) **ทุกรายการ `SLIP_AUTO_APPROVED` ภายใน 6–8 วินาที** → ไม่มีเคสค้าง manual review จึงไม่มี `ADMIN_SLIP_PENDING_VERIFY_PUSH_OK/FAIL` ในหน้าต่างนี้ (0/0) · LIFF slip events 0 ⇒ สถานะที่ถูกต้องคือ **"ยังไม่มีหลักฐานการส่งแจ้งแอดมินสลิปบน Pro ในช่วงที่ตรวจ"** ไม่ใช่ "ระบบปิด" · ไม่แก้ `.env` ไม่เปลี่ยนช่องทางสลิป · ไม่ต้องเลือกเปิดช่องทางใหม่จากเหตุผลนี้
