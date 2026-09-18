# Rollback plan — ชุด release `optout-notification` (`a65eeda`)

> รอบสอง แก้ตาม Codex 18 ก.ย. 2026 (4 ช่องว่าง) · ทุกขั้นทดสอบบน staging แล้ว
> **ห้ามย้อนเป็น `0bb11bc` เฉย ๆ** — โค้ดเดิมไม่เช็ค optout คนที่กดปิดจะกลับมารับข้อความทันที

## หลักการ
1. **พักการส่งข้อความเชิงรุกให้จบก่อน แล้วจึงย้อนโค้ด** ไม่ใช่ย้อนโค้ดก่อน
2. **ย้อนโค้ด ไม่ย้อน schema** — `058`/`059` เป็น additive โค้ด `0bb11bc` ไม่เรียกใช้
3. ข้อความธุรกรรม (`scan_result` · `scan_failure_notify` · `renewal_reminder`) ต้องไม่ถูกแตะ
4. **ปลดพักได้เฉพาะเมื่อโค้ดที่รันอยู่ตรวจ optout แล้วเท่านั้น**

---

## ขั้นที่ 1 — ปิด producer **ทั้งสองชนิด** (แยกสวิตช์กัน)

| ชนิด | สวิตช์ | หมายเหตุ |
|---|---|---|
| `daily_pick_push` | `DAILY_PICK_PUSH_ENABLED=false` | gate ใน `runDailyLuckyPickSweep` มีอยู่แล้วตั้งแต่ `0bb11bc` |
| `fb_consent_ask` | `FB_CONSENT_ASK_ENABLED=false` | **คนละสวิตช์** — gate อยู่ใน `consentAskEnabled()` ของ `fbShowcase.service.js` ซึ่งถูกเรียกจาก deliverOutbound หลังส่งรายงานสำเร็จ |

⚠️ `DAILY_PICK_PUSH_ENABLED` **ไม่ครอบคลุม** `fb_consent_ask` — ตรวจโค้ดแล้วยืนยัน ถ้าตั้งแค่ตัวเดียวจะยังมีงานใหม่เกิดหลังพักคิว
ต้องตั้ง `FB_CONSENT_ASK_ENABLED=false` **อย่างชัดเจน** ไม่อาศัยค่า default (ตามกติกา ผมไม่ได้อ่านค่าจริงใน `.env` ของ Pro)

หลักฐาน: `DAILY_PICK_PUSH_ENABLED=false` → `{"skipped":"disabled"}` · ไม่ตั้ง → `{"skipped":"not_push_hour"}`

## ขั้นที่ 2 — หยุด claim และจัดการงาน in-flight

1. `docker stop ener-scan-pro-worker-delivery` — หยุดหยิบงานใหม่ และไม่มี `sending` เพิ่ม
2. `docker stop ener-scan-pro-worker-maintenance` — **จำเป็น**: sweeper `sweepStaleOutbound` ดึงแถว `status='sending'` ที่ค้างเกิน 5 นาที กลับมาเป็น `retry_wait` พร้อม `next_retry_at=now()` → **ปลดพักให้เองโดยไม่ตั้งใจ**
3. งานที่ค้างเป็น `sending` อยู่แล้วตอนหยุด: ปล่อยไว้ ไม่มีใครแตะ แล้วจัดการในขั้นที่ 3

### ⏱ ผลกระทบระหว่างหยุด worker (ต้องบอกตรง ๆ ห้ามอ้างว่าไม่กระทบ)
ระหว่าง `worker-delivery` หยุด **ข้อความธุรกรรมทุกชนิดไม่ถูกส่ง** — คิวไว้ก่อนแล้วส่งเมื่อ start กลับ
- ลูกค้าที่รอผลสแกนจะรอนานขึ้นเท่ากับช่วงหยุด
- วัดจริงบน staging: deploy blue-green ใช้ **13 วินาที** → หน้าต่างจริงของ rollback ≈ เวลา deploy + เวลาที่ใช้รัน SQL ขั้นที่ 3 (โดยทั่วไป **1–3 นาที**)
- ระหว่าง `worker-maintenance` หยุด: การกู้งานค้างอื่น (`stale sending`, `stale scan processing`, DLQ alert) หยุดไปด้วย — ต้อง start กลับทันทีที่จบ
- ถ้าต้องหยุดนานกว่า ~5 นาที ให้แจ้งกบก่อน

