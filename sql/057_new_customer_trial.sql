-- Apply before deploying the admin switch. Default is OFF. No customer rows
-- are updated. First activation fixes the cohort boundary permanently.
BEGIN;
ALTER TABLE public.scan_jobs ADD COLUMN IF NOT EXISTS free_access_kind text;
CREATE INDEX IF NOT EXISTS idx_scan_jobs_trial_usage ON public.scan_jobs(app_user_id)
  WHERE access_source='free' AND status <> 'failed';
INSERT INTO public.app_settings(key,value)
VALUES ('new_customer_trial','{"enabled":false,"eligible_since":null,"limit":2}')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.new_customer_trial_used(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM public.scan_jobs j
  WHERE j.app_user_id = p_user AND j.access_source = 'free'
    AND COALESCE(j.free_access_kind, 'daily') <> 'bonus'
    AND j.status <> 'failed'
    AND NOT EXISTS (
      SELECT 1 FROM public.outbound_messages o
      WHERE o.related_job_id = j.id AND o.kind = 'scan_result'
        AND o.status = 'sent' AND o.payload_json->>'skipQuotaDecrement' = 'true'
    );
$$;

CREATE OR REPLACE FUNCTION public.new_customer_trial_status(p_line_user_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg jsonb; u public.app_users%ROWTYPE; eligible boolean := false; used integer := 0; pending integer := 0;
BEGIN
  SELECT value INTO cfg FROM public.app_settings WHERE key = 'new_customer_trial';
  IF cfg IS NULL OR jsonb_typeof(cfg->'enabled') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'trial_policy_unavailable';
  END IF;
  IF p_line_user_id IS NOT NULL THEN
    SELECT * INTO u FROM public.app_users WHERE line_user_id = p_line_user_id;
    eligible := u.id IS NOT NULL AND cfg->>'eligible_since' IS NOT NULL
      AND u.created_at >= (cfg->>'eligible_since')::timestamptz;
    IF eligible THEN
      used := public.new_customer_trial_used(u.id);
      SELECT count(*)::integer INTO pending FROM public.scan_jobs j
        WHERE j.app_user_id=u.id AND j.access_source='free'
          AND COALESCE(j.free_access_kind,'daily') <> 'bonus'
          AND j.status NOT IN ('failed','delivered');
    END IF;
  END IF;
  RETURN jsonb_build_object('enabled',(cfg->>'enabled')::boolean,
    'eligible_since',cfg->>'eligible_since','limit',2,'eligible',COALESCE(eligible,false),'used',used,'pending',pending);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_new_customer_trial_policy(p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg jsonb;
BEGIN
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'trial_enabled_required'; END IF;
  SELECT value INTO cfg FROM public.app_settings WHERE key='new_customer_trial' FOR UPDATE;
  IF cfg IS NULL THEN RAISE EXCEPTION 'trial_policy_unavailable'; END IF;
  cfg := jsonb_build_object('enabled',p_enabled,'limit',2,
    'eligible_since',COALESCE(cfg->>'eligible_since',
      CASE WHEN p_enabled THEN clock_timestamp()::text ELSE NULL END));
  UPDATE public.app_settings SET value=cfg,updated_at=now() WHERE key='new_customer_trial';
  RETURN cfg;
END;
$$;

-- Reservation = a non-failed job. The user row lock serializes admissions
-- across workers, including when Redis is unavailable. Failed jobs release the
-- reservation; successful/delivering/held jobs retain it. A sent cache replay
-- with skipQuotaDecrement does not consume another trial.
CREATE OR REPLACE FUNCTION public.guard_new_customer_trial_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg jsonb; u public.app_users%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'failed' OR NEW.status = 'failed' OR NEW.free_access_kind = 'bonus' THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.access_source <> 'free' THEN RETURN NEW; END IF;
  SELECT value INTO cfg FROM public.app_settings WHERE key='new_customer_trial';
  IF cfg IS NULL THEN RAISE EXCEPTION 'trial_policy_unavailable'; END IF;
  IF (cfg->>'enabled')::boolean IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT * INTO u FROM public.app_users WHERE id=NEW.app_user_id FOR UPDATE;
  IF u.id IS NULL OR u.line_user_id IS DISTINCT FROM NEW.line_user_id THEN
    RAISE EXCEPTION 'trial_user_mismatch';
  END IF;
  IF NEW.free_access_kind = 'bonus' THEN
    IF COALESCE(u.bonus_scans,0) < 1 THEN RAISE EXCEPTION 'bonus_quota_exhausted'; END IF;
    UPDATE public.app_users SET bonus_scans=bonus_scans-1 WHERE id=u.id;
    RETURN NEW;
  END IF;
  IF cfg->>'eligible_since' IS NULL OR u.created_at IS NULL
    OR u.created_at < (cfg->>'eligible_since')::timestamptz THEN
    RAISE EXCEPTION 'trial_not_eligible' USING ERRCODE='P0001';
  END IF;
  IF public.new_customer_trial_used(u.id) >= 2 THEN
    RAISE EXCEPTION 'trial_quota_exhausted' USING ERRCODE='P0001';
  END IF;
  NEW.free_access_kind := 'trial';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_new_customer_trial_job ON public.scan_jobs;
CREATE TRIGGER guard_new_customer_trial_job BEFORE INSERT OR UPDATE OF status ON public.scan_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_new_customer_trial_job();

REVOKE ALL ON FUNCTION public.new_customer_trial_used(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_new_customer_trial_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.new_customer_trial_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_new_customer_trial_policy(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.new_customer_trial_status(text) TO web_anon,service_role;
-- Same trusted server DB role as the existing admin app_settings writes.
GRANT EXECUTE ON FUNCTION public.set_new_customer_trial_policy(boolean) TO web_anon,service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
