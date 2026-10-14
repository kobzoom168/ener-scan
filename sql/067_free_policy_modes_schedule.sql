-- 067: สิทธิ์ฟรี 3 โหมด (daily / new_customer / none) + ตั้งเวลาเปลี่ยนนโยบาย (Codex/กบ 14 ต.ค. 2026)
--
-- หลัก:
--  * โหมดที่มีผล (นิยามเดียว ใช้ทุกด่าน: ด่านสิทธิ์/LIFF/ข้อความ/trigger สร้างงาน) = free_policy_mode_now():
--      pending schedule ที่ถึงเวลาแล้ว (effective_at <= now) ชนะ stored mode → ถึงเวลาแล้วมีผลทันทีแม้ maintenance ช้า/หยุด
--      stored mode: new_customer_trial.enabled → 'new_customer' · free_policy.daily_enabled → 'daily' · ไม่งั้น 'none'
--  * เปิดสองตัวพร้อมกันไม่ได้โดยโครงสร้าง: เขียนผ่าน free_policy_apply_internal() เท่านั้น (ทรานแซกชันเดียว)
--  * 72 ชม.: ถอนฟรีรายวัน (daily → new_customer/none) ต้องมี announced_at (เวลาที่กบยืนยันส่งประกาศจริง ≤ now)
--      และ effective_at ≥ announced_at + 72h — บังคับใน DB ทั้ง "เปลี่ยนทันที" และ "ตั้งเวลา" · p_cancel_pending ไม่ใช่ทางลัด
--  * cutoff (eligible_since) เมื่อเปิด trial ครั้งแรกแบบตั้งเวลา = effective_at ที่ตกลง (ไม่ใช่เวลาที่ worker ตื่น) · ที่มีอยู่แล้วคงเดิม
--  * migration ไม่เปลี่ยน effective mode: free_policy.daily_enabled เริ่ม = NOT trial.enabled
--  * สิทธิ์: RPC อ่านได้ทุก role เดิม · RPC เปลี่ยน/ตั้งเวลา/ยกเลิก/apply เรียกได้เฉพาะ role free_policy_admin
--      (GRANT ให้ telegram_config_admin ด้วย — JWT เดิม TELEGRAM_CONFIG_DB_KEY ใช้ได้; web_anon/service_role เรียกไม่ได้)
--  * ช่องทางเก่า set_new_customer_trial_policy(bool) → wrapper ที่ผ่านกติกาใหม่ (ไม่มี announced_at = ถอน daily ไม่ได้) + REVOKE จาก web_anon
--  * idempotent · ไม่ backfill · ไม่แก้ยอด/ไม่รีเซ็ต eligible_since · rollback: ห้าม DROP — ตั้งโหมดที่ต้องการแล้วย้อนโค้ด (ห้ามย้อนขณะโหมด none)
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'free_policy_admin') THEN CREATE ROLE free_policy_admin NOLOGIN; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN EXECUTE 'GRANT free_policy_admin TO authenticator'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'telegram_config_admin') THEN EXECUTE 'GRANT free_policy_admin TO telegram_config_admin'; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO free_policy_admin;

-- ค่าเริ่มต้นสอดคล้องกับ trial เดิม (ไม่เปลี่ยน effective mode)
INSERT INTO public.app_settings(key, value)
SELECT 'free_policy', jsonb_build_object(
  'daily_enabled', NOT COALESCE((SELECT (value->>'enabled')::boolean FROM public.app_settings WHERE key = 'new_customer_trial'), false),
  'updated_at', now()::text, 'updated_by', 'migration_067')
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'free_policy');

