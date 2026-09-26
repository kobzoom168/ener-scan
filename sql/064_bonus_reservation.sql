-- 064: โบนัสชวนเพื่อน — จอง/ใช้/คืน ผูกกับ scan_jobs (กบ/Codex 26 ก.ย. 2026)
--
-- บั๊กจริง: ด่านรับรูปหยิบผลสิทธิ์ที่ "ยังไม่หัก" จาก turnCache → งานเป็น bonus แต่ยอดไม่ลด
-- และเดิม trigger 057 จองโบนัสที่ INSERT เฉพาะตอน trial เปิด · webhook หักเอง (ไม่มีคืน)
--
-- กติกาใหม่ (ทุกโหมด ไม่ขึ้นกับ trial):
--   ดู (checkScanAccess/LIFF)  = ไม่แตะ bonus_scans
--   จอง = INSERT scan_jobs (free_access_kind='bonus') → bonus_scans-1 ใต้ FOR UPDATE ทรานแซกชันเดียวกัน
--   ใช้ = งานส่งผลสำเร็จ (kind คง 'bonus' ตลอด · delivery ไม่หักซ้ำ)
--   คืน = ครั้งเดียว โดยเปลี่ยน kind 'bonus' → 'bonus_released' (+1) เมื่อ
--         (ก) status → failed (trigger)  (ข) มีหลักฐาน outbound scan_result skipQuotaDecrement=true (รูปซ้ำ)
--   retry failed → active ของงานที่คืนแล้ว = จองใหม่ (หรือ bonus_quota_exhausted)
--   webhook ซ้ำ = uq_scan_uploads_line_message กัน upload/job ตัวที่สองอยู่แล้ว
-- ไม่แตะ schema (ใช้ค่าใหม่ในคอลัมน์ text เดิม) · ไม่ backfill · ไม่แก้ยอดลูกค้า
-- idempotent: apply ซ้ำได้
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
        AND o.status = 'sent' AND o.payload_json->>'skipQuotaDecrement' = 'true'
    );
$$;

CREATE OR REPLACE FUNCTION public.guard_new_customer_trial_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg jsonb; u public.app_users%ROWTYPE;
BEGIN
  IF NEW.access_source <> 'free' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    -- (ก) คืนโบนัสครั้งเดียวเมื่อกลายเป็น failed
    IF NEW.status = 'failed' AND OLD.status <> 'failed' THEN
      IF NEW.free_access_kind = 'bonus' THEN
        PERFORM 1 FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
        UPDATE public.app_users SET bonus_scans = bonus_scans + 1 WHERE id = NEW.app_user_id;
        NEW.free_access_kind := 'bonus_released';
      END IF;
      RETURN NEW;
    END IF;
    IF NOT (OLD.status = 'failed' AND NEW.status <> 'failed') THEN RETURN NEW; END IF;
    -- retry failed → active
    IF NEW.free_access_kind = 'bonus_released' THEN
      SELECT * INTO u FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
      IF COALESCE(u.bonus_scans, 0) < 1 THEN RAISE EXCEPTION 'bonus_quota_exhausted'; END IF;
      UPDATE public.app_users SET bonus_scans = bonus_scans - 1 WHERE id = u.id;
      NEW.free_access_kind := 'bonus';
      RETURN NEW;
    END IF;
    IF NEW.free_access_kind = 'bonus' THEN RETURN NEW; END IF;
    -- daily/trial: ตรวจโควตา trial ซ้ำด้านล่าง (พฤติกรรมเดิม 057)
  ELSIF NEW.free_access_kind = 'bonus' THEN
    -- จองโบนัสที่ INSERT ทุกโหมด (เดิมเฉพาะ trial เปิด)
    SELECT * INTO u FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
    IF u.id IS NULL OR u.line_user_id IS DISTINCT FROM NEW.line_user_id THEN
      RAISE EXCEPTION 'trial_user_mismatch';
    END IF;
    IF COALESCE(u.bonus_scans, 0) < 1 THEN RAISE EXCEPTION 'bonus_quota_exhausted'; END IF;
    UPDATE public.app_users SET bonus_scans = bonus_scans - 1 WHERE id = u.id;
    RETURN NEW;
  END IF;

  SELECT value INTO cfg FROM public.app_settings WHERE key = 'new_customer_trial';
  IF cfg IS NULL THEN RAISE EXCEPTION 'trial_policy_unavailable'; END IF;
  IF (cfg->>'enabled')::boolean IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT * INTO u FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
  IF u.id IS NULL OR u.line_user_id IS DISTINCT FROM NEW.line_user_id THEN
    RAISE EXCEPTION 'trial_user_mismatch';
  END IF;
  IF cfg->>'eligible_since' IS NULL OR u.created_at IS NULL
    OR u.created_at < (cfg->>'eligible_since')::timestamptz THEN
    RAISE EXCEPTION 'trial_not_eligible' USING ERRCODE = 'P0001';
  END IF;
  IF public.new_customer_trial_used(u.id) >= 2 THEN
    RAISE EXCEPTION 'trial_quota_exhausted' USING ERRCODE = 'P0001';
  END IF;
  NEW.free_access_kind := 'trial';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_new_customer_trial_job ON public.scan_jobs;
