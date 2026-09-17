-- 058: ย้าย "ปิดแจ้งเตือนหนุนดวง" จาก Redis TTL มาเก็บถาวรใน DB
-- เหตุ (16 ก.ย. 2026): setValueWithTtl cap TTL ที่ 604800 วิ = 7 วัน แต่ optout ขอ 400 วัน
-- → ลูกค้ากดปิด ระบบตอบ "ปิดให้แล้ว" แล้วการปิดหมดอายุเองใน 7 วัน แจ้งเตือนกลับมาอีก
-- ตารางนี้เก็บ "ความต้องการของลูกค้า" จึงต้องไม่มีวันหมดอายุ
BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  line_user_id text PRIMARY KEY,
  daily_pick_optout_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notification_preferences IS
  'ความต้องการรับแจ้งเตือนอัตโนมัติต่อผู้ใช้ — เก็บถาวร ไม่มีวันหมดอายุเอง (แจ้งเตือนธุรกรรมไม่เกี่ยวกับตารางนี้)';

-- ตั้ง/ยกเลิกการปิดแจ้งเตือนหนุนดวง · คืนสถานะที่บันทึกจริงเพื่อให้ผู้เรียกยืนยันได้
CREATE OR REPLACE FUNCTION public.set_daily_pick_optout(p_line_user_id text, p_opted_out boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v timestamptz;
BEGIN
  IF p_line_user_id IS NULL OR btrim(p_line_user_id) = '' THEN
    RAISE EXCEPTION 'line_user_id_required';
  END IF;
  IF p_opted_out IS NULL THEN RAISE EXCEPTION 'opted_out_required'; END IF;
  v := CASE WHEN p_opted_out THEN now() ELSE NULL END;
  INSERT INTO public.notification_preferences(line_user_id, daily_pick_optout_at, updated_at)
  VALUES (btrim(p_line_user_id), v, now())
  ON CONFLICT (line_user_id) DO UPDATE
    SET daily_pick_optout_at = EXCLUDED.daily_pick_optout_at, updated_at = now();
  -- อ่านกลับจากแถวที่บันทึกจริง (ไม่ใช่คืนค่าที่ส่งเข้ามา) เพื่อให้ยืนยันได้ว่าเขียนสำเร็จ
  SELECT daily_pick_optout_at INTO v FROM public.notification_preferences
   WHERE line_user_id = btrim(p_line_user_id);
  RETURN v IS NOT NULL;
END;
$$;

-- คืน tri-state: known = มีแถวใน DB แล้วหรือยัง · optedOut = ปิดอยู่ไหม
-- ต้องแยกให้ได้ เพราะ "ยังไม่มีแถว" ห้ามตีความว่า "เปิดรับแจ้งเตือน"
-- (อาจมีค่าเดิมค้างใน Redis จากก่อน migration)
CREATE OR REPLACE FUNCTION public.get_daily_pick_optout(p_line_user_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'known', EXISTS (SELECT 1 FROM public.notification_preferences
                     WHERE line_user_id = btrim(p_line_user_id)),
    'optedOut', EXISTS (SELECT 1 FROM public.notification_preferences
                        WHERE line_user_id = btrim(p_line_user_id)
                          AND daily_pick_optout_at IS NOT NULL)
  );
$$;

REVOKE ALL ON TABLE public.notification_preferences FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_preferences FROM web_anon;
REVOKE ALL ON TABLE public.notification_preferences FROM service_role;
GRANT SELECT ON public.notification_preferences TO web_anon, service_role;
REVOKE ALL ON FUNCTION public.set_daily_pick_optout(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_daily_pick_optout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_daily_pick_optout(text, boolean) TO web_anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_pick_optout(text) TO web_anon, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
