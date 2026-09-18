# Rollback plan — ชุด release `optout-notification` (`a65eeda`)

> แก้ตาม Codex 18 ก.ย. 2026: **ห้ามย้อนเป็น `0bb11bc` เฉย ๆ** เพราะโค้ดเดิมไม่มีการเช็ค optout
> ลูกค้าที่กดปิดไว้จะกลับมาได้รับ `daily_pick_push` ทันที · ต้องพักการส่งชนิดนี้ควบคู่เสมอ

## หลักการ
1. **ย้อนโค้ด ไม่ย้อน schema** — `058`/`059` เป็น additive ล้วน โค้ด `0bb11bc` ไม่เรียกใช้
2. **พักการส่งข้อความเชิงรุกก่อนเสมอ** แล้วจึงย้อนโค้ด — ไม่ใช่ย้อนโค้ดก่อน
3. ข้อความธุรกรรม (`scan_result`, `scan_failure_notify`, `renewal_reminder`) **ต้องไม่ถูกแตะ**

## ขั้นตอน rollback (ตามลำดับ ห้ามสลับ)

### ขั้นที่ 1 — หยุด "งานใหม่"
ตั้ง `DAILY_PICK_PUSH_ENABLED=false` ใน env ของ Pro แล้ว restart
สวิตช์นี้**มีอยู่แล้วตั้งแต่ `0bb11bc`** (gate ต้นทางใน `runDailyLuckyPickSweep`) จึงใช้ได้ทั้งก่อนและหลังย้อนโค้ด

### ขั้นที่ 2 — พัก "คิวเดิม" ที่ค้างอยู่
```sql
UPDATE outbound_messages
   SET next_retry_at = 'infinity'::timestamptz, updated_at = now()
 WHERE kind IN ('daily_pick_push','fb_consent_ask')
   AND status IN ('queued','retry_wait');
```
`claim_next_outbound_message` กรองด้วย `next_retry_at is null or next_retry_at <= now()`
RPC ตัวนี้อยู่ใน **ฐานข้อมูล ไม่ใช่โค้ด** จึงมีผลกับโค้ดทุกเวอร์ชันรวมถึง `0bb11bc`
**สถานะไม่เปลี่ยน ข้อมูลไม่หาย** — เป็นการพัก ไม่ใช่การยกเลิก

### ขั้นที่ 3 — ย้อนโค้ด
`git reset --hard 0bb11bc` บน Pro → `bash /root/deploy-ener.sh pro` → ตรวจ `/health` + hash ไฟล์ใน container

### ขั้นที่ 4 — เมื่อพร้อมกลับมาส่ง (หลังแก้ปัญหาแล้ว)
```sql
UPDATE outbound_messages SET next_retry_at = NULL, updated_at = now()
 WHERE kind IN ('daily_pick_push','fb_consent_ask') AND status IN ('queued','retry_wait');
```
แล้วค่อยเอา `DAILY_PICK_PUSH_ENABLED` ออก

## ห้ามทำเด็ดขาด
- ❌ `UPDATE outbound_messages SET status='sent' WHERE status='suppressed_optout'` — โกหกยอดส่ง
- ❌ ถอน constraint ของ `059` ขณะยังมีแถว `suppressed_optout` (แถวเดิมละเมิด → `ADD CONSTRAINT` ล้ม)
- ❌ ลบ/แก้แถวใน `notification_preferences` — เป็นความต้องการจริงของลูกค้า
- ❌ ย้อนโค้ดโดยไม่ทำขั้นที่ 1–2 ก่อน

## แถว `suppressed_optout` ที่ค้างหลัง rollback
`sent_at IS NULL` → ไม่ถูกนับเป็นยอดส่ง · worker หยิบเฉพาะ `queued/sending/retry_wait` → ไม่ถูก retry ย้อนหลัง · ปล่อยไว้ตามเดิม

## หลักฐานการทดสอบกลไกพัก (staging, 18 ก.ย. 2026)

หยุด `worker-delivery` ชั่วคราวเพื่อให้ผลการ claim เที่ยงตรง · แถวสังเคราะห์ 5 ชนิด สถานะ `queued`

| ขั้น | ผล |
|---|---|
| พัก 2 ชนิดเชิงรุก | `status` ยังเป็น `queued` เหมือนเดิม · `next_retry_at=infinity` เฉพาะ `daily_pick_push`/`fb_consent_ask` |
| เรียก `claim_next_outbound_message` จริง 5 ครั้ง (คนละ statement) | ได้ `renewal_reminder` → `scan_result` → `scan_failure_notify` → **"ไม่มีงานให้หยิบ" อีก 2 ครั้ง** ทั้งที่ 2 แถวเชิงรุกยังอยู่ = **ไม่เคยถูกหยิบเลย** |
| เลิกพัก (`next_retry_at=NULL`) | claim ได้ `daily_pick_push` → `fb_consent_ask` ทันที = พักได้จริงและกลับมาได้จริง |
| สวิตช์งานใหม่ | `DAILY_PICK_PUSH_ENABLED=false` → `{"skipped":"disabled"}` · ไม่ตั้ง → `{"skipped":"not_push_hour"}` (เข้าเงื่อนไขเวลาปกติ) |

ข้อมูลที่ห้ามแตะหลังทดสอบ: `notification_preferences` ครบตามเดิม · `suppressed_optout` ค้าง 0 · `next_retry_at=infinity` ค้าง 0 · แถวสังเคราะห์ลบหมด · worker กลับมาทำงานแล้ว

## ลำดับ deploy ไปข้างหน้า
`sql/058` → `sql/059` → โค้ด · **ห้ามสลับ** — deploy โค้ดก่อน migration จะทำให้ RPC ไม่มี
(fail-safe งดส่งแจ้งเตือนแนะนำทั้งหมดชั่วคราว) และสถานะ `suppressed_optout` ชน CHECK เดิม
