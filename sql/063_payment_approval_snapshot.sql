-- 063: mandatory payment calculation snapshot; truthful notification stamping.
-- Apply after 062, before updated application code. No customer backfill.
-- The old overload is removed intentionally: old callers cannot bypass CAS.
BEGIN;
DROP FUNCTION IF EXISTS public.approve_payment_and_grant(uuid,text,text,text,numeric,text,integer,timestamptz,boolean);
CREATE OR REPLACE FUNCTION public.approve_payment_and_grant(
  p_payment_id          uuid,
  p_channel             text,
  p_actor               text,
  p_expect_package_code text,
  p_expect_amount       numeric,
  p_plan_code           text,
  p_scans               integer,
  p_paid_until          timestamptz,
  p_is_top_package      boolean,
  p_calculation_snapshot jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pay     public.payments%ROWTYPE;
  usr     public.app_users%ROWTYPE;
  g       public.payment_entitlement_grants%ROWTYPE;
  carry   integer := 0;
  total   integer;
BEGIN
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'payment_id_required'; END IF;
  IF p_channel IS NULL OR btrim(p_channel) = '' THEN RAISE EXCEPTION 'channel_required'; END IF;
  IF p_plan_code IS NULL OR p_scans IS NULL OR p_paid_until IS NULL THEN
    RAISE EXCEPTION 'entitlement_params_required';
  END IF;

  -- 1) ล็อกใบชำระเงิน
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found'); END IF;

  -- เคยเติมไปแล้ว → คืนของเดิม ไม่คำนวณใหม่ ไม่เติมใหม่
  SELECT * INTO g FROM public.payment_entitlement_grants WHERE payment_id = p_payment_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'alreadyGranted', true,
      'lineUserId', g.line_user_id, 'paidPlanCode', g.paid_plan_code,
      'paidUntil', g.paid_until, 'scansAdded', g.scans_added, 'carryOver', g.carry_over);
  END IF;

  -- paid แต่ไม่มี grant = แถวเก่าก่อนระบบนี้ → **ห้ามเดาว่าเติมแล้วหรือยัง**
  IF pay.status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'legacy_unverified');
  END IF;
  IF pay.status <> 'pending_verify' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', pay.status);
  END IF;

  -- 2) ตรวจ expect ณ จุด commit จริง (ไม่ใช่ตรวจใน handler แล้วอ่านใหม่)
  IF p_expect_package_code IS NOT NULL
     AND COALESCE(pay.package_code, '') IS DISTINCT FROM p_expect_package_code THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_package',
      'currentPackageCode', pay.package_code);
  END IF;
  IF p_expect_amount IS NOT NULL
     AND COALESCE(pay.expected_amount, -1)::numeric IS DISTINCT FROM p_expect_amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_amount',
      'currentAmount', pay.expected_amount);
  END IF;

  -- Mandatory null-safe check of ALL inputs used by JS to calculate this grant.
  -- Runs under the payment row lock. Missing/old clients fail closed.
  IF p_calculation_snapshot IS DISTINCT FROM jsonb_build_object(
      'package_code', pay.package_code, 'expected_amount', pay.expected_amount,
      'unlock_hours', pay.unlock_hours, 'user_id', pay.user_id,
      'line_user_id', pay.line_user_id, 'status', pay.status) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_calculation');
  END IF;

  -- 3) ล็อกบัญชีผู้ใช้ก่อนอ่านยอด (กันเขียนทับยอดที่ถูกหักจากการสแกนพร้อมกัน)
  SELECT * INTO usr FROM public.app_users WHERE id = pay.user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'app_user_not_found'); END IF;

  -- 4) carry-over: กติกาเดิมเป๊ะ (แพ็กใหญ่สุด + ยังไม่หมดอายุ + คนละ plan + เหลือ>0 และ <900000)
  IF COALESCE(p_is_top_package, false) AND p_scans < 900000
     AND usr.paid_until IS NOT NULL AND usr.paid_until > now()
     AND COALESCE(usr.paid_plan_code, '') IS DISTINCT FROM p_plan_code
     AND COALESCE(usr.paid_remaining_scans, 0) > 0
     AND COALESCE(usr.paid_remaining_scans, 0) < 900000 THEN
    carry := COALESCE(usr.paid_remaining_scans, 0);
  END IF;
  total := p_scans + carry;

  -- 5) เติมสิทธิ์
  UPDATE public.app_users
     SET paid_until = p_paid_until,
         paid_remaining_scans = total,
         paid_plan_code = p_plan_code,
         updated_at = now()
   WHERE id = usr.id;

  -- 6) หลักฐานการเติม + กันเติมซ้ำถาวร (ชน PK = abort ทั้ง transaction)
  INSERT INTO public.payment_entitlement_grants(
      payment_id, app_user_id, line_user_id, paid_plan_code,
      scans_added, carry_over, paid_until, channel, actor)
  VALUES (p_payment_id, usr.id, pay.line_user_id, p_plan_code,
          p_scans, carry, p_paid_until, p_channel, p_actor);

  -- 7) เปลี่ยนสถานะใบชำระเงิน
  UPDATE public.payments
     SET status = 'paid', verified_at = now(), approved_by = p_actor, updated_at = now()
   WHERE id = p_payment_id;

  -- 8) audit ถาวร อยู่ใน transaction เดียวกับการอนุมัติ
  INSERT INTO public.payment_approval_audit(payment_id, channel, actor, action, result, detail)
  VALUES (p_payment_id, p_channel, p_actor, 'approve_confirmed', 'ok',
          jsonb_build_object('planCode', p_plan_code, 'scansAdded', p_scans,
                             'carryOver', carry, 'paidUntil', p_paid_until));

  RETURN jsonb_build_object('ok', true, 'alreadyGranted', false,
    'lineUserId', pay.line_user_id, 'paidPlanCode', p_plan_code,
    'paidUntil', p_paid_until, 'scansAdded', p_scans, 'carryOver', carry,
    'paidRemainingScans', total);
END;
$$;


REVOKE ALL ON FUNCTION public.approve_payment_and_grant(uuid,text,text,text,numeric,text,integer,timestamptz,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_payment_and_grant(uuid,text,text,text,numeric,text,integer,timestamptz,boolean,jsonb) TO web_anon, service_role;

CREATE OR REPLACE FUNCTION public.mark_payment_grant_notified(p_payment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- A duplicate-key exception alone is not evidence for this payment's outbox.
  IF NOT EXISTS (SELECT 1 FROM public.outbound_messages
      WHERE related_payment_id = p_payment_id AND kind = 'approve_notify') THEN
    RETURN false;
  END IF;
  UPDATE public.payment_entitlement_grants
     SET notified_at = COALESCE(notified_at, now())
   WHERE payment_id = p_payment_id;
  RETURN FOUND; -- already stamped is an idempotent success
END;
$$;
REVOKE ALL ON FUNCTION public.mark_payment_grant_notified(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_payment_grant_notified(uuid) TO web_anon, service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';

