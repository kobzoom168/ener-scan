-- Pre-Check "เช็คก่อนเช่า" (กบเคาะ 8 ส.ค. 2026 — แผน ener-object-data-monetize.md รอบ 3)
-- ① ธงบนแถวสแกน: ชิ้นที่เช็คก่อนเช่าไม่ใช่ของลูกค้า — ห้ามปนคลัง/ชุดพก/โพสต์
CREATE OR REPLACE FUNCTION public.ener_mark_precheck(p_token text) RETURNS boolean
LANGUAGE sql AS $$
  UPDATE scan_results_v2
  SET report_payload_json = (report_payload_json::jsonb || '{"precheckMode": true}'::jsonb)::json
  WHERE html_public_token = p_token
  RETURNING true;
$$;
GRANT EXECUTE ON FUNCTION public.ener_mark_precheck(text) TO web_anon, service_role;

-- ② สถิติต่อประเภทวัตถุ (objectForm) — ใช้ตอบ "ของแบบเดียวกันในระบบอยู่ช่วงคะแนนไหน"
--    (สถิติราย "รุ่น" ทำภายหลังเมื่อ tag จากเกตหนาพอ)
CREATE OR REPLACE FUNCTION public.ener_form_stats(p_form text) RETURNS json
LANGUAGE sql STABLE AS $$
  WITH s AS (
    SELECT (report_payload_json->'summary'->>'energyScore')::numeric AS sc
    FROM scan_results_v2
    WHERE report_payload_json->'object'->'objectUnderstanding'->>'objectForm' = p_form
      AND report_payload_json->'summary'->>'energyScore' ~ '^[0-9]+(\.[0-9]+)?$'
      AND COALESCE(report_payload_json->>'precheckMode','') <> 'true'
  )
  SELECT json_build_object(
    'count', (SELECT count(*) FROM s),
    'avg',   (SELECT round(avg(sc), 1) FROM s),
    'p25',   (SELECT round(percentile_cont(0.25) WITHIN GROUP (ORDER BY sc)::numeric, 1) FROM s),
    'p75',   (SELECT round(percentile_cont(0.75) WITHIN GROUP (ORDER BY sc)::numeric, 1) FROM s)
  );
$$;
GRANT EXECUTE ON FUNCTION public.ener_form_stats(text) TO web_anon, service_role;

-- ③ แท็กมาตรฐานชื่อรุ่น/วัด (normalize หลังบ้าน — ฐานของสถิติรายรุ่นในอนาคต)
ALTER TABLE object_owner_info ADD COLUMN IF NOT EXISTS normalized_tag text;
NOTIFY pgrst, 'reload schema';
