-- 045: ระบบชวนเพื่อน (กบเคาะ 23 ก.ค. 2026)
-- โค้ดส่วนตัวต่อคน → เพื่อนใหม่พิมพ์โค้ด → ฟรี +1 ทั้งคู่ (ผ่าน bonus_scans —
-- เส้นทางฟรีล้วน ไม่แตะ paid_until/payments → ไม่ปลดเซ็นเซอร์)

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS bonus_scans integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN app_users.bonus_scans IS 'สิทธิ์สแกนโบนัส (จากชวนเพื่อน) — ใช้เมื่อฟรีรายวันหมด ไม่ใช่สถานะจ่ายเงิน';

CREATE TABLE IF NOT EXISTS public.referral_codes (
  code text PRIMARY KEY,                 -- ENER-XXXX
  line_user_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  referrer_line_user_id text NOT NULL,
  friend_line_user_id text NOT NULL UNIQUE,  -- 1 บัญชีรับได้ครั้งเดียวตลอดชีพ
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referrer
  ON public.referral_redemptions (referrer_line_user_id, created_at);

GRANT SELECT, INSERT ON public.referral_codes TO service_role;
GRANT SELECT, INSERT ON public.referral_codes TO web_anon;
GRANT SELECT, INSERT ON public.referral_redemptions TO service_role;
GRANT SELECT, INSERT ON public.referral_redemptions TO web_anon;
