# Incident — `[CRITICAL] เช็คแบนอ่าน DB ไม่ได้ — ระบบ fail-open ชั่วคราว` (18 ก.ย. 2026)

> ตรวจแบบ read-only ตามที่สั่ง · ไม่แก้ fail-open/fail-closed · ไม่ปลดแบน · ไม่แก้ grants · ไม่ restart อะไร

## 1. เหตุการณ์จริง
`2026-09-18T10:12:42Z` = **17:12:42 น. ไทย** ตรงกับเวลาในภาพ

```
{"event":"BAN_CHECK_DB_ERROR_FAIL_OPEN","uidPrefix":"U3d73bad","message":"deadline_exceeded"}   10:12:42.393Z
{"event":"BAN_CHECK_DB_ERROR_FAIL_OPEN","uidPrefix":"U3d73bad","message":"deadline_exceeded"}   10:12:42.507Z
```
- **2 ครั้ง ผู้ใช้คนเดียว ห่างกัน 114 ms** · เกิดที่คอนเทนเนอร์ `ener-scan-pro` (web) เท่านั้น · worker ทั้ง 3 ตัว = 0
- บริบท: ลูกค้าเปิดหน้าจ่ายเงินจาก rich menu (`pay_liff_opened_from_richmenu` → `pay_package_selected` → `PAYMENT_CREATED_WITH_PACKAGE`) ธุรกรรมสำเร็จตามปกติ
- `message=deadline_exceeded` แปลว่า **หมดงบเวลา ไม่ใช่ DB ตอบ error** — `isBanned()` มีงบรวม **800 ms** สำหรับ Redis + DB ทั้งหมด

## 2. ไม่ใช่ปัญหา DB / สิทธิ์ / การเชื่อมต่อ
| ตรวจ | ผล |
|---|---|
| `web_anon` / `service_role` SELECT `banned_users` | true ทั้งคู่ |
| RLS บน `banned_users` | ปิด (ไม่มี policy บล็อก) |
| ความเร็ว query จริง | Index Scan · **Execution 0.060 ms** |
| connection pool | 30 / 100 (authenticator 24) ไม่เต็ม |
| PostgREST log ช่วง 10:10–10:20Z | ไม่มี error |
| container restart หลัง deploy | 0 ทุกตัว |

ร่องรอยที่ชี้ว่าเป็น **การหน่วงทั้งเครื่อง**: log ของ web ว่างสนิท **8 วินาที** (`10:12:33.995Z` → `10:12:41.473Z`)

## 3. Root cause — สคริปต์เก็บ telemetry ที่ผมเขียนเอง ทำให้เครื่องหน่วยความจำหมดทุก 10 นาที

`/root/llm-usage-collect.py` (cron `*/10`) วนอ่าน log ของ **ทุกคอนเทนเนอร์ที่รันอยู่ 29 ตัว** ด้วย
`docker logs --timestamps [--since <cursor>]` แล้วรับผลทั้งก้อนเข้า memory (`subprocess.run(capture_output=True, text=True)`)

- คอนเทนเนอร์สแตกเก่า **`ener-scan-worker-delivery` มี log 5,882 MB** และ **ไม่มี cursor**
  → ทุกครั้งที่รัน จะดึง log ทั้ง 5.9 GB เข้า RAM
- เครื่องมีแรมรวม 7.7 GB → ถูก **OOM kill** ก่อนเขียน cursor → **ไม่มี cursor ตลอดกาล → วนซ้ำทุก 10 นาที**
- `dmesg`: OOM kill 6 ครั้ง **07:31 · 07:41 · 07:51 · 08:21 · 08:31 · 08:41** (ring buffer เก็บได้เท่านี้ ของจริงน่าจะมากกว่า)
- เห็นสด ๆ ตอนตรวจ: process รันมา 60 วินาที RSS **1,783 MB** และโตต่อ → นาทีถัดมาหายไป (ถูกฆ่า)
- ข้อบกพร่องซ้อน: cursor ถูกเขียน **เฉพาะเมื่อเจอบรรทัดที่ match** → คอนเทนเนอร์ที่ไม่มี LLM log จะไม่มี cursor ถาวร
  (ตอนนี้ **18 จาก 29 คอนเทนเนอร์ไม่มี cursor**)

ช่วงที่เครื่องถูกดูดแรมจนเกือบหมด ทุก process ถูกหน่วง → 800 ms ของเช็คแบนหมดก่อนได้คำตอบ

