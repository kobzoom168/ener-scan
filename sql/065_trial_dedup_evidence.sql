-- 065: ทดลองลูกค้าใหม่ — รูปซ้ำไม่นับสิทธิ์ทันทีเมื่อมีหลักฐานที่ worker บันทึกสำเร็จ ไม่ขึ้นกับสถานะการส่ง (Codex 1 ต.ค. 2026)
--
-- เดิม (057/064): new_customer_trial_used ไม่นับงานที่มี outbound scan_result skipQuotaDecrement=true เฉพาะเมื่อ status='sent'
--   → ถ้า delivery ล้มถาวร (failed) หรือค้าง queued ช่องทดลองไม่คืน — ขัดกติกา "รูปซ้ำไม่นับ" และต่างจากโบนัส (064 คืนทันทีเมื่อเขียนหลักฐาน)
-- ใหม่: ยึดหลักฐานที่บันทึกใน outbound_messages (เขียนโดย worker/เซิร์ฟเวอร์เท่านั้น ไม่ใช่คำกล่าวอ้างของ client) ไม่ว่าจะ queued/sent/failed
--   · เป็นการนับ (NOT EXISTS) ไม่ใช่บวกยอด → idempotent ไม่มีคืนซ้ำ · งานสำเร็จปกติ (skipQuotaDecrement=false) ยังนับ
--   · หลักฐานผูกกับ related_job_id ของงานนั้นเท่านั้น · คง exclusion 'bonus%' และ failed ของ 064 · concurrent ยัง serialize ด้วย FOR UPDATE ใน trigger เดิม
-- ไม่แตะ schema · ไม่ backfill · ไม่แก้ยอดลูกค้า · idempotent (apply ซ้ำได้) · ต้อง apply หลัง 064
-- rollback: re-apply นิยามใน 064 — **ลดสิทธิ์คงเหลือได้** (งานรูปซ้ำที่หลักฐานยังไม่ 'sent' จะกลับมานับ) ดู runbook: แสดงผลต่างก่อนย้อน
BEGIN;
CREATE OR REPLACE FUNCTION public.new_customer_trial_used(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM public.scan_jobs j
  WHERE j.app_user_id = p_user AND j.access_source = 'free'
    AND COALESCE(j.free_access_kind, 'daily') NOT LIKE 'bonus%'
    AND j.status <> 'failed'
    AND NOT EXISTS (
      SELECT 1 FROM public.outbound_messages o
      WHERE o.related_job_id = j.id AND o.kind = 'scan_result'
        AND o.payload_json->>'skipQuotaDecrement' = 'true'
    );
$$;
REVOKE ALL ON FUNCTION public.new_customer_trial_used(uuid) FROM PUBLIC;
COMMIT;
NOTIFY pgrst, 'reload schema';