## ขั้นที่ 3 — บันทึกสถานะเดิม แล้วพักคิว (ครอบคลุม `sending` ด้วย)

```sql
-- A. บันทึก id + status + next_retry_at เดิมไว้ก่อน (ใช้ตอนปลดพัก)
\copy (SELECT id, kind, status AS orig_status, COALESCE(next_retry_at::text,'NULL') AS orig_next_retry \
       FROM outbound_messages \
       WHERE kind IN ('daily_pick_push','fb_consent_ask') \
         AND status IN ('queued','retry_wait','sending')) \
  TO '/root/parked-rows-<วันที่>.csv' WITH CSV HEADER

-- B1. คิวที่ยังไม่ถูกหยิบ
UPDATE outbound_messages SET next_retry_at='infinity'::timestamptz, updated_at=now()
 WHERE kind IN ('daily_pick_push','fb_consent_ask') AND status IN ('queued','retry_wait');

-- B2. งานที่ worker หยิบไปแล้ว — ต้องย้ายออกจาก 'sending' ด้วย
--     ไม่งั้น sweeper จะดึงกลับมาส่งเอง (นี่คือช่องว่างที่ Codex จับได้)
UPDATE outbound_messages SET status='retry_wait', next_retry_at='infinity'::timestamptz, updated_at=now()
 WHERE kind IN ('daily_pick_push','fb_consent_ask') AND status='sending';
```

เก็บไฟล์ CSV ไว้ (chmod 600) — **ห้ามลบจนกว่าจะปลดพักเสร็จ**

## ขั้นที่ 4 — ย้อนโค้ดและ start worker
`git reset --hard 0bb11bc` บน Pro → `bash /root/deploy-ener.sh pro` → ตรวจ `/health` + hash ไฟล์ใน container
→ `docker start ener-scan-pro-worker-delivery ener-scan-pro-worker-maintenance` (ถ้า deploy ไม่ได้ start ให้เอง)

จากจุดนี้ sweeper ทำงานตามปกติได้ เพราะแถวที่พักไม่อยู่ในสถานะ `sending` แล้ว

## ขั้นที่ 5 — ปลดพัก (ทำได้เฉพาะเงื่อนไขครบ)

**เงื่อนไขบังคับ ครบทุกข้อจึงปลดได้:**
- โค้ดที่รันอยู่ **ตรวจ optout ก่อนส่ง** (คือชุด `a65eeda` หรือใหม่กว่า — ไม่ใช่ `0bb11bc`)
- `notification_preferences` และ RPC `get_daily_pick_optout` ใช้งานได้ปกติ
- ยืนยันด้วยการอ่านค่าจริงของบัญชีตัวอย่างผ่าน RPC ก่อน

```sql
CREATE TEMP TABLE parked (id uuid, kind text, orig_status text, orig_next_retry text);
\copy parked FROM '/root/parked-rows-<วันที่>.csv' WITH CSV HEADER
UPDATE outbound_messages m
   SET status = p.orig_status,
       next_retry_at = CASE WHEN p.orig_next_retry='NULL' THEN NULL ELSE p.orig_next_retry::timestamptz END,
       updated_at = now()
  FROM parked p WHERE m.id = p.id;
```

หลังปลดพัก แถวเหล่านี้จะไหลผ่าน `deliverOutbound` ซึ่ง **เช็ค `isDailyPickOptedOut` ก่อนส่งทุกครั้ง** → คนที่ปิดไว้จะได้ `suppressed_optout` ไม่ใช่ข้อความ