CREATE TRIGGER guard_new_customer_trial_job BEFORE INSERT OR UPDATE OF status ON public.scan_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_new_customer_trial_job();

-- (ข) คืนโบนัสตามหลักฐาน — idempotent, เรียกซ้ำ/พร้อมกันไม่คืนซ้ำ
-- คืนได้เฉพาะ: งาน kind='bonus' และ (failed หรือ มี outbound scan_result skipQuotaDecrement=true)
-- ไม่แตะ status → trigger ข้างบนไม่ทำงานซ้ำ
CREATE OR REPLACE FUNCTION public.release_bonus_reservation(p_job_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.scan_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.scan_jobs WHERE id = p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN 'job_not_found'; END IF;
  IF j.access_source <> 'free' OR j.free_access_kind IS DISTINCT FROM 'bonus' THEN RETURN 'noop'; END IF;
  IF j.status <> 'failed' AND NOT EXISTS (
    SELECT 1 FROM public.outbound_messages o
    WHERE o.related_job_id = j.id AND o.kind = 'scan_result'
      AND o.payload_json->>'skipQuotaDecrement' = 'true'
  ) THEN RETURN 'no_evidence'; END IF;
  PERFORM 1 FROM public.app_users WHERE id = j.app_user_id FOR UPDATE;
  UPDATE public.app_users SET bonus_scans = bonus_scans + 1 WHERE id = j.app_user_id;
  UPDATE public.scan_jobs SET free_access_kind = 'bonus_released' WHERE id = j.id;
  RETURN 'released';
END;
$$;

-- กู้คืน: งาน bonus ที่มีหลักฐานรูปซ้ำแต่ worker ไม่ได้เรียก release (crash) → maintenance กวาด
CREATE OR REPLACE FUNCTION public.sweep_bonus_releases(p_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; r record;
BEGIN
  FOR r IN
    SELECT j.id FROM public.scan_jobs j
    WHERE j.access_source = 'free' AND j.free_access_kind = 'bonus'
      AND (j.status = 'failed' OR EXISTS (
        SELECT 1 FROM public.outbound_messages o
        WHERE o.related_job_id = j.id AND o.kind = 'scan_result'
          AND o.payload_json->>'skipQuotaDecrement' = 'true'))
    ORDER BY j.created_at LIMIT GREATEST(1, LEAST(p_limit, 500))
  LOOP
    IF public.release_bonus_reservation(r.id) = 'released' THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.release_bonus_reservation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_bonus_releases(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_bonus_reservation(uuid) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.sweep_bonus_releases(integer) TO web_anon, service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
