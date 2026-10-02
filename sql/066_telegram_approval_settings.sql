-- 066: ตั้งค่า Telegram อนุมัติสลิปผ่านหน้า Admin (Codex/กบ 2 ต.ค. 2026) — config อยู่ใน DB เข้ารหัสที่แอป (AES-256-GCM, key = env TELEGRAM_CONFIG_KEY)
--
-- หลักความปลอดภัย:
--   * ตาราง REVOKE จาก PUBLIC/web_anon/service_role — เข้าถึงผ่าน RPC SECURITY DEFINER เท่านั้น
--   * RPC ทั้งหมดเรียกได้เฉพาะ role จำกัด `telegram_config_admin` (NOLOGIN, ผ่าน authenticator) — **web_anon เรียกตรงไม่ได้**
--     แอปใช้ JWT ของ role นี้ (env TELEGRAM_CONFIG_DB_KEY, ops ตั้ง) เฉพาะใน store ของ config · หน้า Admin เรียกผ่าน backend หลัง login+CSRF
--   * DB ไม่เคยเห็น plaintext token/secret (เก็บ ciphertext `v1:<iv>:<tag>:<data>` base64url)
--   * บันทึกค่า ≠ เปิดใช้งาน: enabled เริ่ม false และเปลี่ยนได้ด้วย RPC แยก (telegram_settings_set_enabled)
--   * audit ลง payment_approval_audit channel 'admin_config' โดยไม่มีค่า secret
-- idempotent · ไม่ backfill · rollback: ห้าม DROP ตาราง — ปิดด้วย set_enabled(false) + ย้อนโค้ด (โค้ดเก่าอ่าน env เท่านั้น; env ไม่มี = ปิด)
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'telegram_config_admin') THEN
    CREATE ROLE telegram_config_admin NOLOGIN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE 'GRANT telegram_config_admin TO authenticator';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO telegram_config_admin;

CREATE TABLE IF NOT EXISTS public.telegram_approval_settings (
  id                 smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bot_token_enc      text,
  webhook_secret_enc text,
  chat_id            text,
  approvers          jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled            boolean NOT NULL DEFAULT false,
  token_set_at       timestamptz,
  webhook_set_at     timestamptz,
  enabled_changed_at timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         text
);
REVOKE ALL ON TABLE public.telegram_approval_settings FROM PUBLIC, web_anon, service_role, telegram_config_admin;

-- อ่านสถานะสาธารณะ (ไม่มี ciphertext) — ให้หน้า Admin
CREATE OR REPLACE FUNCTION public.telegram_settings_get_public()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'configured', (s.bot_token_enc IS NOT NULL AND s.webhook_secret_enc IS NOT NULL AND s.chat_id IS NOT NULL AND jsonb_array_length(s.approvers) > 0),
      'token_set', s.bot_token_enc IS NOT NULL,
      'enabled', s.enabled,
      'chat_id', s.chat_id,
      'approvers', s.approvers,
      'token_set_at', s.token_set_at, 'webhook_set_at', s.webhook_set_at, 'enabled_changed_at', s.enabled_changed_at,
      'updated_at', s.updated_at, 'updated_by', s.updated_by)
    FROM public.telegram_approval_settings s WHERE s.id = 1),
    jsonb_build_object('configured', false, 'token_set', false, 'enabled', false, 'chat_id', NULL, 'approvers', '[]'::jsonb));
$$;

-- อ่าน ciphertext + รายชื่อ — ให้ service ตอน runtime (decrypt ที่แอป)
CREATE OR REPLACE FUNCTION public.telegram_settings_get_secrets()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object('enabled', s.enabled, 'bot_token_enc', s.bot_token_enc, 'webhook_secret_enc', s.webhook_secret_enc,
                              'chat_id', s.chat_id, 'approvers', s.approvers)
    FROM public.telegram_approval_settings s WHERE s.id = 1),
    jsonb_build_object('enabled', false));
$$;

