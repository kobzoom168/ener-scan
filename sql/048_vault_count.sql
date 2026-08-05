-- นับชิ้นไม่ซ้ำจริงทั้งคลังสำหรับหน้าจัดชุด (กบ 5 ส.ค. — "ในคลังมีเกิน 26 ทำไมบอก 26")
-- เดิมนับจาก 120 แถวล่าสุด + กุญแจ ชื่อพลัง|คะแนนรวม ทำให้พระผง 5 องค์ "คุ้มครอง 68" ยุบเหลือ 1
-- identity = คะแนนรวม + คะแนนแกนทั้งชุด (วัตถุเดิมสแกนซ้ำ = คะแนนเดิมเสมอ จึงยุบถูกตัว)
CREATE OR REPLACE FUNCTION public.ener_vault_unique_count(p_uid text) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT count(DISTINCT
      COALESCE(report_payload_json->'summary'->>'energyScore','') || '|' ||
      COALESCE(report_payload_json->'amuletV1'->>'powerCategories','') || '|' ||
      COALESCE(report_payload_json->'crystalBraceletV1'->>'axes',''))::int
  FROM scan_results_v2
  WHERE line_user_id = p_uid
    AND (report_payload_json->'amuletV1' IS NOT NULL OR report_payload_json->'crystalBraceletV1' IS NOT NULL)
    AND COALESCE(report_payload_json->'object'->>'objectType','') <> 'พระบูชา'
    AND COALESCE(report_payload_json->'object'->'objectUnderstanding'->'usageProfile'->>'canCarry','true') <> 'false'
$$;
GRANT EXECUTE ON FUNCTION public.ener_vault_unique_count(text) TO web_anon, service_role;
NOTIFY pgrst, 'reload schema';
