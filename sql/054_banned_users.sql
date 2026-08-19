-- 054: ระบบแบน ID (กบ 18 ส.ค. + Codex รีวิว 2 รอบ) — append-only audit ห้ามเขียนทับ
-- ทั้งไฟล์อยู่ใน transaction เดียว: constraint swap ล้มกลางทาง = rollback ทั้งชุด
BEGIN;

CREATE TABLE IF NOT EXISTS banned_users (
  id bigserial PRIMARY KEY,
  line_user_id text NOT NULL,
  reason text,
  source text NOT NULL DEFAULT 'manual',
  banned_by text NOT NULL,
  banned_at timestamptz NOT NULL DEFAULT now(),
  unbanned_by text,
  unbanned_at timestamptz,
  unban_reason text
);
-- active ban ได้ทีละหนึ่งแถวต่อคน (unbanned_at IS NULL = active)
CREATE UNIQUE INDEX IF NOT EXISTS idx_banned_users_active
  ON banned_users (line_user_id) WHERE unbanned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_banned_users_uid ON banned_users (line_user_id);

-- append-only enforce (Codex รอบ 4): GRANT เป็น additive — ต้อง REVOKE ALL ก่อน
-- ไม่งั้น table-level UPDATE จากรุ่นก่อน/bulk-grant ยังค้าง แล้วค่อย grant กลับ
-- เฉพาะ SELECT, INSERT และ UPDATE สามคอลัมน์ unban
REVOKE ALL PRIVILEGES ON banned_users FROM web_anon;
REVOKE ALL PRIVILEGES ON banned_users FROM service_role;
GRANT SELECT, INSERT ON banned_users TO web_anon;
GRANT UPDATE (unbanned_by, unbanned_at, unban_reason) ON banned_users TO web_anon;
GRANT USAGE, SELECT ON SEQUENCE banned_users_id_seq TO web_anon;
GRANT SELECT, INSERT ON banned_users TO service_role;
GRANT UPDATE (unbanned_by, unbanned_at, unban_reason) ON banned_users TO service_role;
GRANT USAGE, SELECT ON SEQUENCE banned_users_id_seq TO service_role;

-- smoke (Codex รอบ 4): apply ซ้ำแล้วต้องไม่มี table-level UPDATE/DELETE/TRUNCATE ค้าง
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(grantee || ':' || privilege_type, ', ') INTO bad
  FROM information_schema.table_privileges
  WHERE table_name = 'banned_users'
    AND grantee IN ('web_anon', 'service_role')
    AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'banned_users ยังมีสิทธิ์ระดับตารางเกิน append-only: %', bad;
  END IF;
END $$;

-- preflight (Codex): มี status แปลกนอกลิสต์ใหม่ → ยกเลิกทั้ง transaction
-- ก่อน drop constraint เดิม กัน ADD CHECK ล้มแล้วตารางเหลือแบบไร้ constraint
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT status, ', ') INTO bad
  FROM outbound_messages
  WHERE status NOT IN ('queued', 'sending', 'sent', 'retry_wait', 'failed', 'dead', 'suppressed_banned');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected outbound_messages.status values: % — แก้ข้อมูลก่อนรัน 054', bad;
  END IF;
END $$;

-- delivery gate ต้อง mark งานที่โดนแบนแบบแยกชนิด (Codex: suppressed_banned)
ALTER TABLE outbound_messages DROP CONSTRAINT IF EXISTS outbound_messages_status_check;
ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_status_check
  CHECK (status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'retry_wait'::text, 'failed'::text, 'dead'::text, 'suppressed_banned'::text]));

COMMIT;

NOTIFY pgrst, 'reload schema';