-- บันทึก: NULL = คงค่าเดิม (token/secret) · approvers = [{label, tg_user_id}] · เขียน audit ไม่มีค่า secret
CREATE OR REPLACE FUNCTION public.telegram_settings_save(
  p_chat_id text, p_approvers jsonb, p_token_enc text, p_secret_enc text, p_actor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existed boolean; token_changed boolean := p_token_enc IS NOT NULL; fields text[] := ARRAY[]::text[];
BEGIN
  IF p_chat_id IS NULL OR p_chat_id !~ '^-?[0-9]{3,20}$' THEN RAISE EXCEPTION 'invalid_chat_id'; END IF;
  IF p_approvers IS NULL OR jsonb_typeof(p_approvers) <> 'array' OR jsonb_array_length(p_approvers) < 1 THEN RAISE EXCEPTION 'approvers_required'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_approvers) a WHERE COALESCE(a->>'tg_user_id','') !~ '^[0-9]{3,20}$') THEN RAISE EXCEPTION 'invalid_approver_id'; END IF;
  IF (SELECT count(DISTINCT a->>'tg_user_id') FROM jsonb_array_elements(p_approvers) a) <> jsonb_array_length(p_approvers) THEN RAISE EXCEPTION 'duplicate_approver_id'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.telegram_approval_settings WHERE id = 1) INTO existed;
  IF NOT existed AND p_token_enc IS NULL THEN RAISE EXCEPTION 'token_required_on_first_save'; END IF;
  IF NOT existed AND p_secret_enc IS NULL THEN RAISE EXCEPTION 'secret_required_on_first_save'; END IF;
  INSERT INTO public.telegram_approval_settings (id, bot_token_enc, webhook_secret_enc, chat_id, approvers, token_set_at, updated_at, updated_by)
  VALUES (1, p_token_enc, p_secret_enc, p_chat_id, p_approvers, CASE WHEN p_token_enc IS NOT NULL THEN now() END, now(), p_actor)
  ON CONFLICT (id) DO UPDATE SET
    bot_token_enc      = COALESCE(EXCLUDED.bot_token_enc, public.telegram_approval_settings.bot_token_enc),
    webhook_secret_enc = COALESCE(EXCLUDED.webhook_secret_enc, public.telegram_approval_settings.webhook_secret_enc),
    chat_id            = EXCLUDED.chat_id,
    approvers          = EXCLUDED.approvers,
    token_set_at       = CASE WHEN EXCLUDED.bot_token_enc IS NOT NULL THEN now() ELSE public.telegram_approval_settings.token_set_at END,
    updated_at = now(), updated_by = p_actor;
  fields := ARRAY['chat_id','approvers'] || CASE WHEN token_changed THEN ARRAY['bot_token'] ELSE ARRAY[]::text[] END || CASE WHEN p_secret_enc IS NOT NULL THEN ARRAY['webhook_secret'] ELSE ARRAY[]::text[] END;
  INSERT INTO public.payment_approval_audit(payment_id, channel, actor, action, result, detail)
  VALUES (NULL, 'admin_config', p_actor, 'telegram_settings_saved', 'ok',
          jsonb_build_object('fields', to_jsonb(fields), 'token_changed', token_changed, 'approver_count', jsonb_array_length(p_approvers), 'first_save', NOT existed));
  RETURN public.telegram_settings_get_public();
END;
$$;

-- เปิด/ปิด แยกจากการบันทึกค่า (รอบอนุมัติแยก) — เปิดได้เฉพาะเมื่อครบ
CREATE OR REPLACE FUNCTION public.telegram_settings_set_enabled(p_enabled boolean, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.telegram_approval_settings%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.telegram_approval_settings WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_configured'; END IF;
  IF p_enabled AND (s.bot_token_enc IS NULL OR s.webhook_secret_enc IS NULL OR s.chat_id IS NULL OR jsonb_array_length(s.approvers) = 0) THEN
    RAISE EXCEPTION 'not_configured';
  END IF;
  UPDATE public.telegram_approval_settings SET enabled = p_enabled, enabled_changed_at = now(), updated_at = now(), updated_by = p_actor WHERE id = 1;
  INSERT INTO public.payment_approval_audit(payment_id, channel, actor, action, result, detail)
  VALUES (NULL, 'admin_config', p_actor, CASE WHEN p_enabled THEN 'telegram_enabled' ELSE 'telegram_disabled' END, 'ok', '{}'::jsonb);
  RETURN public.telegram_settings_get_public();
END;
$$;

-- สิทธิ์: เฉพาะ telegram_config_admin · web_anon/service_role/PUBLIC เรียกไม่ได้
REVOKE ALL ON FUNCTION public.telegram_settings_get_public()                          FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON FUNCTION public.telegram_settings_get_secrets()                         FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON FUNCTION public.telegram_settings_save(text, jsonb, text, text, text)   FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON FUNCTION public.telegram_settings_set_enabled(boolean, text)            FROM PUBLIC, web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.telegram_settings_get_public()                        TO telegram_config_admin;
GRANT EXECUTE ON FUNCTION public.telegram_settings_get_secrets()                       TO telegram_config_admin;
GRANT EXECUTE ON FUNCTION public.telegram_settings_save(text, jsonb, text, text, text) TO telegram_config_admin;
GRANT EXECUTE ON FUNCTION public.telegram_settings_set_enabled(boolean, text)          TO telegram_config_admin;
COMMIT;
NOTIFY pgrst, 'reload schema';
