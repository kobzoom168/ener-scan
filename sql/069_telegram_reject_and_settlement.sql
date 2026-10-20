-- 069: ปุ่ม "ไม่อนุมัติ" ใน Telegram (2 ขั้น) + ปฏิเสธแบบ atomic กันชนอนุมัติ + แยก "เงินรอดำเนินการ" ออกจาก "ไม่อนุมัติสิทธิ์"
--      + งานแจ้งลูกค้าแบบคงทน (reject_notify_pending) · รอบ 2 (Codex 20 ต.ค. 2026): RPC เขียนใช้ role ฝั่งเซิร์ฟเวอร์ payment_ops_writer เท่านั้น (ไม่ให้ web_anon/service_role)
-- idempotent · additive · rollback ห้าม DROP (คงคอลัมน์/ตารางไว้)
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payment_ops_writer') THEN CREATE ROLE payment_ops_writer NOLOGIN; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN EXECUTE 'GRANT payment_ops_writer TO authenticator'; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO payment_ops_writer;

-- 1) token ขั้นยืนยัน "ไม่อนุมัติ" (kind ใหม่ + เหตุผล)
ALTER TABLE public.telegram_approval_tokens ADD COLUMN IF NOT EXISTS reject_reason_code text;
ALTER TABLE public.telegram_approval_tokens DROP CONSTRAINT IF EXISTS telegram_approval_tokens_kind_check;
ALTER TABLE public.telegram_approval_tokens ADD CONSTRAINT telegram_approval_tokens_kind_check CHECK (kind IN ('confirm','reject_confirm'));

CREATE OR REPLACE FUNCTION public.issue_telegram_reject_token(
  p_token text, p_payment_id uuid, p_ttl_seconds integer, p_status text, p_reason_code text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN RAISE EXCEPTION 'token_required'; END IF;
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'payment_id_required'; END IF;
  IF COALESCE(p_ttl_seconds, 0) <= 0 OR p_ttl_seconds > 86400 THEN RAISE EXCEPTION 'ttl_out_of_range'; END IF;
  IF p_reason_code IS NULL OR p_reason_code !~ '^[a-z_]{2,32}$' THEN RAISE EXCEPTION 'reason_code_required'; END IF;
  INSERT INTO public.telegram_approval_tokens(token, payment_id, kind, snapshot_status, reject_reason_code, expires_at)
  VALUES (p_token, p_payment_id, 'reject_confirm', p_status, p_reason_code, now() + make_interval(secs => p_ttl_seconds));
  RETURN true;
END;
$$;

-- consume: คืน kind + reject_reason_code (ปุ่มอนุมัติ/ไม่อนุมัติใช้สลับกันไม่ได้ — ผู้เรียกต้องตรวจ kind)
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
      'snapshotStatus', r.snapshot_status, 'rejectReasonCode', r.reject_reason_code);
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.telegram_approval_tokens WHERE token = p_token) INTO existed;
  RETURN jsonb_build_object('ok', false,
    'reason', CASE WHEN existed THEN 'used_or_expired' ELSE 'unknown_token' END);
END;
$$;

-- 2) เงินรอดำเนินการ (แยกจากสถานะสิทธิ์) + งานแจ้งลูกค้าคงทน
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'none';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS settlement_note text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS settlement_updated_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS settlement_by text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reject_notify_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reject_notify_queued_at timestamptz;
-- รอบ 3 (Codex 20 ต.ค. 2026): snapshot ข้อความแจ้งลูกค้า "ณ เวลาปฏิเสธ" (reasonText/reasonCode/moneyPending) — ทุกเส้นกู้คืน (Telegram กดซ้ำ / Admin / sweep) ใช้ชุดเดียวกัน ไม่เปลี่ยนตามข้อมูลภายหลัง
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reject_notify_snapshot jsonb;
-- รอบ 3: กันข้อความแจ้งปฏิเสธซ้ำระดับ DB — 1 แถว outbound ต่อ payment (ทุกสถานะ รวม sent/failed/dead) · แอปจับ 23505 = dedupe
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_reject_notify_per_payment
  ON public.outbound_messages (related_payment_id) WHERE kind = 'reject_notify' AND related_payment_id IS NOT NULL;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_settlement_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_settlement_status_check
  CHECK (settlement_status IN ('none','money_pending','refunded','topped_up','written_off'));