## 4. เกี่ยวกับ deploy optout หรือไม่ — **หลักฐานบอกว่าไม่เกี่ยว แต่ไม่ยืนยัน 100%**
- deploy `08:45:29Z` · เหตุการณ์ `10:12:42Z` (ห่าง 1 ชม. 27 นาที)
- **OOM loop เริ่มตั้งแต่ 07:31Z คือ ~74 นาที ก่อน deploy**
- ไฟล์ทุกไฟล์ในเส้นทาง request นั้น **ไม่ถูกแตะเลย**ระหว่าง `0bb11bc → be67a98`:
  `bannedUsers.repo.js` · `liffBanGuard.util.js` · `liff.routes.js` · `supabase.js` · `scanV2Redis.js` · `customerPush.gateway.js`
  (release แตะแค่ 5 ไฟล์: lineWebhook, dailyLuckyPickPush, deliverOutbound, dailyPickNotifyCommand, deliveryWorker)
- **ข้อจำกัด**: log ของคอนเทนเนอร์ web ย้อนได้ถึงแค่ตอน deploy (08:44:46) จึง **ไม่มี baseline ก่อน deploy** ให้เทียบว่าเคยเกิดมาก่อนหรือไม่

## 5. ผลกระทบจริง — **ไม่มีบัญชีถูกแบนหลุดผ่าน**
ตาราง `banned_users` มี **1 แถวเดียว** · `banned_at = 2026-08-19 11:04:07.011Z` · `unbanned_at = 2026-08-19 11:04:07.035Z` (ห่าง 24 ms — เป็นรายการทดสอบ)

**จำนวนบัญชีที่ถูกแบนอยู่ ณ 10:12:42Z = 0 คน** → ช่วง fail-open ไม่มีใครให้ปล่อยผ่าน ความเสี่ยงที่เกิดขึ้นจริง = 0
ขอบเขตกระทบ: **2 request · ผู้ใช้ 1 คน** (ไม่ใช่บัญชีที่ถูกแบน) · ธุรกรรมจ่ายเงินของเขาสำเร็จปกติ

## 6. ตอนนี้เป็นอย่างไร
- เช็คแบน **กลับมาปกติแล้ว** — `BAN_CHECK_DB_ERROR_FAIL_OPEN` = 0 ตั้งแต่ 10:12:42Z (ตรวจถึง 10:30Z)
- อ่าน `banned_users` ได้ปกติ query 0.06 ms
- **แต่ OOM loop ยังเกิดอยู่** ทุก 10 นาที — ต้นเหตุยังไม่ถูกแก้
- ดิสก์ **84% (เหลือ 12 GB)** และ **ไม่มี docker log rotation** (`/etc/docker/daemon.json` ไม่มี) — log 5.9 GB ก้อนนั้นกินที่อยู่

## 7. ข้อเสนอ (ยังไม่ทำ รอเคาะ)
**เร่งด่วน — หยุดเลือดก่อน (เลือกอย่างใดอย่างหนึ่ง)**
1. ปิด cron บรรทัด `*/10 * * * * /root/llm-usage-collect.py` ชั่วคราว — หยุด OOM ทันที เสียแค่ telemetry ต้นทุน AI
2. หรือจำกัดคอนเทนเนอร์ที่เก็บ ให้เหลือเฉพาะ `ener-scan-pro*` / `ener-scan-staging*`

**แก้ที่สคริปต์ (ผมแก้ได้ ไม่กระทบแอป)**
- ใส่ `--since` เสมอแม้ไม่มี cursor (เช่นย้อนหลังไม่เกิน 30 นาที) — ห้ามดึงทั้งไฟล์
- เขียน cursor **ทุกครั้งที่อ่านจบ** แม้ไม่เจอบรรทัดที่ match
- อ่านแบบ stream ทีละบรรทัด แทน `capture_output` ทั้งก้อน + จำกัดขนาดสูงสุดต่อรอบ
- allowlist คอนเทนเนอร์ ไม่วนทั้งเครื่อง

**แยกเรื่อง (ต้องอนุมัติ)**
- ตั้ง docker log rotation (`max-size` / `max-file`) — แก้ทั้งปัญหาแรมและดิสก์ · ต้อง restart docker daemon จึงต้องนัดเวลา
- คอนเทนเนอร์สแตกเก่า `ener-scan-*` (worker-scan/delivery/maintenance, redis, postgrest, dozzle, monitor-proxy) ยัง Up มา 2 เดือน — ถ้าเลิกใช้แล้วการปิดจะคืนทั้งแรมและดิสก์ **แต่ยังไม่ควรแตะจนกว่าจะยืนยันว่าไม่มีใครใช้**
- งบ 800 ms ของ `isBanned` แน่นมากเมื่อเครื่องถูกหน่วง — **ยังไม่เสนอให้แก้** เพราะกติการอบนี้ห้ามแตะ fail-open/fail-closed

## 8. ที่ไม่ได้ทำตามที่กำหนด
ไม่เปลี่ยน fail-open เป็น fail-closed · ไม่ปลดแบนใคร · ไม่แก้ grants · ไม่ restart อะไรทั้งสิ้น · ไม่เปิดเผย UID เต็มหรือ secret (แสดงเฉพาะ prefix 8 ตัวที่ระบบ log เอง)
