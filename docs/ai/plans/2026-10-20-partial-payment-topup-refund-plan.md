# แผนงาน "รับเงินไม่ครบ → โอนเพิ่ม หรือคืนเงิน" (แยกจาก Telegram approval) — 20 ต.ค. 2026
**สถานะ: แผน + ผลตรวจโค้ดเดิม read-only · ยังไม่แก้โค้ด ไม่ deploy ไม่แก้ schema จนกบอนุมัติแผน** · รอบแรก: คืนเงินโดยกบโอนเองแล้วแนบหลักฐาน ไม่มีโอนคืนอัตโนมัติ

## 1. โค้ดเดิมรองรับอะไร (ตรวจ `c102b71` + Pro DB read-only)
| คำถาม | ผลตรวจ |
|---|---|
| หนึ่งบิลรับหลายรายการโอนได้ไหม | **ไม่ได้** — `payments` เก็บสลิปชุดเดียว (`slip_url, slip_ref, slip_amount, slip_transferred_at, slip_verify_status…`) · `payment_slips` มี `UNIQUE(payment_id)` (1 สลิป/บิล, ใช้เพื่อ retention) · ไม่มีตารางรายการโอนแยก |
| รายการโอนเดียวใช้ซ้ำสองบิลได้ไหม | **กันแล้วระดับหนึ่ง** — `idx_payments_slip_ref_unique` (slip_ref ซ้ำข้ามบิลไม่ได้) + `isDuplicateSlipRefAcrossPayments` → reason `duplicate_slip_ref` (ไปคิวคน ไม่ reject) |
| สถานะที่มี | `awaiting_payment → pending_verify → paid / rejected` (+ `expired`, legacy `pending/failed`) · **ไม่มีสถานะรับเงินบางส่วน / รอคืน / คืนแล้ว** · ไม่มีคอลัมน์ยอดรับจริง/ยอดคืน (มี `amount`=ราคา, `expected_amount`, `slip_amount`=ที่อ่านได้) |
| ยอดไม่ตรงแพ็กวันนี้เกิดอะไร | auto: `amount_mismatch` (tolerance Pro = 0) → **เส้นสลับแพ็กอัตโนมัติ** `slipAutoApprovalOrchestrator`: ถ้า reason เดียวคือ amount_mismatch และยอดตรงราคาแพ็กอื่นเป๊ะ → `switchPendingPaymentPackage` แล้ว auto-approve (กติกากบ: กด 49 โอน 149 = จัด 149 ให้) · ถ้าไม่ตรงแพ็กใด → **เช็คเครดิต spend-to-upgrade** (`upgrade_credit` ปิดอยู่บน Pro) → ไม่เข้า → pending_verify · ลูกค้าได้ข้อความ `slip_manual_review` ("รับรูปแล้ว ขอเช็กแปป…") **ไม่บอกยอดขาด/เกิน** |
| คนตรวจทำอะไรได้ | หน้า Admin `/admin/payments/:id`: **อนุมัติ** (แพ็กเดิม) · **approve-as** (อนุมัติเป็นแพ็กที่เลือกตามยอดที่โอนจริง) · **ปฏิเสธ** (preset เหตุผล + `rejected_at/reject_reason`) · Telegram: อนุมัติ 2 ขั้น (แพ็กเดิมเท่านั้น; ข้อความเตือน "ยอดไม่ตรง ระบบจะไม่เปลี่ยนแพ็กให้") · ไม่มี "ขอโอนเพิ่ม"/"คืนเงิน" |
| กัน approve ซ้ำ/สวน | `approve_payment_and_grant` (062/063): ล็อกแถว + `payment_entitlement_grants` PK = เติมซ้ำไม่ได้ · stale guard (`packageCode`/`expectedAmount` snapshot ต้องตรงตอน commit) · Telegram token ใช้ครั้งเดียว |
| สถิติ Pro 90 วัน (รวมเท่านั้น) | สลิป 135 · paid 134 · rejected 1 · **ยอดไม่ตรง 2 (ขาดทั้งคู่: paid 1, rejected 1)** · เกิน 0 → ปัญหาจริงมีน้อยแต่ไม่เป็นศูนย์ และตอนนี้จบด้วย "ปฏิเสธทั้งบิลทั้งที่เงินอยู่กับร้าน" หรือ "อนุมัติทั้งที่ยอดขาด" |

