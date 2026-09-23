-- 062: อนุมัติ + เติมสิทธิ์ + audit เป็น transaction เดียว (กบเคาะ 23 ก.ย. 2026)
--
-- ปัญหาเดิม: markPaymentApprovedAndUnlock เขียน payments.status='paid' ก่อน แล้วค่อยเติมสิทธิ์
-- เป็นคนละ statement ไม่มี transaction → ล้มกลางทาง = จ่ายแล้วไม่ได้สิทธิ์ และ retry จะเห็น
-- 'paid' แล้ว early-return โดยไม่เติมให้ → เสียถาวร
--
-- แก้: ทำทุกอย่างใน transaction เดียว พร้อม row lock และ unique grant ต่อ payment
--   1) lock payments  2) ตรวจ expect (ยอด/แพ็ก) ณ จุด commit จริง  3) lock app_users
--   4) คำนวณ carry-over ใต้ล็อก (กติกาเดิมทุกประการ)  5) เติมสิทธิ์
--   6) INSERT grant (PK=payment_id กันเติมซ้ำตลอดกาล)  7) set paid  8) audit
-- ล้มตรงไหน rollback ทั้งหมด → payment ยังเป็น pending_verify กดใหม่ได้
--
-- **ไม่ backfill อะไรทั้งสิ้น**: แถว paid เดิมไม่มี grant row = legacy/ยังไม่ยืนยันหลักฐาน
-- ฟังก์ชันจะคืน 'legacy_unverified' และ **ไม่เติมย้อนหลัง** · sweeper ก็ไม่แตะ
--
-- idempotent · additive ล้วน
BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_entitlement_grants (
  payment_id       uuid PRIMARY KEY,               -- 1 payment = เติมได้ครั้งเดียวตลอดกาล
  app_user_id      uuid NOT NULL,
  line_user_id     text,
  granted_at       timestamptz NOT NULL DEFAULT now(),
  paid_plan_code   text NOT NULL,
  scans_added      integer NOT NULL,               -- จำนวนของแพ็ก (ไม่รวม carry-over)
  carry_over       integer NOT NULL DEFAULT 0,
  paid_until       timestamptz NOT NULL,
  channel          text NOT NULL,
  actor            text,
  -- notified_at = "สร้างงานแจ้งลูกค้าสำเร็จแล้ว" **ไม่ใช่ "ส่งถึงลูกค้าแล้ว"**
  -- การส่งจริงและการ retry เป็นหน้าที่ของคิว outbound_messages
  notified_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_payment_grants_pending_notify
  ON public.payment_entitlement_grants(granted_at) WHERE notified_at IS NULL;

-- กันงานแจ้งลูกค้าซ้ำที่ชั้น DB (เดิมใช้ SELECT-ก่อน-INSERT อย่างเดียว race ลอดได้)
-- เฉพาะแถวที่มี related_payment_id — ของเก่าที่เป็น NULL ไม่ถูกแตะ
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_approve_notify_per_payment
  ON public.outbound_messages (related_payment_id)
  WHERE kind = 'approve_notify' AND related_payment_id IS NOT NULL;

/**
 * อนุมัติและเติมสิทธิ์แบบ atomic
 * พารามิเตอร์ของแพ็ก (plan/scans/paid_until/is_top) คำนวณฝั่ง JS แบบ read-only แล้วส่งเข้ามา
 * ส่วน carry-over คำนวณ **ที่นี่ ใต้ row lock** เพื่อไม่ให้ทับยอดที่ถูกหักจากการสแกนพร้อมกัน
 */
CREATE OR REPLACE FUNCTION public.approve_payment_and_grant(
  p_payment_id          uuid,
  p_channel             text,
  p_actor               text,
  p_expect_package_code text,
  p_expect_amount       numeric,
  p_plan_code           text,
  p_scans               integer,
  p_paid_until          timestamptz,
  p_is_top_package      boolean
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

/** stamp ว่า "สร้างงานแจ้งลูกค้าแล้ว" — ไม่ได้แปลว่าส่งถึงลูกค้าแล้ว */
CREATE OR REPLACE FUNCTION public.mark_payment_grant_notified(p_payment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.payment_entitlement_grants
     SET notified_at = now()
   WHERE payment_id = p_payment_id AND notified_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;

/** grant ที่ยังไม่ได้สร้างงานแจ้งลูกค้า (legacy ไม่มี grant row จึงไม่มีวันถูกหยิบ) */
CREATE OR REPLACE FUNCTION public.list_payment_grants_pending_notify(p_limit integer DEFAULT 20)
RETURNS TABLE(payment_id uuid, line_user_id text, paid_plan_code text,
              paid_until timestamptz, scans_added integer, carry_over integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.payment_id, g.line_user_id, g.paid_plan_code, g.paid_until, g.scans_added, g.carry_over
    FROM public.payment_entitlement_grants g
   WHERE g.notified_at IS NULL
     AND g.granted_at < now() - interval '2 minutes'
     AND g.line_user_id IS NOT NULL
   ORDER BY g.granted_at
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
$$;

REVOKE ALL ON TABLE public.payment_entitlement_grants FROM PUBLIC, web_anon;
GRANT SELECT ON TABLE public.payment_entitlement_grants TO service_role;
REVOKE ALL ON FUNCTION public.approve_payment_and_grant(uuid,text,text,text,numeric,text,integer,timestamptz,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_payment_grant_notified(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_payment_grants_pending_notify(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_payment_and_grant(uuid,text,text,text,numeric,text,integer,timestamptz,boolean) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_payment_grant_notified(uuid) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_payment_grants_pending_notify(integer) TO web_anon, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
