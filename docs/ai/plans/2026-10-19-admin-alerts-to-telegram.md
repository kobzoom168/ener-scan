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
- **outbox durable** `sql/068_admin_alert_outbox.sql`: ตาราง `admin_alert_outbox(id, env_label, category, severity, text, dedupe_key, status queued|sent|failed, attempts, next_attempt_at, last_error, created_at, sent_at)` · grant เหมือน `outbound_messages` (web_anon/service_role insert/select/update) · idempotent
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
