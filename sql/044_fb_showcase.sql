-- 044: Auto post Facebook "อวดพระขึ้นเพจ" (กบ 22 ก.ค. 2026)
-- 1) kind ใหม่ fb_consent_ask — ข้อความขออนุญาตลูกค้าหลังส่ง report คะแนนสูง
-- 2) ตารางคิวโพสต์ fb_showcase_queue — ชิ้นที่ได้ consent แล้ว (หรือจากคลังกบ) รอโพสต์ขึ้นเพจ

ALTER TABLE outbound_messages DROP CONSTRAINT IF EXISTS outbound_messages_kind_check;
ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_kind_check CHECK (
  kind = ANY (
    ARRAY[
      'pre_scan_ack'::text,
      'scan_result'::text,
      'approve_notify'::text,
      'reject_notify'::text,
      'payment_qr'::text,
      'pending_intro'::text,
      'slip_received'::text,
      'renewal_reminder'::text,
      'daily_pick_push'::text,
      'fb_consent_ask'::text
    ]
  )
);

CREATE TABLE IF NOT EXISTS public.fb_showcase_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL,
  public_token text NOT NULL,
  source text NOT NULL DEFAULT 'customer',      -- customer (ลูกค้ากดยินดี) | library (คลังกบ)
  status text NOT NULL DEFAULT 'queued',        -- queued | posted | failed | skipped
  caption text,
  fb_post_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  CONSTRAINT uq_fb_showcase_queue_token UNIQUE (public_token)
);

CREATE INDEX IF NOT EXISTS idx_fb_showcase_queue_status
  ON public.fb_showcase_queue (status, created_at);

COMMENT ON TABLE public.fb_showcase_queue IS 'คิวโพสต์การ์ดอวดพระขึ้นเพจ Facebook (ต้องมี consent จากลูกค้า หรือเป็นชิ้นจากคลังเจ้าของระบบเท่านั้น)';

-- PostgREST เข้าตารางผ่าน role web_anon (JWT) / service_role — ตารางใหม่ต้อง grant เอง
GRANT SELECT, INSERT, UPDATE ON public.fb_showcase_queue TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.fb_showcase_queue TO web_anon;
