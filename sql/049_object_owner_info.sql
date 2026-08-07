-- เกตเก็บข้อมูลชิ้นจากเจ้าของ (กบเคาะ 7 ส.ค. 2026 — แผน docs/ai/plans/ener-object-info-gate.md)
-- เจ้าของแจ้งเอง ระบบไม่ฟันธง: ทุกจุดแสดงผลต้องติดป้าย "เจ้าของแจ้ง" · คะแนนไม่ผูกรุ่นเด็ดขาด
CREATE TABLE IF NOT EXISTS object_owner_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL,
  scan_result_id text,
  object_key text NOT NULL,           -- ลายคะแนนชิ้น (energyScore|axes md5) — ชิ้นเดิมไม่ถามซ้ำ
  lane text,                          -- amulet / bracelet / อื่น ๆ
  raw_text text,                      -- ข้อความดิบที่ลูกค้าพิมพ์ (เก็บเสมอ)
  object_name text,                   -- ชื่อพิมพ์/ชนิด (LLM แยก)
  temple text,
  era_year text,
  stone_type text,
  purpose text,                       -- พกเพื่ออะไร (ปุ่มหลังส่งผล)
  origin_story text,                  -- ได้มาจากไหน/เรื่องเล่า (เฟสถัดไป)
  parse_confidence numeric,
  conflict_flag boolean NOT NULL DEFAULT false,  -- คำตอบขัดกับที่ตัวจำแนกเห็น — เก็บไว้ ไม่เถียง ไม่เข้าสถิติ
  unknown boolean NOT NULL DEFAULT false,        -- กด "ไม่ทราบ"
  skipped boolean NOT NULL DEFAULT false,        -- ลูกค้าจ่ายกด "ข้ามก่อน"
  source text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_object_owner_info_user_key ON object_owner_info (line_user_id, object_key);
GRANT SELECT, INSERT, UPDATE ON object_owner_info TO web_anon, service_role;
NOTIFY pgrst, 'reload schema';
