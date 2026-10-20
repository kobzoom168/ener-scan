-- 069: ปุ่ม "ไม่อนุมัติ" ใน Telegram (2 ขั้น) + ปฏิเสธแบบ atomic กันชนอนุมัติ + แยก "เงินรอดำเนินการ" ออกจาก "ไม่อนุมัติสิทธิ์" (กบ/Codex 20 ต.ค. 2026)
-- idempotent · additive · rollback ห้าม DROP (คงคอลัมน์/ตารางไว้)
BEGIN;

-- 1) token ขั้นยืนยัน "ไม่อนุมัติ" (kind ใหม่ + เหตุผล) — ใช้ครั้งเดียว/หมดอายุเหมือน confirm
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

-- consume: คืน kind + reject_reason_code ด้วย (ปุ่มอนุมัติ/ไม่อนุมัติใช้สลับกันไม่ได้ — ผู้เรียกต้องตรวจ kind)
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

-- 2) "เงินรอดำเนินการ" แยกจากสถานะสิทธิ์: ไม่อนุมัติสิทธิ์ ≠ จัดการเงินเสร็จ
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'none';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS settlement_note text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS settlement_updated_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS settlement_by text;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_settlement_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_settlement_status_check
  CHECK (settlement_status IN ('none','money_pending','refunded','topped_up','written_off'));
CREATE INDEX IF NOT EXISTS idx_payments_settlement_money_pending ON public.payments (settlement_updated_at) WHERE settlement_status = 'money_pending';

-- 3) ปฏิเสธแบบ atomic: ล็อกแถว · pending_verify เท่านั้น · paid แล้ว = ไม่แตะ · rejected แล้ว = idempotent · ไม่แตะสิทธิ์ผู้ใช้
--    p_money_pending = มียอดเงินที่อ่านได้/รับแล้ว (ยังไม่พิสูจน์ว่าคืน) → settlement_status='money_pending' เพื่อไม่ให้เรื่องเงินถูกปิดไปพร้อมสิทธิ์
CREATE OR REPLACE FUNCTION public.reject_payment_atomic(
  p_payment_id uuid, p_actor text, p_reason_code text, p_reason_text text, p_money_pending boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay public.payments%ROWTYPE;
BEGIN
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'payment_id_required'; END IF;
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF pay.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'status', pay.status, 'lineUserId', pay.line_user_id, 'paymentRef', pay.payment_ref, 'settlementStatus', pay.settlement_status);
  END IF;
  IF pay.status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_paid', 'status', pay.status);
  END IF;
  IF pay.status <> 'pending_verify' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', pay.status);
  END IF;
  UPDATE public.payments
     SET status = 'rejected', rejected_at = now(), reject_reason = left(COALESCE(p_reason_text, p_reason_code, 'admin_reject'), 400),
         approved_by = left(COALESCE(p_actor, 'admin'), 80), updated_at = now(),
         settlement_status = CASE WHEN COALESCE(p_money_pending, false) THEN 'money_pending' ELSE settlement_status END,
         settlement_note = CASE WHEN COALESCE(p_money_pending, false) THEN left('ปฏิเสธสิทธิ์ ('||COALESCE(p_reason_code,'-')||') แต่มียอดโอนที่อ่านได้ '||COALESCE(pay.slip_amount::text,'?')||' บาท — รอคืน/โอนเพิ่ม/ตัดจบ โดยคน', 400) ELSE settlement_note END,
         settlement_updated_at = CASE WHEN COALESCE(p_money_pending, false) THEN now() ELSE settlement_updated_at END,
         settlement_by = CASE WHEN COALESCE(p_money_pending, false) THEN left(COALESCE(p_actor,'admin'),80) ELSE settlement_by END
   WHERE id = p_payment_id;
  RETURN jsonb_build_object('ok', true, 'already', false, 'status', 'rejected', 'lineUserId', pay.line_user_id, 'paymentRef', pay.payment_ref,
    'slipAmount', pay.slip_amount, 'expectedAmount', pay.expected_amount, 'settlementStatus', CASE WHEN COALESCE(p_money_pending,false) THEN 'money_pending' ELSE pay.settlement_status END);
END;
$$;

-- 4) ปิดเรื่องเงินโดยคน (หน้า Admin): ต้องมีหมายเหตุ/หลักฐาน · เปลี่ยนได้เฉพาะจาก money_pending · ไม่แตะสิทธิ์
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
  RETURN jsonb_build_object('ok', true, 'settlementStatus', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_telegram_reject_token(text, uuid, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_payment_atomic(uuid, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_settlement_resolve(uuid, text, text, text) FROM PUBLIC;
-- สิทธิ์เท่าเส้นอนุมัติเดิม (issue/consume/approve ใช้ web_anon อยู่แล้ว — ทบทวนรวมเป็นงานแยก)
GRANT EXECUTE ON FUNCTION public.issue_telegram_reject_token(text, uuid, integer, text, text) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.reject_payment_atomic(uuid, text, text, text, boolean) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.payment_settlement_resolve(uuid, text, text, text) TO web_anon, service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