CREATE INDEX IF NOT EXISTS idx_payments_settlement_money_pending ON public.payments (settlement_updated_at) WHERE settlement_status = 'money_pending';
CREATE INDEX IF NOT EXISTS idx_payments_reject_notify_pending ON public.payments (rejected_at) WHERE reject_notify_pending;

-- 3) ปฏิเสธแบบ atomic: ล็อกแถว · pending_verify เท่านั้น · paid = ไม่แตะ · rejected = idempotent · ไม่แตะสิทธิ์ผู้ใช้
--    "เงินรอดำเนินการ" ตัดสินใน DB จากข้อมูลที่ล็อกอยู่: ผู้เรียกบอกว่าเงินเข้า (p_money_pending) หรือแถวมี slip_amount > 0
--    reject_notify_pending = true จนกว่าแอปจะ mark ว่าเข้าคิวแจ้งลูกค้าแล้ว (sweep กู้ได้) · บันทึก audit ในทรานแซกชันเดียวกัน
CREATE OR REPLACE FUNCTION public.reject_payment_atomic(
  p_payment_id uuid, p_actor text, p_channel text, p_reason_code text, p_reason_text text, p_money_pending boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay public.payments%ROWTYPE; money boolean; st text; snap jsonb;
BEGIN
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'payment_id_required'; END IF;
  IF p_channel IS NULL OR btrim(p_channel) = '' THEN RAISE EXCEPTION 'channel_required'; END IF;
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF pay.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'status', pay.status, 'lineUserId', pay.line_user_id, 'paymentRef', pay.payment_ref,
      'slipAmount', pay.slip_amount, 'expectedAmount', pay.expected_amount, 'settlementStatus', pay.settlement_status, 'notifyPending', pay.reject_notify_pending,
      'notifySnapshot', pay.reject_notify_snapshot);
  END IF;
  IF pay.status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_paid', 'status', pay.status);
  END IF;
  IF pay.status <> 'pending_verify' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', pay.status);
  END IF;
  money := COALESCE(p_money_pending, false) OR COALESCE(pay.slip_amount, 0) > 0;
  st := CASE WHEN money THEN 'money_pending' ELSE pay.settlement_status END;
  snap := jsonb_build_object('reasonText', left(COALESCE(p_reason_text, p_reason_code, 'admin_reject'), 400), 'reasonCode', p_reason_code, 'moneyPending', money, 'rejectedAt', now());
  UPDATE public.payments
     SET status = 'rejected', rejected_at = now(), reject_reason = left(COALESCE(p_reason_text, p_reason_code, 'admin_reject'), 400),
         approved_by = left(COALESCE(p_actor, 'admin'), 80), updated_at = now(),
         settlement_status = st,
         settlement_note = CASE WHEN money THEN left('ปฏิเสธสิทธิ์ ('||COALESCE(p_reason_code,'-')||') แต่มียอดโอนที่อ่านได้ '||COALESCE(pay.slip_amount::text,'?')||' บาท — รอคืน/โอนเพิ่ม/ตัดจบ โดยคน (ยังไม่พิสูจน์เงินเข้า)', 400) ELSE settlement_note END,
         settlement_updated_at = CASE WHEN money THEN now() ELSE settlement_updated_at END,
         settlement_by = CASE WHEN money THEN left(COALESCE(p_actor,'admin'),80) ELSE settlement_by END,
         reject_notify_pending = (pay.line_user_id IS NOT NULL),
         reject_notify_snapshot = snap
   WHERE id = p_payment_id;
  INSERT INTO public.payment_approval_audit(payment_id, channel, actor, action, result, detail)
  VALUES (p_payment_id, left(p_channel, 40), left(COALESCE(p_actor,'admin'), 80), 'rejected', 'ok',
          jsonb_build_object('reasonCode', p_reason_code, 'moneyPending', money, 'slipAmount', pay.slip_amount, 'expectedAmount', pay.expected_amount));
  RETURN jsonb_build_object('ok', true, 'already', false, 'status', 'rejected', 'lineUserId', pay.line_user_id, 'paymentRef', pay.payment_ref,
    'slipAmount', pay.slip_amount, 'expectedAmount', pay.expected_amount, 'settlementStatus', st, 'notifyPending', (pay.line_user_id IS NOT NULL),
    'notifySnapshot', snap);
END;
$$;

