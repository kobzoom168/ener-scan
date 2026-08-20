-- P0-2 backfill (Codex raw log 19-20 ส.ค. 2026): scan_jobs ค้าง delivery_queued
-- ทั้งที่ outbound scan_result ส่งสำเร็จจริง (เกตเก็บข้อมูลชิ้น re-enqueue โดยไม่มี
-- related_job_id ตั้งแต่ 7 ส.ค.) — mark delivered เฉพาะ job ที่มีหลักฐาน outbound
-- kind=scan_result status=sent ผูก job จริงเท่านั้น · ห้ามแตะ failed/cancelled
-- วิธีรัน (ชื่อไฟล์จงใจไม่ขึ้นต้นด้วยเลข — ไม่เข้า auto-migration):
--   sudo -u postgres psql -v ON_ERROR_STOP=1 -d ener_scan_pro -f sql/backfill_delivered_status_20260820.sql
BEGIN;

-- ดูก่อนว่าจะโดนกี่แถว
SELECT count(*) AS will_backfill
FROM scan_jobs j
WHERE j.status = 'delivery_queued'
  AND EXISTS (
    SELECT 1 FROM outbound_messages o
    WHERE o.related_job_id = j.id AND o.kind = 'scan_result' AND o.status = 'sent'
  );

UPDATE scan_jobs j
SET status = 'delivered', updated_at = now()
WHERE j.status = 'delivery_queued'
  AND EXISTS (
    SELECT 1 FROM outbound_messages o
    WHERE o.related_job_id = j.id AND o.kind = 'scan_result' AND o.status = 'sent'
  );

-- ยืนยันผล: ต้องเหลือ 0 งานที่มีหลักฐานส่งแล้วแต่ยังค้างคิว
SELECT count(*) AS remaining_stuck
FROM scan_jobs j
WHERE j.status = 'delivery_queued'
  AND EXISTS (
    SELECT 1 FROM outbound_messages o
    WHERE o.related_job_id = j.id AND o.kind = 'scan_result' AND o.status = 'sent'
  );

COMMIT;
