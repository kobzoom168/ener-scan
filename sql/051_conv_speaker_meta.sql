-- persona 2 ชั้น (11 ส.ค. 2026): เก็บว่าข้อความ bot เป็นเสียงใคร (admin/ajarn/consult/system)
-- + บริบท (replyType, source) ให้ chat quality monitor ตรวจแบบ role-based แทนการเดาจากข้อความ
ALTER TABLE line_conversation_messages ADD COLUMN IF NOT EXISTS metadata_json jsonb;

NOTIFY pgrst, 'reload schema';
