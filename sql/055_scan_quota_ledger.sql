-- 055: paid-quota decrement ledger (Codex B2, 20 ส.ค. 2026)
-- ปัญหา: mark delivered → decrement เป็นคนละสเต็ป — crash ระหว่างกลาง = decrement
-- หายถาวร (delivered guard กัน retry) · marker เดิมเป็น best-effort ไม่ durable จริง
-- แก้: ledger unique ต่อ job + RPC เดียวทำ "claim ถ้ายังไม่เคยหัก → decrement →
-- complete" ใน transaction เดียว — retry job เดิมไม่หักซ้ำ · crash จุดไหน sweeper
-- เห็น pending แล้วทำต่อได้
BEGIN;

CREATE TABLE IF NOT EXISTS scan_quota_decrements (
  job_id uuid PRIMARY KEY,
  app_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_scan_quota_decrements_pending
  ON scan_quota_decrements (created_at) WHERE status = 'pending';
GRANT SELECT, INSERT, UPDATE ON scan_quota_decrements TO web_anon;
GRANT SELECT, INSERT, UPDATE ON scan_quota_decrements TO service_role;

-- สเต็ป 1 (เรียก "ก่อน" mark delivered): จอง ledger pending — idempotent ต่อ job
CREATE OR REPLACE FUNCTION public.ensure_quota_decrement_pending(p_job_id uuid, p_app_user_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE st text;
BEGIN
  INSERT INTO scan_quota_decrements (job_id, app_user_id)
  VALUES (p_job_id, p_app_user_id)
  ON CONFLICT (job_id) DO NOTHING;
  SELECT status INTO st FROM scan_quota_decrements WHERE job_id = p_job_id;
  RETURN COALESCE(st, 'pending');
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_quota_decrement_pending(uuid, uuid) TO web_anon, service_role;

-- สเต็ป 2: หักจริงแบบ atomic — FOR UPDATE กันแข่ง · completed แล้ว = ไม่หักซ้ำ ·
-- decrement + mark completed อยู่ transaction เดียว (crash ระหว่างกลางเป็นไปไม่ได้)
CREATE OR REPLACE FUNCTION public.claim_paid_scan_decrement(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  led scan_quota_decrements%ROWTYPE;
BEGIN
  SELECT * INTO led FROM scan_quota_decrements WHERE job_id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'no_ledger';
  END IF;
  IF led.status = 'completed' THEN
    RETURN 'already_completed';
  END IF;

  UPDATE app_users
  SET paid_remaining_scans = GREATEST(COALESCE(paid_remaining_scans, 0) - 1, 0)
  WHERE id = led.app_user_id;

  UPDATE scan_quota_decrements
  SET status = 'completed', attempts = attempts + 1, completed_at = now(), last_error = NULL
  WHERE job_id = p_job_id;
  RETURN 'completed';
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_paid_scan_decrement(uuid) TO web_anon, service_role;

-- สำหรับ sweeper: บันทึกความล้มเหลวของรอบ retry (attempts+1) โดยคง pending
CREATE OR REPLACE FUNCTION public.mark_quota_decrement_error(p_job_id uuid, p_error text)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE scan_quota_decrements
  SET attempts = attempts + 1, last_error = left(COALESCE(p_error, 'unknown'), 300)
  WHERE job_id = p_job_id AND status = 'pending';
$$;
GRANT EXECUTE ON FUNCTION public.mark_quota_decrement_error(uuid, text) TO web_anon, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
