# ข้อเสนอแบบแก้ 5 blockers (Codex ตรวจ `e414938`) — ยังไม่ลงมือ

> ตรวจ source จริงแล้ว **ทั้ง 5 ข้อเป็นของจริง** · ข้อ 1/2/5 ต้องขยาย schema หรือเปลี่ยนพฤติกรรม
> ของ service ที่ใช้ร่วมกัน 3 ช่องทาง จึงเสนอแบบ+ผลกระทบก่อน ตามที่กำหนด · **branch ยังไม่ถูกแก้**

---

## ข้อ 1 — `paid` แล้วอาจไม่ได้สิทธิ์ (P0, บั๊กเดิมของ service ที่ใช้อยู่จริงบน Pro วันนี้)

### ที่ยืนยันจากโค้ด
`markPaymentApprovedAndUnlock` ([payments.db.js:870](src/stores/payments.db.js#L870)) ทำ 2 statement แยกกัน ไม่มี transaction:
1. `UPDATE payments SET status='paid' WHERE id=? AND status='pending_verify'` (claim)
2. `grantEntitlementForPackage()` → `UPDATE app_users SET paid_until, paid_remaining_scans, paid_plan_code`

ล้มระหว่างสองขั้น → ลูกค้าจ่ายแล้ว สถานะ `paid` แต่ไม่มีสิทธิ์
และ **retry จะซ้ำเติม**: เจอ `status==='paid'` แล้ว `return { lineUserId }` ทันที **โดยไม่เติมสิทธิ์**
→ เสียถาวร ไม่มีใครรู้ (ไม่มี log, ไม่มีคอลัมน์บอกว่าเติมสิทธิ์หรือยัง)

ซ้ำร้าย `grantEntitlementForPackage` **ไม่ idempotent**: เขียนค่าสัมบูรณ์ (`paid_until = now+24h`,
`paid_remaining_scans = pkg.scanCount + carryOver`) — การ retry ดิบ ๆ อาจ **เติมเกิน** เพราะ
`carryOver` อ่านจาก `paid_remaining_scans` ปัจจุบัน ซึ่งอาจถูกเติมไปแล้วจากรอบก่อน

### แบบที่เสนอ — snapshot + lease (ทำให้ retry เหมือนเดิมเป๊ะ ไม่ใช่คำนวณใหม่)
**schema (additive ล้วน บน `payments`)**
| คอลัมน์ | ใช้ทำอะไร |
|---|---|
| `entitlement_snapshot jsonb` | ค่าที่คำนวณได้ครั้งแรก (`paid_until`, `paid_remaining_scans`, `paid_plan_code`) |
| `entitlement_grant_claimed_at timestamptz` | lease กันสองเส้นเติมพร้อมกัน (หมดอายุ 2 นาที) |
| `entitlement_granted_at timestamptz` | เติมสำเร็จจริงแล้ว |

**ลำดับใหม่ของ `markPaymentApprovedAndUnlock`**
1. claim `pending_verify → paid` (เหมือนเดิม)
2. claim lease: `UPDATE ... SET entitlement_grant_claimed_at=now() WHERE id=? AND entitlement_granted_at IS NULL AND (claimed_at IS NULL OR claimed_at < now()-'2 min') RETURNING entitlement_snapshot`
3. ถ้ายังไม่มี snapshot → คำนวณครั้งเดียว แล้วเขียนลง `entitlement_snapshot` ก่อนแตะ `app_users`
4. apply snapshot ลง `app_users` (ค่าคงที่ ไม่คำนวณใหม่)
5. stamp `entitlement_granted_at`
6. **เส้น "อนุมัติไปแล้ว" เปลี่ยนพฤติกรรม**: ถ้า `status='paid'` แต่ `entitlement_granted_at IS NULL`
   → ไม่ return เงียบ แต่ **ทำขั้น 2–5 ให้จบ** (นี่คือตัวปิดช่องว่างจริง)

**reconciliation (กู้คืนพิสูจน์ได้)** — sweeper ใน `maintenanceWorker`:
`status='paid' AND entitlement_granted_at IS NULL AND verified_at < now()-'2 min'` → เดินขั้น 2–5
พร้อม log `PAYMENT_ENTITLEMENT_RECONCILED` และแจ้ง Telegram เมื่อพบ

**ผลกระทบ**
- กระทบทั้ง 3 ช่องทาง (web/LINE/Telegram) — **โดยตั้งใจ** เพราะบั๊กอยู่ที่ service กลาง
- รายการเก่าที่ `paid` อยู่แล้วจะมี `entitlement_granted_at = NULL` ทั้งหมด →
  **ต้องกัน sweeper ไม่ให้ไล่เติมย้อนหลังให้ของเก่า** ทำด้วยการ backfill
  `entitlement_granted_at = verified_at` ให้แถว `paid` ที่มีอยู่ ณ วัน migrate
  (เป็นการบันทึกความจริงว่า "เติมไปแล้ว" ไม่ใช่การให้สิทธิ์ใหม่) — **ข้อนี้ต้องกบเคาะ**
- ไม่มีทางลัดเติมสิทธิ์ใหม่ · ไม่แตะตรรกะราคา/แพ็ก

---

## ข้อ 2 — ช่องว่างระหว่างตรวจ snapshot กับตอน commit (P0)

### ที่ยืนยันจากโค้ด
Telegram ตรวจ snapshot ใน handler แล้วเรียก `markPaymentApprovedAndUnlock({paymentId, approvedBy})`
ซึ่งอ่าน payment ใหม่และ claim ด้วยเงื่อนไข `status='pending_verify'` **เท่านั้น**
→ ถ้าแพ็ก/ยอดเปลี่ยนระหว่างนั้น จะอนุมัติคนละแพ็กกับที่กบเห็นบนจอ

### แบบที่เสนอ — ส่ง snapshot เข้าไปตรวจที่ statement เดียวกับการเปลี่ยนสถานะ
```js
markPaymentApprovedAndUnlock({ paymentId, approvedBy, expect: { packageCode, expectedAmount } })
```
claim กลายเป็น `... WHERE id=? AND status='pending_verify' AND package_code=? AND expected_amount=?`
claim ไม่ติด → อ่านกลับแล้วบอกเหตุผลจริง (`stale_package` / `stale_amount` / `not_pending`)

**ผลกระทบ**: ไม่มี schema เปลี่ยน · caller เดิม (web/LINE) ไม่ส่ง `expect` → เงื่อนไขเดิมทุกประการ
เฉพาะ Telegram ส่ง → เข้มขึ้นเฉพาะเส้นใหม่

---

## ข้อ 3 — สัญญาว่าจะ retry แต่ไม่มีงานให้ retry

### ที่ยืนยัน
`enqueueApproveNotify` ล้มก่อนสร้างแถว `outbound_messages` → ไม่มีอะไรถูกบันทึก
แต่ข้อความตอบบอกว่า "ระบบจะลองส่งใหม่เอง" — **ไม่จริง**

### แบบที่เสนอ (ไม่ต้องมีตารางใหม่ — อนุมานจากสถานะ DB)
sweeper เดียวกับข้อ 1: `entitlement_granted_at IS NOT NULL` แต่ไม่มีแถว `outbound_messages`
`kind='approve_notify'` ของ payment นั้น และเลยมาเกิน 2 นาที → `enqueueApproveNotify` ใหม่
(ตัวมันมี dedupe by payment+kind อยู่แล้ว → ไม่ส่งซ้ำ และ **ไม่แตะสิทธิ์**)
ระหว่างที่ยังไม่สำเร็จ ข้อความใน Telegram ต้องเขียนตามจริงว่า **"ยังไม่ได้แจ้งลูกค้า ระบบจะตามส่งให้"**

---

## ข้อ 4 — audit หายเงียบ

### ที่ยืนยัน
`recordApprovalAudit` จับเฉพาะ `throw` แต่ supabase-js คืน `{ data, error }` **ไม่ throw**
→ RPC ล้มแบบ `{error}` = บันทึกไม่ลง และไม่มีสัญญาณอะไรเลย

### แบบที่เสนอ (ไม่ต้องเคาะ ทำได้เลย)
ตรวจทั้ง `error` และ `throw` · ถ้าเป็น audit ของ **การอนุมัติที่สำเร็จแล้ว** และเขียนไม่ลง →
log `CRITICAL` + แจ้ง Telegram ทันที (หลักฐานการเติมเงินห้ามหายเงียบ)
และ sweeper ข้อ 1 ตรวจเพิ่มว่า payment ที่ `entitlement_granted_at` แล้วมีแถว audit หรือไม่

---

## ข้อ 5 — "เจ้าของดูคลังได้" ยังไม่ได้พิสูจน์ว่าเป็นเจ้าของ (ความเป็นส่วนตัว)

### ที่ยืนยันจากโค้ด
[report.controller.js](src/controllers/report.controller.js) `getLibraryRankingByToken` เอา
`uid = normalized.userId` (= **เจ้าของรายงาน**) แล้วเรียก `buildSacredAmuletLibraryForLineUser(uid)`
→ **ไม่มีจุดใดเทียบว่าผู้ชมคือเจ้าของ** สิทธิ์เดียวที่ใช้คือ "ถือ report token"

**ผมต้องรายงานตรง ๆ ว่าการแก้ของผมทำให้แย่ลง**: ก่อนหน้านี้ลิงก์ที่แชร์ออกไปจะเห็นคลัง
**แบบเบลอ** เมื่อเจ้าของไม่ได้จ่ายใน 3 วัน · หลังปลด paywall ลิงก์ที่แชร์ออกไป **เห็นคลังเต็มเสมอ**
(ช่องโหว่มีอยู่เดิมสำหรับเจ้าของที่จ่ายเงิน — แต่ของผมขยายให้ครอบทุกคน)

### สิ่งที่มีอยู่แล้วให้ใช้พิสูจน์เจ้าของ
ตาราง `user_page_tokens` (`purpose='myscans'`, เพิกถอนได้) → `resolveMyScansToken(token) → line_user_id`
คือ token ส่วนตัวที่ส่งให้เจ้าของในแชท · ส่วน `/r/:publicToken` ถูกออกแบบมาให้ **แชร์ได้** (การ์ด/OG/เพจ)

### ทางเลือก
| | แบบ | ผลกระทบ |
|---|---|---|
| **A (เสนอ)** | คลังต้องมี owner proof เท่านั้น — เข้าได้จาก `/myscans/:ownerToken` หรือ LIFF (มี LINE login) · `/r/:publicToken/library` ที่ไม่มี proof → 404/redirect กลับหน้ารายงาน · ลิงก์ "ดูคลัง" บนหน้ารายงานแสดงเฉพาะเมื่อพิสูจน์ได้ | **เจ้าของที่เคยเปิดคลังจากลิงก์รายงานจะต้องเปิดจาก "ดูผลเก่า"/LIFF แทน** — เปลี่ยน UX ของคนจ่ายเงินที่ใช้อยู่ |
| B | คงลิงก์เดิมแต่เบลอเมื่อไม่มี proof | ขัดเจตนางาน 2 (เจ้าของยังเห็นไม่ครบถ้าเปิดผิดทาง) |
| C | ผูก report token กับ session ของเจ้าของตอนเปิดครั้งแรก | เดาไม่ได้ว่าใครเปิดก่อน ไม่น่าเชื่อถือ |

**สิ่งที่ปลอดภัยแน่นอนและทำได้ทันทีถ้ากบสั่ง**: จำกัดการปลดล็อกของงาน 2 ให้มีผลเฉพาะเส้นที่พิสูจน์
เจ้าของแล้ว ส่วนเส้น report token ให้กลับไปเป็นพฤติกรรมเดิม — **ไม่แย่กว่าวันนี้ในทุกกรณี**

---

## สรุปสิ่งที่ขอให้เคาะ
1. **ข้อ 1**: รับแบบ snapshot+lease และ **backfill `entitlement_granted_at = verified_at` ให้แถว `paid` เดิม** หรือไม่
2. **ข้อ 2**: รับการเพิ่มพารามิเตอร์ `expect` ใน approval service กลาง
3. **ข้อ 5**: เลือกแบบ A หรือให้ทำเฉพาะ "จำกัดการปลดล็อกไว้ที่เส้นเจ้าของ" ไปก่อน
4. ข้อ 3/4 ไม่ต้องเคาะ — เป็นการปิดบั๊กตรง ๆ จะทำพร้อมรอบเดียวกัน

## งานประกอบที่จะทำพร้อมกัน (ไม่ต้องเคาะ)
- **integration tests ที่ใช้ approval service/DB จริง** (ไม่ mock): crash หลัง claim ก่อน grant ·
  เปลี่ยนแพ็กหลัง snapshot ก่อน commit · อนุมัติพร้อมกันข้ามช่องทาง · enqueue/audit ล้ม ·
  ผู้ชมอื่นถือ report token แต่ดูคลังไม่ได้ · held/pending/failed ไม่รั่ว **ผ่าน HTTP จริง**
- **แผน live ของ trial**: เพิ่ม ON → บัญชีใหม่ใช้ครบ 2 → ครั้งที่ 3 ถูกกันก่อน vision AI +
  regression paid/bonus (ของเดิมมีแต่ OFF)
- **Telegram bot**: ตรวจการใช้งาน bot เดิมก่อน setWebhook — **bot ตัวเดียวตั้ง webhook ได้ที่เดียว**
  ถ้าสลับไป staging จะดึง update ออกจากการใช้งานจริง → **ต้องแยก bot ทดสอบคนละตัว**
