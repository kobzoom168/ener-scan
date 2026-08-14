-- 052: token ลับต่อคนสำหรับหน้าเว็บส่วนตัว (เริ่มที่ /myscans — กบเคาะ 14 ส.ค. 2569)
-- ความปลอดภัย (Codex): เก็บเฉพาะ sha256 hash ของ token (hash-at-rest) ไม่เก็บ token ดิบ
-- รองรับ rotate/revoke ผ่าน revoked_at โดยไม่ลบแถว (audit ได้)
CREATE TABLE IF NOT EXISTS user_page_tokens (
  id bigserial PRIMARY KEY,
  line_user_id text NOT NULL,
  purpose text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_page_tokens_uid_purpose
  ON user_page_tokens (line_user_id, purpose);
