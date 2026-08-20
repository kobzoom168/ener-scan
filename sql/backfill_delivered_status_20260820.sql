-- P0-2 backfill (Codex รอบสอง 20 ส.ค. 2026): scan_jobs ค้าง delivery_queued
-- ทั้งที่ "ผลเต็มส่งถึงลูกค้าแล้วจริง"
--
-- ⚠️ หลักฐานที่ถูกต้อง = outbound ของผลที่ re-enqueue หลังปล่อยเกต (Codex จับได้ว่า
-- ฉบับแรกใช้หลักฐานผิดชนิด): outbound ตัวแรกที่มี related_job_id ถูก mark sent
-- ตั้งแต่ตอนเกต "พักรายงานแล้วส่งคำถาม" — รายงานเต็มยังไม่ถึงลูกค้า ห้ามใช้
-- actual-delivery predicate:
--   • o.related_job_id IS NULL  (ตัว re-enqueue ยุคก่อนแก้ ไม่มี job ผูก)
--   • o.kind='scan_result' AND o.status='sent'
--   • o.line_user_id = j.line_user_id
--   • payload_json scanResultId/scanId ตรง scan_jobs.result_id
--   • payload.error ต้องไม่เป็น true
-- แตะเฉพาะ delivery_queued — failed/cancelled/อื่น ๆ ห้ามแตะ
-- หมายเหตุ: quota reconciliation เป็นคนละงาน ห้ามปนใน SQL นี้ (กบเคาะ: ไม่หักย้อนหลัง)
-- วิธีรัน (ชื่อไฟล์จงใจไม่ขึ้นต้นด้วยเลข — ไม่เข้า auto-migration):
--   sudo -u postgres psql -v ON_ERROR_STOP=1 -d ener_scan_pro -f sql/backfill_delivered_status_20260820.sql
BEGIN;

-- ดูก่อนว่าจะโดนกี่แถว (ต้องใกล้เคียงตัวเลขตรวจมือ ~702-703 ณ 20 ส.ค.)
SELECT count(*) AS will_backfill
FROM scan_jobs j
WHERE j.status = 'delivery_queued'
  AND j.result_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM outbound_messages o
    WHERE o.kind = 'scan_result'
      AND o.status = 'sent'
      AND o.related_job_id IS NULL
      AND o.line_user_id = j.line_user_id
      AND COALESCE(o.payload_json ->> 'error', '') <> 'true'
      AND (
        o.payload_json ->> 'scanResultId' = j.result_id::text
        OR o.payload_json ->> 'scanId' = j.result_id::text
      )
  );

UPDATE scan_jobs j
SET status = 'delivered', updated_at = now()
WHERE j.status = 'delivery_queued'
  AND j.result_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM outbound_messages o
    WHERE o.kind = 'scan_result'
      AND o.status = 'sent'
      AND o.related_job_id IS NULL
      AND o.line_user_id = j.line_user_id
      AND COALESCE(o.payload_json ->> 'error', '') <> 'true'
      AND (
        o.payload_json ->> 'scanResultId' = j.result_id::text
        OR o.payload_json ->> 'scanId' = j.result_id::text
      )
  );

-- ยืนยันผล: งานที่มี actual-delivery evidence แล้วยังค้างคิว ต้องเหลือ 0
SELECT count(*) AS remaining_with_actual_evidence
FROM scan_jobs j
WHERE j.status = 'delivery_queued'
  AND j.result_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM outbound_messages o
    WHERE o.kind = 'scan_result'
      AND o.status = 'sent'
      AND o.related_job_id IS NULL
      AND o.line_user_id = j.line_user_id
      AND COALESCE(o.payload_json ->> 'error', '') <> 'true'
      AND (
        o.payload_json ->> 'scanResultId' = j.result_id::text
        OR o.payload_json ->> 'scanId' = j.result_id::text
      )
  );

COMMIT;
