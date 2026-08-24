-- 056: typed status สำหรับ outbound ที่ถูกเกตเก็บข้อมูลชิ้นยึดไว้ (ไม่ได้ส่ง ไม่ต้อง retry)
-- ก่อนหน้า: มาร์ก sent ทั้งที่ transport=0 → audit ดูเหมือนส่งรายงานซ้ำ 2 outbound (smoke staging 24 ส.ค. job c88e7d43)
-- apply: sudo -u postgres psql -d <db> -f sql/056_outbound_held_status.sql   (staging ก่อน แล้วค่อย pro ตอน deploy)
BEGIN;

ALTER TABLE outbound_messages DROP CONSTRAINT IF EXISTS outbound_messages_status_check;
ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_status_check
  CHECK (status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'retry_wait'::text, 'failed'::text, 'dead'::text, 'suppressed_banned'::text, 'held_object_info'::text]));

-- แถวเก่าที่ถูกยึดแล้วมาร์ก sent+marker (ช่วง ec19343 บน staging) → ย้ายเป็น status ใหม่ให้ตรงความจริง
UPDATE outbound_messages
   SET status = 'held_object_info'
 WHERE status = 'sent' AND last_error_code = 'held_object_info';

COMMIT;
