-- 055: paid-quota decrement ledger (Codex B2 รอบสอง, 20 ส.ค. 2026)
--
-- Invariants:
-- 1) การหัก quota ต่อ job เกิดครั้งเดียว (job_id PK + claim FOR UPDATE + completed
--    = already_completed) และ decrement+complete อยู่ transaction เดียว
-- 2) authority: caller ส่งได้แค่ job_id — app_user_id/access_source derive จาก
--    scan_jobs ใน DB เท่านั้น · ledger เดิมผูกคนละ user = reject
-- 3) ตาราง ledger ห้าม mutate ตรงจาก client roles — ทุก mutation ผ่าน RPC
--    SECURITY DEFINER ที่ REVOKE FROM PUBLIC แล้ว grant เฉพาะ runtime roles
-- 4) durable owner จริง: reconcile RPC สร้าง ledger คืนจาก actual-delivery
--    evidence ได้เอง (กรณี ensure ล้มตอนส่ง) — Telegram เป็นแค่ alert เสริม
-- 5) กันหักย้อนหลัง (policy write-off 223 scans): reconcile มองเฉพาะ job ที่
--    created_at >= quota_ledger_epoch (บันทึกตอน apply migration นี้) —
--    งานประวัติศาสตร์/งานที่ backfill delivered ทีหลัง ไม่มีวันถูกหักย้อนหลัง
BEGIN;

