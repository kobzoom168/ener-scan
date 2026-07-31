-- Synergy "จัดชุดพลัง" (กบเคาะ 31 ก.ค. 2026): token ถาวรต่อลูกค้าสำหรับหน้า /synergy/:token
-- ใช้คอลัมน์บน app_users (ตารางมี GRANT ให้ web_anon/service_role อยู่แล้ว)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS synergy_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_synergy_token
  ON app_users (synergy_token) WHERE synergy_token IS NOT NULL;
NOTIFY pgrst, 'reload schema';
