-- สถิติคะแนนรวมทั้งระบบ (กบ 4 ส.ค. 2026 — เคส 7Kendo ลูกค้าถาม "ของคนอื่นแรงสุดเท่าไหร่")
-- ให้ consult ตอบด้วยตัวเลขจริง: แรงสุด/มีกี่ชิ้น/กี่คน/เกรด S เจอหรือยัง
CREATE OR REPLACE FUNCTION public.ener_score_stats() RETURNS json
LANGUAGE sql STABLE AS $$
  WITH s AS (
    SELECT (report_payload_json->'summary'->>'energyScore')::numeric AS sc,
           line_user_id
    FROM scan_results_v2
    WHERE report_payload_json->'summary'->>'energyScore' ~ '^[0-9]+(\.[0-9]+)?$'
  )
  SELECT json_build_object(
    'total',       (SELECT count(*) FROM s),
    'max',         (SELECT max(sc) FROM s),
    'cntAtMax',    (SELECT count(*) FROM s WHERE sc = (SELECT max(sc) FROM s)),
    'ownersAtMax', (SELECT count(DISTINCT line_user_id) FROM s WHERE sc = (SELECT max(sc) FROM s)),
    'cnt85',       (SELECT count(*) FROM s WHERE sc >= 8.5),
    'cnt89',       (SELECT count(*) FROM s WHERE sc >= 8.9)
  );
$$;
GRANT EXECUTE ON FUNCTION public.ener_score_stats() TO web_anon, service_role;
NOTIFY pgrst, 'reload schema';
