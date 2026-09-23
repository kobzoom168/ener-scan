-- 061: อนุมัติสลิปผ่าน Telegram (งาน 3 — กบ 23 ก.ย. 2026)
--
-- เก็บ 2 อย่างฝั่ง server:
--   1) telegram_approval_tokens — token อ้างอิงปุ่ม มีอายุและใช้ได้ครั้งเดียว
--      (ห้ามฝังยอด/แพ็ก/สิทธิ์ลงใน callback_data ของ Telegram — ปลอมได้)
--   2) payment_approval_audit  — ใคร/เมื่อไร/รายการไหน/ช่องทางไหน/ผลเป็นอย่างไร
--      บันทึกทุกความพยายาม รวมถึงที่ถูกปฏิเสธ
--
-- idempotent · ไม่แก้ข้อมูลลูกค้า · ไม่มี backfill
BEGIN;

CREATE TABLE IF NOT EXISTS public.telegram_approval_tokens (
  token                   text PRIMARY KEY,
  payment_id              uuid NOT NULL,
  kind                    text NOT NULL,          -- 'confirm' = ปุ่มยืนยันขั้นสุดท้าย
  -- snapshot ณ ตอนสร้างปุ่ม ใช้ตรวจว่า "ข้อมูลเปลี่ยนไปหรือยัง" ตอนกดยืนยัน
  snapshot_amount         numeric,
  snapshot_package_code   text,
  snapshot_status         text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NOT NULL,
  used_at                 timestamptz,
  used_by_tg_user_id      text,
  CONSTRAINT telegram_approval_tokens_kind_check CHECK (kind IN ('confirm'))
);
CREATE INDEX IF NOT EXISTS idx_tg_approval_tokens_payment
  ON public.telegram_approval_tokens(payment_id);
CREATE INDEX IF NOT EXISTS idx_tg_approval_tokens_expires
  ON public.telegram_approval_tokens(expires_at);

CREATE TABLE IF NOT EXISTS public.payment_approval_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   uuid,
  channel      text NOT NULL,        -- 'telegram' | 'web' | 'line' | ...
  actor        text,                 -- telegram user id / admin id (ไม่ใช่ username)
  action       text NOT NULL,        -- 'notify_sent'|'approve_requested'|'approve_confirmed'|...
  result       text NOT NULL,        -- 'ok' | 'denied' | 'stale' | 'error'
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_approval_audit_payment
  ON public.payment_approval_audit(payment_id, created_at DESC);

-- ใช้ token ได้ครั้งเดียว: claim แบบ atomic (UPDATE ... WHERE used_at IS NULL)
-- คืนแถวเฉพาะตอนที่ "เราเป็นคนเคลมสำเร็จ" เท่านั้น → กดซ้ำ/ยิงซ้ำได้ null
CREATE OR REPLACE FUNCTION public.consume_telegram_approval_token(
  p_token text, p_tg_user_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.telegram_approval_tokens%ROWTYPE; existed boolean;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN RAISE EXCEPTION 'token_required'; END IF;
  UPDATE public.telegram_approval_tokens
     SET used_at = now(), used_by_tg_user_id = btrim(COALESCE(p_tg_user_id,''))
   WHERE token = p_token AND used_at IS NULL AND expires_at > now()
   RETURNING * INTO r;
  IF r.token IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'paymentId', r.payment_id, 'kind', r.kind,
      'snapshotAmount', r.snapshot_amount, 'snapshotPackageCode', r.snapshot_package_code,
      'snapshotStatus', r.snapshot_status);
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.telegram_approval_tokens WHERE token = p_token) INTO existed;
  RETURN jsonb_build_object('ok', false,
    'reason', CASE WHEN existed THEN 'used_or_expired' ELSE 'unknown_token' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_telegram_approval_token(
  p_token text, p_payment_id uuid, p_ttl_seconds integer,
  p_amount numeric, p_package_code text, p_status text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN RAISE EXCEPTION 'token_required'; END IF;
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'payment_id_required'; END IF;
  IF COALESCE(p_ttl_seconds, 0) <= 0 OR p_ttl_seconds > 86400 THEN RAISE EXCEPTION 'ttl_out_of_range'; END IF;
  INSERT INTO public.telegram_approval_tokens(
      token, payment_id, kind, snapshot_amount, snapshot_package_code, snapshot_status, expires_at)
  VALUES (p_token, p_payment_id, 'confirm', p_amount, p_package_code, p_status,
          now() + make_interval(secs => p_ttl_seconds));
  RETURN true;
END;
$$;

-- เก็บ audit (ไม่มีข้อมูลส่วนตัว/token — ผู้เรียกต้องส่งมาเฉพาะที่ปลอดภัย)
CREATE OR REPLACE FUNCTION public.record_payment_approval_audit(
  p_payment_id uuid, p_channel text, p_actor text, p_action text, p_result text, p_detail jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_channel IS NULL OR p_action IS NULL OR p_result IS NULL THEN
    RAISE EXCEPTION 'audit_fields_required';
  END IF;
  INSERT INTO public.payment_approval_audit(payment_id, channel, actor, action, result, detail)
  VALUES (p_payment_id, p_channel, p_actor, p_action, p_result, COALESCE(p_detail, '{}'::jsonb));
  RETURN true;
END;
$$;

-- ล้าง token ที่หมดอายุเกิน 7 วัน (เรียกจาก maintenance ได้ ไม่บังคับ)
CREATE OR REPLACE FUNCTION public.purge_expired_telegram_approval_tokens()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.telegram_approval_tokens WHERE expires_at < now() - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON TABLE public.telegram_approval_tokens FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON TABLE public.payment_approval_audit   FROM PUBLIC, web_anon;
GRANT SELECT ON TABLE public.payment_approval_audit TO service_role;
REVOKE ALL ON FUNCTION public.consume_telegram_approval_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_telegram_approval_token(text, uuid, integer, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment_approval_audit(uuid, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_telegram_approval_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_telegram_approval_token(text, text) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.issue_telegram_approval_token(text, uuid, integer, numeric, text, text) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_approval_audit(uuid, text, text, text, text, jsonb) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_telegram_approval_tokens() TO web_anon, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
