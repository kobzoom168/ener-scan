-- 068: outbox ของแจ้งเตือนแอดมิน (Telegram) — ส่งไม่ได้ = เก็บไว้ retry ตรวจสอบได้ ห้าม fallback LINE (กบ/Codex 19 ต.ค. 2026)
-- idempotent · additive · rollback ห้าม DROP (คงตารางไว้)
BEGIN;
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
GRANT SELECT, INSERT, UPDATE ON public.admin_alert_outbox TO web_anon, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_alert_outbox_id_seq TO web_anon, service_role;

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

-- ผลการส่ง: ok → sent · ไม่ ok → queued + backoff 1,2,4,…,60 นาที (เคารพ retry_after ถ้ามากกว่า) · เกิน 24 ชม. หรือ 12 ครั้ง → failed (คงแถว ตรวจได้)
CREATE OR REPLACE FUNCTION public.admin_alert_outbox_finish(p_id bigint, p_ok boolean, p_error text DEFAULT NULL, p_retry_after_sec integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.admin_alert_outbox%ROWTYPE; backoff interval; new_status text;
BEGIN
  SELECT * INTO r FROM public.admin_alert_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF p_ok THEN
    UPDATE public.admin_alert_outbox SET status = 'sent', sent_at = now(), updated_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'status', 'sent');
  END IF;
  backoff := GREATEST(make_interval(mins => LEAST(60, (2 ^ LEAST(r.attempts, 6))::int)), make_interval(secs => COALESCE(p_retry_after_sec, 0)));
  new_status := CASE WHEN r.attempts + 1 >= 12 OR r.created_at < now() - interval '24 hours' THEN 'failed' ELSE 'queued' END;
  UPDATE public.admin_alert_outbox SET status = new_status, attempts = attempts + 1, next_attempt_at = now() + backoff,
         last_error = left(COALESCE(p_error, 'send_failed'), 200), updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', false, 'status', new_status, 'attempts', r.attempts + 1, 'next_attempt_at', now() + backoff);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_alert_outbox_claim(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_alert_outbox_finish(bigint, boolean, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_alert_outbox_claim(integer) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_alert_outbox_finish(bigint, boolean, text, integer) TO web_anon, service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