⚠️ **ห้ามปลดพักขณะรัน `0bb11bc`** — โค้ดนั้นไม่มีการเช็ค preference คิวทั้งหมดจะถูกส่งออกทันที

## ห้ามทำเด็ดขาด
- ❌ `UPDATE outbound_messages SET status='sent' WHERE status='suppressed_optout'` — โกหกยอดส่ง
- ❌ ถอน constraint ของ `059` ขณะยังมีแถว `suppressed_optout` (แถวเดิมละเมิด → `ADD CONSTRAINT` ล้ม)
- ❌ ลบ/แก้แถวใน `notification_preferences`
- ❌ ย้อนโค้ดโดยไม่ทำขั้น 1–3 · ❌ ปลดพักขณะโค้ดเก่ายังรันอยู่
- ❌ ปล่อย `worker-maintenance` ทำงานระหว่างพักคิว

## แถว `suppressed_optout` ที่ค้างหลัง rollback
`sent_at IS NULL` → ไม่ถูกนับเป็นยอดส่ง · worker หยิบเฉพาะ `queued/sending/retry_wait` → ไม่ถูก retry ย้อนหลัง · ปล่อยไว้ตามเดิม

---

## หลักฐานการทดสอบ (staging 18 ก.ย. 2026 · หยุด worker-delivery ให้ผลเที่ยงตรง)

แถวสังเคราะห์ 5 แถว: `daily_pick_push` queued · `daily_pick_push` **sending ค้าง 20 นาที** · `fb_consent_ask` **sending ค้าง 20 นาที** · `scan_result` queued · `scan_failure_notify` **sending ค้าง 20 นาที**

| ขั้น | ผล |
|---|---|
| บันทึก snapshot | 3 แถวเชิงรุกถูกบันทึก id/status/next_retry_at ครบ |
| พัก B1+B2 | queued → `next_retry=infinity` · sending 2 แถว → `retry_wait` + `infinity` · ธุรกรรมไม่ถูกแตะ |
| **รัน sweeper จริง** | ดึงกลับ **1 แถว = `scan_failure_notify` เท่านั้น** — แถวเชิงรุกทั้ง 3 **ไม่ถูกแตะเลย** (พิสูจน์ว่า B2 ปิดช่องว่างจริง และการกู้งานธุรกรรมยังทำงานปกติ) |
| claim จริง 4 ครั้ง | ได้ `scan_result` → `scan_failure_notify` → **"ไม่มีงาน" อีก 2 ครั้ง** ทั้งที่แถวเชิงรุก 3 แถวยังอยู่ |
| ปลดพักจาก CSV | คืน `status`/`next_retry_at` เดิมได้ตรงทุกแถว |
| claim หลังปลดพัก | ได้ `daily_pick_push` ทันที = กลับมาส่งได้จริง |

ตรวจหลังทดสอบ: แถวสังเคราะห์ลบหมด · CSV ลบแล้ว · `notification_preferences` ครบตามเดิม · `suppressed_optout` ค้าง 0 · `next_retry_at=infinity` ค้าง 0 · worker ทั้ง 3 ตัวกลับมา Up · **ไม่แตะข้อมูล Pro**

## ลำดับ deploy ไปข้างหน้า
`sql/058` → `sql/059` → `sql/060` → โค้ด · **ห้ามสลับ** — deploy โค้ดก่อน migration จะทำให้ RPC ไม่มี (fail-safe งดส่งแจ้งเตือนแนะนำทั้งหมดชั่วคราว) · สถานะ `suppressed_optout` ชน CHECK เดิม · และ `migrate_daily_pick_optout_if_absent` หายไป ทำให้ค่าเก่าใน Redis ย้ายเข้า DB ไม่ได้ (อ่านแล้วถือว่าปิดไว้ ไม่ส่ง)
