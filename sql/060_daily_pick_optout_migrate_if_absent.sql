-- 060: ย้ายค่า optout เดิมจาก Redis เข้า DB แบบ atomic insert-if-absent
--
-- ปัญหาเดิม (Codex 18 ก.ย. 2026): migration ใช้ set_daily_pick_optout ซึ่งเป็น upsert
-- แบบ overwrite → ถ้าลูกค้าสั่ง "เปิดแจ้งเตือน" ระหว่างที่ migration กำลังทำงาน
-- (อ่านว่า DB ไม่มีแถว → ลูกค้าสร้างแถวเปิดคืน → migration เขียนทับเป็นปิด)
-- ความต้องการล่าสุดของลูกค้าจะหาย
--
-- แก้: INSERT ... ON CONFLICT DO NOTHING แล้ว **อ่านค่าที่ชนะจริง** กลับไป
-- migration จึงไม่มีทางทับ preference ที่มีอยู่แล้ว ไม่ว่าจะเป็นปิดหรือเปิด
--
-- idempotent · ไม่ backfill
BEGIN;

CREATE OR REPLACE FUNCTION public.migrate_daily_pick_optout_if_absent(p_line_user_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid text; inserted boolean := false; v timestamptz; found boolean;
BEGIN
  uid := btrim(COALESCE(p_line_user_id, ''));
  IF uid = '' THEN RAISE EXCEPTION 'line_user_id_required'; END IF;

  INSERT INTO public.notification_preferences(line_user_id, daily_pick_optout_at, updated_at)
  VALUES (uid, now(), now())
  ON CONFLICT (line_user_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;

  -- อ่านค่าที่ชนะจริงเสมอ — ถ้ามีแถวอยู่ก่อน (เช่นลูกค้าเพิ่งสั่งเปิดคืน) ค่านั้นคือค่าที่ใช้
  SELECT daily_pick_optout_at, true INTO v, found
    FROM public.notification_preferences WHERE line_user_id = uid;

  RETURN jsonb_build_object(
    'known',    COALESCE(found, false),
    'optedOut', v IS NOT NULL,
    'migrated', inserted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.migrate_daily_pick_optout_if_absent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migrate_daily_pick_optout_if_absent(text) TO web_anon, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
