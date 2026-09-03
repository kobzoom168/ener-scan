# Profitability Report — Schema Audit + Historical Preview (3 ก.ย. 2026, read-only รอบแรกตามสเปก Codex)

ไม่แตะ payment/quota/scan state · ยังไม่สร้าง scheduler/Telegram · ตัวเลขทั้งหมด SELECT อย่างเดียวจาก Pro DB + ไฟล์ cost ที่มี

## 1. Schema mapping (ของจริง ไม่ใช่ที่คาด)

**payments** (Pro, 338 แถวรวมทุก status):
- **สถานะ "อนุมัติแล้ว" จริงคือ `status='paid'` (287)** — ไม่มีค่า 'approved' ในระบบ · มี `succeeded` 3 แถว (legacy มี.ค., 0–29฿) เสนอไม่นับ (flag ไว้)
- สถานะอื่น: expired=34, rejected=6, pending=5, awaiting_payment=3 — ไม่นับทั้งหมด
- **timestamp authoritative = `verified_at`** (ครบ 100% ของ paid) · `paid_at` = NULL ทุกแถว (ห้ามใช้) · `auto_approved_at` มีเฉพาะสาย auto (101 แถว) → สูตร: `verified_at`
- ยอดเงินจริง = `amount` (integer THB) · `expected_amount` = ยอดที่ควรจ่าย (พบ 3 แถว amount≠expected → ยึด amount ตามสเปก "เงินจริง")
- `package_code` มีครบ (49baht_4scans_24h=265 หลัก) — mix นับจาก amount จริง ไม่ derive จากชื่อแพ็ก
- **refund/void/chargeback: ไม่มีกลไกในตาราง** (ไม่มี status/คอลัมน์/โน้ต) → refunds=0 โดยโครงสร้าง · ถ้าอนาคตมีคืนเงิน ต้องเพิ่ม status ก่อน รายงานจะฟ้องไม่ได้
- **⚠️ บัญชีทดสอบของกบ `Ufe02fff…` = 157/287 แถว = 8,144฿** — ต้องตัดออกจากรายได้เสมอ (ลิสต์ test uid เป็น config) · ยอด 0฿ อีก 3 แถวตัด · currency THB เดียว
- duplicate callback: ไม่พบแถวซ้ำ (id unique ต่อการจ่าย) — จะยืนยันอีกครั้งใน behavior test

**scan_jobs**: access_source free/paid · `delivered` เชื่อถือได้ตั้งแต่ 3 ก.ย. (หลังแก้ zombie delivery_queued) · ย้อนหลังต้องนับ delivered+dq-ซาก · เคส dedup ไม่มี job row (ตัดก่อนสร้าง) → นับจาก collector events (SCAN_*_DEDUP_HIT)
**scan_quota_decrements**: completed = "หักสิทธิ์จ่ายจริง" — SSOT ตั้งแต่ 3 ก.ย. (เพิ่ง LIVE)
**AI cost**: `cost-*.jsonl` (gen_cost ต่อ call + key_usage ต่อ env + credits) · key แยก Pro/Staging/Ener-AI ตั้งแต่ 3 ก.ย. · **ย้อนหลังแยก pro/staging ไม่ได้ (key รวม + มี dev-test ปน)** → preview ติด caveat
**Telegram**: มี `sendTelegramText` (fire-and-forget) — **ไม่มี outbox** → เฟส D ต้องสร้างตาราง outbox ใหม่ (unique periodType+periodStart+periodEnd+chunkHash, mark sent หลัง API ตอบ ok)

## 2. Historical preview (จันทร์–อาทิตย์ เวลาไทย · ตัด test-uid + 0฿ · rate 36 THB/USD สมมติ — บันทึกพร้อมรายงานตามสเปก)

| สัปดาห์เริ่ม | รายรับจริง | tx | คน | AI (pro+staging+dev ปน)* | Fixed alloc** | รวมต้นทุน | ส่วนต่าง |
|---|---|---|---|---|---|---|---|
| 03 ส.ค. | 1,268฿ | 12 | 6 | ~604฿ | ~429฿ | ~1,033฿ | **+235฿ ✅** |
| 10 ส.ค. | 490฿ | 10 | 4 | ~737฿ | ~429฿ | ~1,166฿ | **−676฿ 🔴** |
| 17 ส.ค. | 539฿ | 11 | 4 | ~446฿ | ~429฿ | ~875฿ | **−336฿ 🔴** |
| 24 ส.ค. | 294฿ | 6 | 3 | ~370฿ | ~429฿ | ~799฿ | **−505฿ 🔴** |
| 31 ส.ค. (บางส่วน) | 294฿ | 6 | 4 | ~201฿ | — | — | — |

\* AI ย้อนหลังรวม dev-testing หนัก (งาน flow-role ส.ค.) — ต้นทุน AI ที่รับใช้ลูกค้าจริงต่ำกว่านี้ วัดแยกได้ตั้งแต่หน้าต่างใหม่ 3 ก.ย. เท่านั้น
\*\* (600+1300)×7/31 ≈ 429฿ — allocated ไม่ใช่เงินที่จ่ายในสัปดาห์นั้น

**รายเดือน (ตอบคำถามหลัก):**

| เดือน | รายรับจริง | tx | ลูกค้าจ่าย | ต้นทุนประมาณ (Server+LINE 1,900 + AI) | สรุป |
|---|---|---|---|---|---|
| ก.ค. | **3,449฿** | 61 | 22 | ~1,900 + AI (ไม่มีข้อมูล CSV ก.ค.) | ≈ คุ้มบาง ๆ ถ้า AI < 1,500฿ |
| ส.ค. | **2,885฿** | 45 | 12 | ~1,900 + AI ~2,100฿ (มี dev ปน) ≈ 4,000฿ | **เข้าเนื้อ ~ −1,100฿ 🔴** |

- แนวโน้มน่ากังวลกว่ากำไร: **ลูกค้าจ่ายลด 22→12 คน, รายรับ/สัปดาห์ลดจาก ~900 → ~300฿** ต่อเนื่อง 3 สัปดาห์
- scan volume ต่อสัปดาห์ก็ลด (created 604→162) — ปัญหาหลักตอนนี้คือ **ฝั่งรายได้/ลูกค้า ไม่ใช่แค่ฝั่งต้นทุน**

## 3. ประเด็นที่ขอ Codex เคาะก่อนเฟส D

1. `succeeded` 3 แถว legacy — ไม่นับ ใช่ไหม
2. test-uid list: เริ่มที่ `Ufe02fff…` — กบมีบัญชีทดสอบอื่นอีกไหม (ต้องยืนยันกับกบ)
3. "ส่งผลสำเร็จ" ย้อนหลัง: delivered+dq-ซาก (ก่อน 3 ก.ย.) / delivered ล้วน (หลัง) — โอเคไหม
4. THB rate: ใช้ rate จากไหนเป็น SSOT (ค่าคงที่ config / API) — preview ใช้ 36 สมมติ
5. AI cost ย้อนหลังแยก pro ไม่ได้ → รายงานย้อนหลังติดป้าย "ยังไม่แยก env" ตลอด ใช่ไหม
6. scan counts ใน usage section ต้องตัด test-uid ด้วย (preview ยังไม่ตัด)
