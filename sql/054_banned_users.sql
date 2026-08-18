-- 054: ระบบแบน ID (กบ 18 ส.ค. + Codex รีวิว) — append-only audit ห้ามเขียนทับ
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

GRANT SELECT, INSERT, UPDATE ON banned_users TO web_anon;
GRANT USAGE, SELECT ON SEQUENCE banned_users_id_seq TO web_anon;
GRANT SELECT, INSERT, UPDATE ON banned_users TO service_role;
GRANT USAGE, SELECT ON SEQUENCE banned_users_id_seq TO service_role;
NOTIFY pgrst, 'reload schema';

-- delivery gate ต้อง mark งานที่โดนแบนแบบแยกชนิด (Codex: suppressed_banned)
ALTER TABLE outbound_messages DROP CONSTRAINT IF EXISTS outbound_messages_status_check;
ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_status_check
  CHECK (status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'retry_wait'::text, 'failed'::text, 'dead'::text, 'suppressed_banned'::text]));
