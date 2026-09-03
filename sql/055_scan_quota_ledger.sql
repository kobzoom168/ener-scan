-- 055: durable paid-quota decrement ledger (Codex 29 ส.ค. 2026 — P0-G "ส่งผลแล้วต้องหักสิทธิ์ถาวร")
-- มีบน staging แล้ว (apply มือ) — ไฟล์นี้คือ source of truth สำหรับ Pro rollout
-- ลำดับ rollout Pro: psql -f ไฟล์นี้ → NOTIFY pgrst reload → verify RPC/grants → deploy โค้ด → smoke paid/free/dup

ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS quota_accounting_version integer;

CREATE TABLE IF NOT EXISTS scan_quota_decrements (
  job_id uuid PRIMARY KEY REFERENCES scan_jobs(id),
  app_user_id uuid NOT NULL REFERENCES app_users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_scan_quota_decrements_pending
  ON scan_quota_decrements (created_at) WHERE status = 'pending';


-- P0-H (Codex 31 ส.ค.): DB เป็นผู้ตรวจหลักฐานการส่งเอง — ห้ามเชื่อ caller
-- delivered + version 2 + paid + outbound scan_result sent ที่ไม่ skip เท่านั้นถึงหักได้
CREATE OR REPLACE FUNCTION public.quota_delivery_evidence(p_job scan_jobs)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF p_job.access_source IS DISTINCT FROM 'paid' OR p_job.app_user_id IS NULL THEN RETURN 'not_paid'; END IF;
  IF COALESCE(p_job.quota_accounting_version, 0) <> 2 THEN RETURN 'not_accountable'; END IF;
  IF p_job.status IS DISTINCT FROM 'delivered' THEN RETURN 'not_delivered'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM outbound_messages o
    WHERE o.related_job_id = p_job.id AND o.kind = 'scan_result' AND o.status = 'sent'
      AND COALESCE(o.payload_json ->> 'skipQuotaDecrement', '') <> 'true'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM outbound_messages o
      WHERE o.related_job_id = p_job.id AND o.kind = 'scan_result' AND o.status = 'sent'
    ) THEN RETURN 'skip_quota'; END IF;
    RETURN 'no_sent_outbound';
  END IF;
  RETURN 'ok';
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_quota_decrement_pending(p_job_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  j scan_jobs%ROWTYPE;
  led scan_quota_decrements%ROWTYPE;
  ev text;
BEGIN
  SELECT * INTO j FROM scan_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RETURN 'job_not_found'; END IF;
  ev := quota_delivery_evidence(j);
  IF ev <> 'ok' THEN RETURN ev; END IF;
  SELECT * INTO led FROM scan_quota_decrements WHERE job_id = p_job_id;
  IF FOUND THEN
    IF led.app_user_id IS DISTINCT FROM j.app_user_id THEN RETURN 'user_mismatch'; END IF;
    RETURN led.status;
  END IF;
  INSERT INTO scan_quota_decrements (job_id, app_user_id)
  VALUES (p_job_id, j.app_user_id)
  ON CONFLICT (job_id) DO NOTHING;
  SELECT status INTO led.status FROM scan_quota_decrements WHERE job_id = p_job_id;
  RETURN COALESCE(led.status, 'pending');
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_paid_scan_decrement(p_job_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  j scan_jobs%ROWTYPE;
  led scan_quota_decrements%ROWTYPE;
  ev text;
  affected integer;
BEGIN
  SELECT * INTO led FROM scan_quota_decrements WHERE job_id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no_ledger'; END IF;
  IF led.status = 'completed' THEN RETURN 'already_completed'; END IF;
  -- P0-H: ตรวจหลักฐานซ้ำใน transaction (ledger อาจถูกสร้างก่อน state เปลี่ยน) — lock job กัน state แกว่ง
  SELECT * INTO j FROM scan_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'job_not_found'; END IF;
  IF j.app_user_id IS DISTINCT FROM led.app_user_id THEN RETURN 'user_mismatch'; END IF;
  ev := quota_delivery_evidence(j);
  IF ev <> 'ok' THEN RETURN ev; END IF;
  UPDATE app_users
  SET paid_remaining_scans = GREATEST(COALESCE(paid_remaining_scans, 0) - 1, 0)
  WHERE id = led.app_user_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'app_user_update_affected_%', affected;
  END IF;
  UPDATE scan_quota_decrements
  SET status = 'completed', attempts = attempts + 1, completed_at = now(), last_error = NULL
  WHERE job_id = p_job_id;
  RETURN 'completed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_quota_decrement_error(p_job_id uuid, p_error text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE affected integer;
BEGIN
  UPDATE scan_quota_decrements
  SET attempts = attempts + 1, last_error = left(COALESCE(p_error, 'unknown'), 300)
  WHERE job_id = p_job_id AND status = 'pending';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_missing_quota_ledgers(p_limit integer DEFAULT 20)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inserted integer;
BEGIN
  INSERT INTO scan_quota_decrements (job_id, app_user_id)
  SELECT j.id, j.app_user_id
  FROM scan_jobs j
  WHERE j.quota_accounting_version = 2
    AND j.access_source = 'paid'
    AND j.app_user_id IS NOT NULL
    AND j.status = 'delivered'
    AND NOT EXISTS (SELECT 1 FROM scan_quota_decrements l WHERE l.job_id = j.id)
    AND EXISTS (
      SELECT 1 FROM outbound_messages o
      WHERE o.related_job_id = j.id
        AND o.kind = 'scan_result'
        AND o.status = 'sent'
        AND COALESCE(o.payload_json ->> 'skipQuotaDecrement', '') <> 'true'
    )
  ORDER BY j.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  ON CONFLICT (job_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$function$;

-- P0-H lockdown (Codex 31 ส.ค.): bulk GRANT ALL ในสคริปต์ migration เคยเปิด DML ตรงให้ web_anon —
-- REVOKE ก่อนแล้วค่อยให้สิทธิ์ขั้นต่ำ (ledger แก้ได้ผ่าน RPC SECURITY DEFINER เท่านั้น)
REVOKE ALL ON TABLE scan_quota_decrements FROM PUBLIC;
REVOKE ALL ON TABLE scan_quota_decrements FROM web_anon;
REVOKE ALL ON TABLE scan_quota_decrements FROM service_role;
GRANT SELECT ON scan_quota_decrements TO web_anon, service_role;
REVOKE EXECUTE ON FUNCTION quota_delivery_evidence(scan_jobs) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ensure_quota_decrement_pending(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_paid_scan_decrement(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_quota_decrement_error(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reconcile_missing_quota_ledgers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_quota_decrement_pending(uuid) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION claim_paid_scan_decrement(uuid) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION mark_quota_decrement_error(uuid, text) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION reconcile_missing_quota_ledgers(integer) TO web_anon, service_role;
NOTIFY pgrst, 'reload schema';
