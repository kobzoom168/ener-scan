-- 059: แยกสถานะ "งดส่งเพราะลูกค้าปิดแจ้งเตือน" ออกจาก "ส่งถึงลูกค้าแล้ว"
--
-- เดิมคิวที่ถูก suppress ถูก markSent() → status='sent' เหมือนข้อความที่ส่งถึงจริง
-- ทำให้แยกไม่ออกและถูกนับรวมเป็นยอดส่ง (Codex 18 ก.ย. 2026)
-- ใช้รูปแบบเดียวกับ 'suppressed_banned' ที่มีอยู่แล้ว: terminal ไม่ retry (worker หยิบเฉพาะ
-- queued/sending/retry_wait) และไม่ถูกนับเป็น sent
--
-- idempotent: รันซ้ำได้ · ไม่แก้ข้อมูลแถวเดิม (ไม่ backfill)
BEGIN;

ALTER TABLE public.outbound_messages DROP CONSTRAINT IF EXISTS outbound_messages_status_check;
ALTER TABLE public.outbound_messages ADD CONSTRAINT outbound_messages_status_check
  CHECK (status = ANY (ARRAY[
    'queued'::text, 'sending'::text, 'sent'::text, 'retry_wait'::text,
    'failed'::text, 'dead'::text, 'suppressed_banned'::text, 'held_object_info'::text,
    'suppressed_optout'::text
  ]));

COMMIT;
NOTIFY pgrst, 'reload schema';