CREATE TABLE IF NOT EXISTS public.free_policy_schedule (
  id                bigserial PRIMARY KEY,
  target_mode       text NOT NULL CHECK (target_mode IN ('daily','new_customer','none')),
  effective_at      timestamptz NOT NULL,
  announced_at      timestamptz,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','cancelled','superseded')),
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  applied_at        timestamptz,
  applied_from_mode text,
  cancelled_by      text,
  cancelled_at      timestamptz,
  note              text
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_free_policy_schedule_one_pending ON public.free_policy_schedule ((true)) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS public.free_policy_audit (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  actor        text,
  action       text NOT NULL,
  from_mode    text,
  to_mode      text,
  schedule_id  bigint,
  announced_at timestamptz,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb
);
REVOKE ALL ON TABLE public.free_policy_schedule, public.free_policy_audit FROM PUBLIC, web_anon, service_role, free_policy_admin;

-- ───────── อ่าน ─────────
CREATE OR REPLACE FUNCTION public.free_policy_stored_mode()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN COALESCE((SELECT (value->>'enabled')::boolean FROM public.app_settings WHERE key='new_customer_trial'), false) THEN 'new_customer'
    WHEN COALESCE((SELECT (value->>'daily_enabled')::boolean FROM public.app_settings WHERE key='free_policy'), true) THEN 'daily'
    ELSE 'none' END;
$$;

-- โหมดที่มีผล ณ เวลา p_at: pending ที่ถึงเวลาแล้วชนะ · eligible_since = ของเดิม หรือ effective_at ของ schedule ที่เปิด trial ครั้งแรก
CREATE OR REPLACE FUNCTION public.free_policy_mode_now(p_at timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE stored text; due record; mode text; cfg jsonb; es text;
BEGIN
  stored := public.free_policy_stored_mode();
  SELECT id, target_mode, effective_at INTO due FROM public.free_policy_schedule
   WHERE status = 'pending' AND effective_at <= p_at ORDER BY effective_at LIMIT 1;
  mode := COALESCE(due.target_mode, stored);
  SELECT value INTO cfg FROM public.app_settings WHERE key = 'new_customer_trial';
  es := cfg->>'eligible_since';
  IF es IS NULL AND mode = 'new_customer' AND due.id IS NOT NULL THEN es := due.effective_at::text; END IF;
  RETURN jsonb_build_object('mode', mode, 'stored_mode', stored, 'due_schedule_id', due.id,
    'eligible_since', es, 'trial_enabled', mode = 'new_customer', 'daily_enabled', mode = 'daily', 'at', p_at);
END;
$$;

-- 057 เดิม: enabled/eligible มาจากโหมดที่มีผล (รวม schedule ที่ถึงเวลา) — โค้ดเดิมทุกจุดได้โหมดเดียวกันอัตโนมัติ
CREATE OR REPLACE FUNCTION public.new_customer_trial_status(p_line_user_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m jsonb; cfg jsonb; u public.app_users%ROWTYPE; eligible boolean := false; used integer := 0; pending integer := 0; es text;
BEGIN
  SELECT value INTO cfg FROM public.app_settings WHERE key = 'new_customer_trial';
  IF cfg IS NULL OR jsonb_typeof(cfg->'enabled') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'trial_policy_unavailable';
  END IF;
  m := public.free_policy_mode_now();
  es := m->>'eligible_since';
  IF p_line_user_id IS NOT NULL THEN
    SELECT * INTO u FROM public.app_users WHERE line_user_id = p_line_user_id;
    eligible := (m->>'mode') = 'new_customer' AND u.id IS NOT NULL AND es IS NOT NULL AND u.created_at >= es::timestamptz;
    IF eligible THEN
      used := public.new_customer_trial_used(u.id);
      SELECT count(*)::integer INTO pending FROM public.scan_jobs j
        WHERE j.app_user_id=u.id AND j.access_source='free'
          AND COALESCE(j.free_access_kind,'daily') NOT LIKE 'bonus%'
          AND j.status NOT IN ('failed','delivered');
    END IF;
  END IF;
  RETURN jsonb_build_object('enabled', (m->>'mode') = 'new_customer', 'mode', m->>'mode', 'daily_enabled', (m->>'mode') = 'daily',
    'eligible_since', es, 'limit', 2, 'eligible', COALESCE(eligible,false), 'used', used, 'pending', pending);
END;
$$;

CREATE OR REPLACE FUNCTION public.free_policy_status(p_line_user_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.new_customer_trial_status(p_line_user_id)
    || jsonb_build_object('stored_mode', public.free_policy_stored_mode(),
         'schedule', (SELECT to_jsonb(s) - 'note' FROM public.free_policy_schedule s WHERE s.status = 'pending' LIMIT 1),
         'last_applied', (SELECT to_jsonb(s) - 'note' FROM public.free_policy_schedule s WHERE s.status = 'applied' ORDER BY applied_at DESC LIMIT 1));
$$;

-- ───────── trigger สร้างงาน (064) ใช้โหมดเดียวกัน: none = กันที่ INSERT · new_customer = กติกา 057 · daily = ผ่าน ─────────
CREATE OR REPLACE FUNCTION public.guard_new_customer_trial_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m jsonb; u public.app_users%ROWTYPE;
BEGIN
  IF NEW.access_source <> 'free' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'failed' AND OLD.status <> 'failed' THEN
      IF NEW.free_access_kind = 'bonus_reserved' THEN
        PERFORM 1 FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
        UPDATE public.app_users SET bonus_scans = bonus_scans + 1 WHERE id = NEW.app_user_id;
        NEW.free_access_kind := 'bonus_released';
      END IF;
      RETURN NEW;
    END IF;
    IF NOT (OLD.status = 'failed' AND NEW.status <> 'failed') THEN RETURN NEW; END IF;
    IF NEW.free_access_kind = 'bonus_released' THEN
      SELECT * INTO u FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
      IF COALESCE(u.bonus_scans, 0) < 1 THEN RAISE EXCEPTION 'bonus_quota_exhausted'; END IF;
      UPDATE public.app_users SET bonus_scans = bonus_scans - 1 WHERE id = u.id;
      NEW.free_access_kind := 'bonus_reserved';
      RETURN NEW;
    END IF;
    IF NEW.free_access_kind IN ('bonus', 'bonus_reserved') THEN RETURN NEW; END IF;
  ELSIF NEW.free_access_kind = 'bonus' THEN
    RETURN NEW;
  ELSIF NEW.free_access_kind = 'bonus_reserved' THEN
    SELECT * INTO u FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
    IF u.id IS NULL OR u.line_user_id IS DISTINCT FROM NEW.line_user_id THEN RAISE EXCEPTION 'trial_user_mismatch'; END IF;
    IF COALESCE(u.bonus_scans, 0) < 1 THEN RAISE EXCEPTION 'bonus_quota_exhausted'; END IF;
    UPDATE public.app_users SET bonus_scans = bonus_scans - 1 WHERE id = u.id;
    RETURN NEW;
  END IF;
  m := public.free_policy_mode_now();
  IF (m->>'mode') = 'daily' THEN RETURN NEW; END IF;
  IF (m->>'mode') = 'none' THEN RAISE EXCEPTION 'free_policy_none' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO u FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
  IF u.id IS NULL OR u.line_user_id IS DISTINCT FROM NEW.line_user_id THEN RAISE EXCEPTION 'trial_user_mismatch'; END IF;
  IF m->>'eligible_since' IS NULL OR u.created_at IS NULL OR u.created_at < (m->>'eligible_since')::timestamptz THEN
    RAISE EXCEPTION 'trial_not_eligible' USING ERRCODE = 'P0001';
  END IF;
  IF public.new_customer_trial_used(u.id) >= 2 THEN RAISE EXCEPTION 'trial_quota_exhausted' USING ERRCODE = 'P0001'; END IF;
  NEW.free_access_kind := 'trial';
  RETURN NEW;
END;
$$;

-- ───────── เขียน (เฉพาะ free_policy_admin) ─────────
CREATE OR REPLACE FUNCTION public.free_policy_notice_check(p_from text, p_to text, p_effective_at timestamptz, p_announced_at timestamptz)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_from = 'daily' AND p_to IN ('new_customer','none') THEN
    IF p_announced_at IS NULL THEN RAISE EXCEPTION 'notice_required' USING ERRCODE = 'P0001'; END IF;
    IF p_announced_at > p_effective_at THEN RAISE EXCEPTION 'announced_at_after_effective' USING ERRCODE = 'P0001'; END IF;
    IF p_effective_at < p_announced_at + interval '72 hours' THEN RAISE EXCEPTION 'notice_period_72h' USING ERRCODE = 'P0001'; END IF;
  END IF;
END;
$$;

-- ภายใน (ไม่ grant ใคร): เขียนสองสวิตช์ในทรานแซกชันเดียว · eligible_since ของเดิมคง · ตั้งครั้งแรก = p_eligible_since_if_first
CREATE OR REPLACE FUNCTION public.free_policy_apply_internal(p_mode text, p_actor text, p_eligible_since_if_first timestamptz, p_schedule_id bigint, p_announced_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE from_mode text; cfg jsonb; fp jsonb;
BEGIN
  IF p_mode NOT IN ('daily','new_customer','none') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  PERFORM 1 FROM public.app_settings WHERE key IN ('new_customer_trial','free_policy') FOR UPDATE;
  from_mode := public.free_policy_stored_mode();
  SELECT value INTO cfg FROM public.app_settings WHERE key = 'new_customer_trial';
  IF cfg IS NULL THEN RAISE EXCEPTION 'trial_policy_unavailable'; END IF;
  cfg := jsonb_build_object('enabled', p_mode = 'new_customer', 'limit', 2,
    'eligible_since', COALESCE(cfg->>'eligible_since', CASE WHEN p_mode = 'new_customer' THEN p_eligible_since_if_first::text END));
  UPDATE public.app_settings SET value = cfg, updated_at = now() WHERE key = 'new_customer_trial';
  fp := jsonb_build_object('daily_enabled', p_mode = 'daily', 'updated_at', now()::text, 'updated_by', p_actor);
  INSERT INTO public.app_settings(key, value) VALUES ('free_policy', fp) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO public.free_policy_audit(actor, action, from_mode, to_mode, schedule_id, announced_at, detail)
  VALUES (p_actor, 'mode_set', from_mode, p_mode, p_schedule_id, p_announced_at,
          jsonb_build_object('eligible_since', cfg->>'eligible_since', 'via', CASE WHEN p_schedule_id IS NULL THEN 'manual' ELSE 'schedule' END));
  RETURN public.free_policy_mode_now();
END;
$$;

-- เปลี่ยนทันที: ตรวจ 72h จากโหมดที่มีผล · มี pending ค้าง = ปฏิเสธ (p_cancel_pending = ยกเลิกก่อน ไม่ใช่ทางลัด 72h)
CREATE OR REPLACE FUNCTION public.set_free_policy_mode(p_mode text, p_actor text, p_announced_at timestamptz DEFAULT NULL, p_cancel_pending boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m jsonb; from_mode text; pend record;
BEGIN
  IF p_mode NOT IN ('daily','new_customer','none') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  IF p_announced_at IS NOT NULL AND p_announced_at > now() THEN RAISE EXCEPTION 'announced_at_in_future' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO pend FROM public.free_policy_schedule WHERE status = 'pending' FOR UPDATE;
  IF FOUND THEN
    IF NOT p_cancel_pending THEN RAISE EXCEPTION 'schedule_pending' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.free_policy_schedule SET status = 'cancelled', cancelled_by = p_actor, cancelled_at = now(), note = 'cancelled_by_manual_change' WHERE id = pend.id;
    INSERT INTO public.free_policy_audit(actor, action, from_mode, to_mode, schedule_id, detail) VALUES (p_actor, 'schedule_cancelled', NULL, pend.target_mode, pend.id, '{"reason":"manual_change"}');
  END IF;
  m := public.free_policy_mode_now();
  from_mode := m->>'mode';
  PERFORM public.free_policy_notice_check(from_mode, p_mode, now(), p_announced_at);
  IF from_mode = p_mode AND (m->>'stored_mode') = p_mode THEN
    INSERT INTO public.free_policy_audit(actor, action, from_mode, to_mode, announced_at, detail) VALUES (p_actor, 'mode_noop', from_mode, p_mode, p_announced_at, '{}');
    RETURN m;
  END IF;
  RETURN public.free_policy_apply_internal(p_mode, p_actor, now(), NULL, p_announced_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.free_policy_schedule_set(p_target_mode text, p_effective_at timestamptz, p_announced_at timestamptz, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE from_mode text; old record; nid bigint;
BEGIN
  IF p_target_mode NOT IN ('daily','new_customer','none') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  IF p_effective_at IS NULL OR p_effective_at <= now() THEN RAISE EXCEPTION 'effective_at_must_be_future' USING ERRCODE = 'P0001'; END IF;
  IF p_announced_at IS NOT NULL AND p_announced_at > now() THEN RAISE EXCEPTION 'announced_at_in_future' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO old FROM public.free_policy_schedule WHERE status = 'pending' FOR UPDATE;
  from_mode := public.free_policy_stored_mode(); -- หลังแทนที่ pending เดิม โหมดที่จะเป็นฐานคือ stored mode
  PERFORM public.free_policy_notice_check(from_mode, p_target_mode, p_effective_at, p_announced_at);
  IF FOUND THEN
    UPDATE public.free_policy_schedule SET status = 'superseded', cancelled_by = p_actor, cancelled_at = now(), note = 'superseded_by_new_schedule' WHERE id = old.id;
  END IF;
  INSERT INTO public.free_policy_schedule(target_mode, effective_at, announced_at, created_by) VALUES (p_target_mode, p_effective_at, p_announced_at, p_actor) RETURNING id INTO nid;
  INSERT INTO public.free_policy_audit(actor, action, from_mode, to_mode, schedule_id, announced_at, detail)
  VALUES (p_actor, 'schedule_set', from_mode, p_target_mode, nid, p_announced_at, jsonb_build_object('effective_at', p_effective_at, 'superseded', old.id));
  RETURN (SELECT to_jsonb(s) FROM public.free_policy_schedule s WHERE s.id = nid);
END;
$$;

CREATE OR REPLACE FUNCTION public.free_policy_schedule_cancel(p_id bigint, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM public.free_policy_schedule WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule_not_pending' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.free_policy_schedule SET status = 'cancelled', cancelled_by = p_actor, cancelled_at = now() WHERE id = p_id;
  INSERT INTO public.free_policy_audit(actor, action, to_mode, schedule_id, detail) VALUES (p_actor, 'schedule_cancelled', s.target_mode, p_id, '{"reason":"cancel"}');
  RETURN (SELECT to_jsonb(x) FROM public.free_policy_schedule x WHERE x.id = p_id);
END;
$$;

-- apply ที่ถึงเวลา: ครั้งเดียว (FOR UPDATE SKIP LOCKED) · restart-safe · cutoff = effective_at ของ schedule (ถ้า trial เปิดครั้งแรก)
CREATE OR REPLACE FUNCTION public.free_policy_schedule_apply_due()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; from_mode text; m jsonb;
BEGIN
  SELECT * INTO s FROM public.free_policy_schedule WHERE status = 'pending' AND effective_at <= now() ORDER BY effective_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('applied', false, 'mode', public.free_policy_mode_now()->>'mode'); END IF;
  from_mode := public.free_policy_stored_mode();
  m := public.free_policy_apply_internal(s.target_mode, 'schedule:' || s.id, s.effective_at, s.id, s.announced_at);
  UPDATE public.free_policy_schedule SET status = 'applied', applied_at = now(), applied_from_mode = from_mode WHERE id = s.id;
  RETURN jsonb_build_object('applied', true, 'schedule_id', s.id, 'from', from_mode, 'to', s.target_mode, 'effective_at', s.effective_at, 'mode', m->>'mode', 'eligible_since', m->>'eligible_since');
END;
$$;

-- ช่องทางเก่า: ผ่านกติกาใหม่ (ไม่มี announced_at → ถอน daily ไม่ได้ · มี pending → ปฏิเสธ) · ไม่ให้ web_anon เรียก
CREATE OR REPLACE FUNCTION public.set_new_customer_trial_policy(p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m jsonb;
BEGIN
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'trial_enabled_required'; END IF;
  m := public.set_free_policy_mode(CASE WHEN p_enabled THEN 'new_customer' ELSE 'daily' END, 'legacy:set_new_customer_trial_policy', NULL, false);
  RETURN (SELECT value FROM public.app_settings WHERE key = 'new_customer_trial');
END;
$$;

-- ───────── สิทธิ์ ─────────
REVOKE ALL ON FUNCTION public.free_policy_stored_mode() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.free_policy_mode_now(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.free_policy_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.new_customer_trial_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.free_policy_notice_check(text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.free_policy_apply_internal(text, text, timestamptz, bigint, timestamptz) FROM PUBLIC, web_anon, service_role, free_policy_admin;
REVOKE ALL ON FUNCTION public.set_free_policy_mode(text, text, timestamptz, boolean) FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON FUNCTION public.free_policy_schedule_set(text, timestamptz, timestamptz, text) FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON FUNCTION public.free_policy_schedule_cancel(bigint, text) FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON FUNCTION public.free_policy_schedule_apply_due() FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON FUNCTION public.set_new_customer_trial_policy(boolean) FROM PUBLIC, web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.free_policy_stored_mode() TO web_anon, service_role, free_policy_admin;
GRANT EXECUTE ON FUNCTION public.free_policy_mode_now(timestamptz) TO web_anon, service_role, free_policy_admin;
GRANT EXECUTE ON FUNCTION public.free_policy_status(text) TO web_anon, service_role, free_policy_admin;
GRANT EXECUTE ON FUNCTION public.new_customer_trial_status(text) TO web_anon, service_role, free_policy_admin;
GRANT EXECUTE ON FUNCTION public.set_free_policy_mode(text, text, timestamptz, boolean) TO free_policy_admin;
GRANT EXECUTE ON FUNCTION public.free_policy_schedule_set(text, timestamptz, timestamptz, text) TO free_policy_admin;
GRANT EXECUTE ON FUNCTION public.free_policy_schedule_cancel(bigint, text) TO free_policy_admin;
GRANT EXECUTE ON FUNCTION public.free_policy_schedule_apply_due() TO free_policy_admin;
GRANT EXECUTE ON FUNCTION public.set_new_customer_trial_policy(boolean) TO free_policy_admin;
COMMIT;
NOTIFY pgrst, 'reload schema';
