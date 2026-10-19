-- 068: outbox ของแจ้งเตือนแอดมิน (Telegram) — ส่งไม่ได้ = เก็บไว้ retry ตรวจสอบได้ ห้าม fallback LINE (กบ/Codex 19 ต.ค. 2026)
-- idempotent · additive · rollback ห้าม DROP (คงตารางไว้)
-- สิทธิ์ (Codex รอบ 2): web_anon/PUBLIC ไม่มีสิทธิ์ใด ๆ ทั้งตารางและ RPC · เขียน/claim/finish ผ่าน role จำกัด admin_alert_writer
--   (JWT ADMIN_ALERT_DB_KEY เซ็นด้วย PGRST_JWT_SECRET) หรือ service_role · ops อ่านตารางผ่าน service_role
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_alert_writer') THEN CREATE ROLE admin_alert_writer NOLOGIN; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN EXECUTE 'GRANT admin_alert_writer TO authenticator'; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO admin_alert_writer;

CREATE TABLE IF NOT EXISTS public.admin_alert_outbox (
  id              bigserial PRIMARY KEY,
  env_label       text NOT NULL,
  category        text NOT NULL,
  severity        text NOT NULL DEFAULT 'info',
  text            text NOT NULL,
  dedupe_key      text,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed')),
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_admin_alert_outbox_due ON public.admin_alert_outbox (next_attempt_at) WHERE status IN ('queued','sending');
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_alert_outbox_dedupe_pending ON public.admin_alert_outbox (dedupe_key) WHERE status IN ('queued','sending') AND dedupe_key IS NOT NULL;
-- ตาราง: ไม่มีใครเขียนตรง (ทุกทางผ่าน RPC SECURITY DEFINER) · service_role อ่านเพื่อ ops
REVOKE ALL ON TABLE public.admin_alert_outbox FROM PUBLIC, web_anon, service_role, admin_alert_writer;
REVOKE ALL ON SEQUENCE public.admin_alert_outbox_id_seq FROM PUBLIC, web_anon, service_role, admin_alert_writer;
GRANT SELECT ON public.admin_alert_outbox TO service_role;

-- enqueue (ส่งตรงล้มแล้ว): dedupe_key ที่ค้าง queued/sending อยู่ = ไม่เพิ่มแถว (duplicate=true)
CREATE OR REPLACE FUNCTION public.admin_alert_outbox_enqueue(p_env_label text, p_category text, p_severity text, p_text text, p_dedupe_key text DEFAULT NULL, p_last_error text DEFAULT NULL, p_next_attempt_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid bigint;
BEGIN
  IF p_env_label IS NULL OR p_category IS NULL OR p_text IS NULL OR length(p_text) = 0 THEN RAISE EXCEPTION 'admin_alert_invalid' USING ERRCODE = 'P0001'; END IF;
  BEGIN
    INSERT INTO public.admin_alert_outbox(env_label, category, severity, text, dedupe_key, status, attempts, last_error, next_attempt_at)
    VALUES (left(p_env_label, 80), left(p_category, 40), COALESCE(left(p_severity, 10), 'info'), p_text, p_dedupe_key, 'queued', 1, left(p_last_error, 200), COALESCE(p_next_attempt_at, now() + interval '60 seconds'))
    RETURNING id INTO nid;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('queued', true, 'duplicate', true, 'id', (SELECT id FROM public.admin_alert_outbox WHERE dedupe_key = p_dedupe_key AND status IN ('queued','sending') LIMIT 1));
  END;
  RETURN jsonb_build_object('queued', true, 'duplicate', false, 'id', nid);
END;
$$;

-- claim แถวที่ถึงเวลา (ครั้งเดียวต่อแถว): queued → sending · sending ที่ค้างเกิน 10 นาที (worker ตาย) หยิบใหม่ได้
CREATE OR REPLACE FUNCTION public.admin_alert_outbox_claim(p_limit integer DEFAULT 20)
RETURNS SETOF public.admin_alert_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.admin_alert_outbox o SET status = 'sending', updated_at = now()
   WHERE o.id IN (
     SELECT id FROM public.admin_alert_outbox
      WHERE (status = 'queued' AND next_attempt_at <= now()) OR (status = 'sending' AND updated_at < now() - interval '10 minutes')
      ORDER BY next_attempt_at, id LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100) FOR UPDATE SKIP LOCKED)
   RETURNING o.*;
END;
$$;

-- ผลการส่ง: ok → sent (ซ้ำบนแถว sent = idempotent ไม่เปลี่ยน) · ไม่ ok → queued + backoff 1,2,4,…,60 นาที (เคารพ retry_after ถ้ามากกว่า)
--   p_text (ไม่ว่าง) = ข้อความส่วนที่ยังไม่ได้ส่ง (ส่งสำเร็จบางก้อน) → เก็บแทนของเดิม รอบหน้าไม่ส่งก้อนที่สำเร็จแล้วซ้ำ
--   เกิน 24 ชม. หรือ 12 ครั้ง → failed (คงแถว ตรวจได้)
CREATE OR REPLACE FUNCTION public.admin_alert_outbox_finish(p_id bigint, p_ok boolean, p_error text DEFAULT NULL, p_retry_after_sec integer DEFAULT NULL, p_text text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.admin_alert_outbox%ROWTYPE; backoff interval; new_status text;
BEGIN
  SELECT * INTO r FROM public.admin_alert_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF r.status = 'sent' THEN RETURN jsonb_build_object('ok', true, 'status', 'sent', 'already', true); END IF;
  IF p_ok THEN
    UPDATE public.admin_alert_outbox SET status = 'sent', sent_at = now(), updated_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'status', 'sent');
  END IF;
  backoff := GREATEST(make_interval(mins => LEAST(60, (2 ^ LEAST(r.attempts, 6))::int)), make_interval(secs => COALESCE(p_retry_after_sec, 0)));
  new_status := CASE WHEN r.attempts + 1 >= 12 OR r.created_at < now() - interval '24 hours' THEN 'failed' ELSE 'queued' END;
  UPDATE public.admin_alert_outbox SET status = new_status, attempts = attempts + 1, next_attempt_at = now() + backoff,
         text = CASE WHEN p_text IS NOT NULL AND length(p_text) > 0 THEN p_text ELSE text END,
         last_error = left(COALESCE(p_error, 'send_failed'), 200), updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', false, 'status', new_status, 'attempts', r.attempts + 1, 'next_attempt_at', now() + backoff);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_alert_outbox_enqueue(text, text, text, text, text, text, timestamptz) FROM PUBLIC, web_anon;
REVOKE ALL ON FUNCTION public.admin_alert_outbox_claim(integer) FROM PUBLIC, web_anon;
REVOKE ALL ON FUNCTION public.admin_alert_outbox_finish(bigint, boolean, text, integer, text) FROM PUBLIC, web_anon;
GRANT EXECUTE ON FUNCTION public.admin_alert_outbox_enqueue(text, text, text, text, text, text, timestamptz) TO admin_alert_writer, service_role;
GRANT EXECUTE ON FUNCTION public.admin_alert_outbox_claim(integer) TO admin_alert_writer, service_role;
GRANT EXECUTE ON FUNCTION public.admin_alert_outbox_finish(bigint, boolean, text, integer, text) TO admin_alert_writer, service_role;
-- ลายเซ็นเดิม (รอบ 1, ไม่เคย apply ที่ staging/Pro) ถ้ามีใน DB ทดสอบ → ถอนทิ้ง
DROP FUNCTION IF EXISTS public.admin_alert_outbox_finish(bigint, boolean, text, integer);
COMMIT;
NOTIFY pgrst, 'reload schema';