-- 4) งานแจ้งลูกค้าคงทน: แอป enqueue (outbound_messages มี retry/dedupe) แล้ว mark ว่า "เข้าคิวแล้ว" · ถ้า enqueue ล้ม pending คงอยู่ → sweep หยิบซ้ำ
CREATE OR REPLACE FUNCTION public.mark_reject_notify_queued(p_payment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.payments SET reject_notify_pending = false, reject_notify_queued_at = now() WHERE id = p_payment_id AND reject_notify_pending;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n = 1;
END;
$$;
DROP FUNCTION IF EXISTS public.list_reject_notify_pending(integer); -- รอบ 2 คืน 5 คอลัมน์ (ไม่เคย apply staging/Pro) → รอบ 3 เพิ่ม snapshot
CREATE OR REPLACE FUNCTION public.list_reject_notify_pending(p_limit integer DEFAULT 20)
RETURNS TABLE(payment_id uuid, line_user_id text, reject_reason text, settlement_status text, rejected_at timestamptz, reject_notify_snapshot jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.line_user_id, p.reject_reason, p.settlement_status, p.rejected_at, p.reject_notify_snapshot
    FROM public.payments p
   WHERE p.reject_notify_pending AND p.status = 'rejected' AND p.line_user_id IS NOT NULL
     AND p.rejected_at < now() - interval '1 minute'
   ORDER BY p.rejected_at
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
$$;

-- 5) ปิดเรื่องเงินโดยคน: ต้องมีหมายเหตุ/หลักฐาน · เฉพาะจาก money_pending · บันทึก audit · ไม่แตะสิทธิ์
CREATE OR REPLACE FUNCTION public.payment_settlement_resolve(
  p_payment_id uuid, p_status text, p_note text, p_actor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay public.payments%ROWTYPE;
BEGIN
  IF p_status NOT IN ('refunded','topped_up','written_off') THEN RAISE EXCEPTION 'invalid_settlement_status'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 4 THEN RAISE EXCEPTION 'settlement_note_required'; END IF;
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF pay.settlement_status <> 'money_pending' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_money_pending', 'settlementStatus', pay.settlement_status); END IF;
  UPDATE public.payments SET settlement_status = p_status, settlement_note = left(btrim(p_note), 400), settlement_updated_at = now(), settlement_by = left(COALESCE(p_actor,'admin'),80), updated_at = now() WHERE id = p_payment_id;
  INSERT INTO public.payment_approval_audit(payment_id, channel, actor, action, result, detail)
  VALUES (p_payment_id, 'web', left(COALESCE(p_actor,'admin'),80), 'settlement_resolved', 'ok', jsonb_build_object('from', pay.settlement_status, 'to', p_status, 'note', left(btrim(p_note), 200)));
  RETURN jsonb_build_object('ok', true, 'settlementStatus', p_status);
END;
$$;

-- สิทธิ์: RPC เขียน/อ่านงานแจ้ง = payment_ops_writer เท่านั้น (ไม่ให้ web_anon/service_role) · token reject ใช้สิทธิ์เดียวกับ token approve เดิม
REVOKE ALL ON FUNCTION public.issue_telegram_reject_token(text, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_telegram_reject_token(text, uuid, integer, text, text) TO web_anon, service_role, payment_ops_writer;
REVOKE ALL ON FUNCTION public.reject_payment_atomic(uuid, text, text, text, text, boolean) FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON FUNCTION public.payment_settlement_resolve(uuid, text, text, text) FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON FUNCTION public.mark_reject_notify_queued(uuid) FROM PUBLIC, web_anon, service_role;
REVOKE ALL ON FUNCTION public.list_reject_notify_pending(integer) FROM PUBLIC, web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.reject_payment_atomic(uuid, text, text, text, text, boolean) TO payment_ops_writer;
GRANT EXECUTE ON FUNCTION public.payment_settlement_resolve(uuid, text, text, text) TO payment_ops_writer;
GRANT EXECUTE ON FUNCTION public.mark_reject_notify_queued(uuid) TO payment_ops_writer;
GRANT EXECUTE ON FUNCTION public.list_reject_notify_pending(integer) TO payment_ops_writer;
-- ลายเซ็นรอบ 1 (ไม่เคย apply ที่ staging/Pro) ถ้ามีใน DB ทดสอบ → ถอน
DROP FUNCTION IF EXISTS public.reject_payment_atomic(uuid, text, text, text, boolean);
COMMIT;
NOTIFY pgrst, 'reload schema';