CREATE TABLE IF NOT EXISTS scan_quota_decrements (
  job_id uuid PRIMARY KEY REFERENCES scan_jobs (id),
  app_user_id uuid NOT NULL REFERENCES app_users (id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_scan_quota_decrements_pending
  ON scan_quota_decrements (created_at) WHERE status = 'pending';

-- Codex P0-2: ห้าม client roles แตะตารางตรง — อ่านได้ (sweeper list pending) เขียนผ่าน RPC เท่านั้น
REVOKE ALL PRIVILEGES ON scan_quota_decrements FROM PUBLIC;
REVOKE ALL PRIVILEGES ON scan_quota_decrements FROM web_anon;
REVOKE ALL PRIVILEGES ON scan_quota_decrements FROM service_role;
GRANT SELECT ON scan_quota_decrements TO web_anon;
GRANT SELECT ON scan_quota_decrements TO service_role;

-- epoch ของระบบ ledger — apply ซ้ำต้องไม่เลื่อน (DO NOTHING)
INSERT INTO app_settings (key, value, updated_at)
VALUES ('quota_ledger_epoch', to_jsonb(now()), now())
ON CONFLICT (key) DO NOTHING;

-- สเต็ป 1 (เรียก "ก่อน" mark delivered): จอง pending — derive เจ้าของจาก DB เท่านั้น
CREATE OR REPLACE FUNCTION public.ensure_quota_decrement_pending(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j scan_jobs%ROWTYPE;
  led scan_quota_decrements%ROWTYPE;
BEGIN
  SELECT * INTO j FROM scan_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RETURN 'job_not_found'; END IF;
  IF j.access_source IS DISTINCT FROM 'paid' OR j.app_user_id IS NULL THEN
    RETURN 'not_paid';
  END IF;

  SELECT * INTO led FROM scan_quota_decrements WHERE job_id = p_job_id;
  IF FOUND THEN
    -- ledger เดิมต้องผูก user เดียวกับ job — ไม่ตรง = ปฏิเสธ ห้ามคืน ok
    IF led.app_user_id IS DISTINCT FROM j.app_user_id THEN RETURN 'user_mismatch'; END IF;
    RETURN led.status;
  END IF;

  INSERT INTO scan_quota_decrements (job_id, app_user_id)
  VALUES (p_job_id, j.app_user_id)
  ON CONFLICT (job_id) DO NOTHING;
  SELECT status INTO led.status FROM scan_quota_decrements WHERE job_id = p_job_id;
  RETURN COALESCE(led.status, 'pending');
END;
$$;

-- สเต็ป 2: หักจริง atomic — zero-row บน app_users = ผิดปกติ ต้อง rollback ห้าม completed
CREATE OR REPLACE FUNCTION public.claim_paid_scan_decrement(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  led scan_quota_decrements%ROWTYPE;
  affected integer;
BEGIN
  SELECT * INTO led FROM scan_quota_decrements WHERE job_id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no_ledger'; END IF;
  IF led.status = 'completed' THEN RETURN 'already_completed'; END IF;

  UPDATE app_users
  SET paid_remaining_scans = GREATEST(COALESCE(paid_remaining_scans, 0) - 1, 0)
  WHERE id = led.app_user_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    -- user หาย/แถวไม่โดน = ห้ามรายงานสำเร็จปลอม — ยกเลิกทั้ง transaction (ledger คง pending)
    RAISE EXCEPTION 'app_user_update_affected_%', affected;
  END IF;

  UPDATE scan_quota_decrements
  SET status = 'completed', attempts = attempts + 1, completed_at = now(), last_error = NULL
  WHERE job_id = p_job_id;
  RETURN 'completed';
END;
$$;

-- retry ที่ล้ม: attempts+1 คง pending
CREATE OR REPLACE FUNCTION public.mark_quota_decrement_error(p_job_id uuid, p_error text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE affected integer;
BEGIN
  UPDATE scan_quota_decrements
  SET attempts = attempts + 1, last_error = left(COALESCE(p_error, 'unknown'), 300)
  WHERE job_id = p_job_id AND status = 'pending';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Durable owner (Codex P0-1 รอบสอง): สร้าง ledger คืนจาก actual-delivery evidence
-- สำหรับ paid job ที่ delivered แล้วแต่ไม่มีแถว ledger (ensure ล้มตอนส่ง) —
-- เฉพาะ job ยุค ledger (created_at >= epoch) ห้ามแตะงานประวัติศาสตร์/write-off
CREATE OR REPLACE FUNCTION public.reconcile_missing_quota_ledgers(p_limit integer DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  epoch timestamptz;
  inserted integer;
BEGIN
  SELECT (value #>> '{}')::timestamptz INTO epoch FROM app_settings WHERE key = 'quota_ledger_epoch';
  IF epoch IS NULL THEN RETURN 0; END IF; -- ไม่มี epoch = ไม่เดา ไม่แตะอะไร

  INSERT INTO scan_quota_decrements (job_id, app_user_id)
  SELECT j.id, j.app_user_id
  FROM scan_jobs j
  WHERE j.access_source = 'paid'
    AND j.app_user_id IS NOT NULL
    AND j.status = 'delivered'
    AND j.created_at >= epoch
    AND NOT EXISTS (SELECT 1 FROM scan_quota_decrements l WHERE l.job_id = j.id)
    AND EXISTS (
      SELECT 1 FROM outbound_messages o
      WHERE o.related_job_id = j.id
        AND o.kind = 'scan_result'
        AND o.status = 'sent'
        AND COALESCE(o.payload_json ->> 'skipQuotaDecrement', '') <> 'true'
    )
  ORDER BY j.created_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  ON CONFLICT (job_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

-- authority: RPC เรียกได้เฉพาะ runtime roles
REVOKE EXECUTE ON FUNCTION public.ensure_quota_decrement_pending(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_paid_scan_decrement(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_quota_decrement_error(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reconcile_missing_quota_ledgers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_quota_decrement_pending(uuid) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.claim_paid_scan_decrement(uuid) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_quota_decrement_error(uuid, text) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_missing_quota_ledgers(integer) TO web_anon, service_role;

-- smoke: ตาราง ledger ต้องไม่มีสิทธิ์เขียนตรงจาก client roles เหลืออยู่
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(grantee || ':' || privilege_type, ', ') INTO bad
  FROM information_schema.table_privileges
  WHERE table_name = 'scan_quota_decrements'
    AND grantee IN ('web_anon', 'service_role')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'scan_quota_decrements ยังมีสิทธิ์เขียนตรง: %', bad;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