**จุดชนที่ต้องแก้/กันก่อนเปิดฟีเจอร์:** (ก) เส้นสลับแพ็กอัตโนมัติ — ยอดตรงแพ็กอื่น = เปลี่ยนแพ็กให้เองโดยลูกค้าไม่รับทราบ (Codex: ต้องทบทวน; เสนอ: คงได้เฉพาะ "ยอดมากกว่าและตรงแพ็กใหญ่กว่า" + แจ้งลูกค้าชัด; ยอดน้อยกว่า = ห้ามลดแพ็กให้เอง) (ข) ปุ่ม Telegram/Admin "อนุมัติ" ยังกดได้ขณะยอดขาด → ต้องถูกกันเมื่อบิลอยู่สถานะ "รับบางส่วน/รอคืน" (ค) `expired` sweep อาจปิดบิลที่รับเงินบางส่วนไปแล้ว → ต้องยกเว้น

## 2. แบบที่เสนอ
### 2.1 Schema (additive, ไม่แตะคอลัมน์เดิม)
- ตารางใหม่ `payment_transfers` (1 บิล : N รายการโอน): `id, payment_id FK, slip_ref UNIQUE (ทั่วระบบ), slip_amount numeric, slip_transferred_at, slip_url, slip_hash, verify_provider, verify_status (verified|unverified|failed), verified_at, raw jsonb, created_at` · ย้ายความจริง "เงินเข้า" มาที่นี่ (payments.slip_* คงไว้เป็น snapshot ของรายการแรกเพื่อ backward-compat)
- `payments` เพิ่ม: `received_amount numeric default 0` (= ผลรวม transfers ที่ `verified` เท่านั้น), `shortfall_amount` (generated/derived = expected − received), `settlement_status text` (`none|partial_received|awaiting_topup|refund_pending|refunded|refund_failed`), `refund_requested_at, refund_amount, refunded_at, refund_evidence_url, refund_note, refund_by`
- ตารางใหม่ `payment_refunds` (หลักฐานคืนเงิน หลายครั้งได้): `id, payment_id, amount, method, evidence_url, note, status (pending|done|failed), created_by, created_at, done_at`
- RPC ใหม่ (SECURITY DEFINER, role จำกัด): `payment_transfer_attach(p_payment_id, …)` (กัน slip_ref ซ้ำ + รวมยอดเฉพาะ verified) · `payment_mark_refund_pending(p_payment_id, p_actor)` · `payment_refund_record(p_payment_id, p_amount, p_evidence, p_actor)` → `refunded` เมื่อยอดคืนครบ · แก้ `approve_payment_and_grant`: **ปฏิเสธถ้า `settlement_status IN ('refund_pending','refunded','refund_failed')` หรือ `received_amount < expected_amount`** (เว้น admin override ที่บันทึกเหตุผล)
### 2.2 สถานะ (เพิ่มใน `settlement_status` ไม่แตะ `status` หลักจนจำเป็น)
`awaiting_payment` → สลิป 1 verified ยอดครบ → `paid` (เดิม) · ยอดขาด → `status=pending_verify` + `settlement_status=partial_received` → ลูกค้าเลือก: **โอนเพิ่ม** → สลิปใหม่ attach → received ครบ → ทุกเงื่อนไขผ่าน = auto-approve ครั้งเดียว / ไม่ผ่าน = คน · **ขอคืน** → `refund_pending` (กัน auto/Telegram/Admin approve) → กบโอนคืน + แนบหลักฐาน → `refunded` (บิลปิด `status=rejected` reason `refunded`) / โอนคืนไม่สำเร็จ → `refund_failed` แจ้งแอดมิน · **ไม่ตอบ** → คง `partial_received` + เตือนแอดมินทุก 24 ชม. (ไม่ถือว่าจบ/คืนแล้ว) · ยกเว้นจาก `expired` sweep
### 2.3 หน้าแอดมิน / Telegram
- Admin `/admin/payments/:id`: บล็อก "ยอดรับจริง": `ราคาแพ็ก 49 · รับแล้ว 40 (verified) · ขาด 9` + รายการโอนทั้งหมด · ปุ่ม: **ขอโอนเพิ่ม** (ส่งข้อความลูกค้า) · **ตั้งเป็นรอคืนเงิน** · **บันทึกคืนเงินแล้ว** (ต้องแนบหลักฐาน/จำนวน) · ปุ่ม **อนุมัติ** ถูกปิดเมื่อขาด/รอคืน (override ต้องพิมพ์เหตุผล)
- Telegram: ข้อความสลิปรอตรวจเพิ่มบรรทัด `รับแล้ว X / ขาด Y` · ปุ่มใหม่ **ขอโอนเพิ่ม** / **ตั้งรอคืนเงิน** (2 ขั้นเหมือนอนุมัติ) · ปุ่ม **อนุมัติ** ซ่อน/ปฏิเสธเมื่อขาดยอดหรือรอคืน (ตรวจฝั่ง server ไม่ใช่แค่ซ่อนปุ่ม)
### 2.4 ข้อความลูกค้า (LINE, เสียงแอดมิน, ไม่มีคำว่าระบบ)
- ยอดขาด: `ตรวจพบยอดโอน 40 บาทแล้วครับ แพ็กที่เลือกราคา 49 บาท ยังขาดอีก 9 บาท ต้องการโอนเพิ่มเพื่อรับสิทธิ์ หรือให้ร้านคืนยอดที่โอนมา แจ้งได้เลยครับ`
- โอนเพิ่มครบ: `ได้รับยอดครบ 49 บาทแล้วครับ เปิดสิทธิ์ให้แล้ว …` (ข้อความเปิดสิทธิ์เดิม)
- รอคืน: `รับเรื่องคืนเงิน 40 บาทแล้วครับ ร้านจะโอนคืนและแจ้งในแชตนี้` → คืนแล้ว: `โอนคืน 40 บาทเรียบร้อยครับ (หลักฐานแนบ)`
- **ห้ามรับปากว่า "ส่งสลิปส่วนที่ขาดแล้วระบบจะรวมให้อัตโนมัติ" จนกว่าฟีเจอร์นี้ขึ้น Pro**
### 2.5 เทสต์ที่ต้องมี (ก่อน deploy)
- รวมยอดเฉพาะ transfers `verified` (unverified/ภาพอย่างเดียวไม่รวม) · slip_ref เดิม attach บิลที่สองต้องถูกปฏิเสธ · 40+9 → received 49 → approve ครั้งเดียว (grant 1, กดซ้ำ/พร้อมกันไม่เพิ่ม) · 40 แล้วขอคืน → approve ทุกช่อง (auto/Telegram/Admin) ต้องถูกปฏิเสธ · refund_pending แล้วลูกค้าโอนเพิ่มมา → ไม่ auto-approve ต้องคน · refunded ต้องมีหลักฐาน+จำนวน ไม่ลบแถว · expired sweep ไม่แตะ partial_received · เส้นสลับแพ็กอัตโนมัติ: ยอดน้อยกว่าห้ามลดแพ็ก
### 2.6 ลำดับทำ (หลังกบอนุมัติแผน)
1) migration 069 (additive) + RPC + DB tests ระบบแยก 2) backend: attach transfer + รวมยอด + guard ใน approve 3) ข้อความลูกค้า + Admin 4) Telegram ปุ่มใหม่ 5) staging + Codex review 6) Pro แยก · **คืนเงินรอบแรก = กบโอนเองแล้วบันทึกหลักฐานผ่าน Admin เท่านั้น**
## 3. ระหว่างยังไม่พัฒนา (แนวปฏิบัติ)
ยอดขาด → แอดมินตอบมือ (โอนเพิ่ม/คืน) · ห้ามกด "อนุมัติ" บิลที่ยอดขาด · คืนเงินแล้วใช้ "ปฏิเสธ" พร้อมเหตุผล `refunded <ยอด> <วันที่>` เพื่อให้ค้นย้อนได้ · ยอดเกินตรงแพ็กใหญ่: ระบบสลับให้เอง (กติกาเดิม) — ถ้าไม่ต้องการ ต้องสั่งปิดเส้นนี้แยก
