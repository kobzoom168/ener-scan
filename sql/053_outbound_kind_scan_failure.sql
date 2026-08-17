-- 053: scanJobFailureNotify enqueue kind "scan_failure_notify" มาตลอด แต่ constraint
-- ไม่รู้จัก → insert ล้มเงียบ ลูกค้าไม่เคยได้ข้อความ "สแกนขัดข้อง ส่งใหม่" (เจอจริง 17 ส.ค. 2569:
-- OpenRouter เครดิตหมด สแกนล้ม 5 งาน ลูกค้ารอเงียบ ๆ 3 ชม.)
ALTER TABLE outbound_messages DROP CONSTRAINT IF EXISTS outbound_messages_kind_check;
ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_kind_check
  CHECK (kind = ANY (ARRAY[
    'pre_scan_ack'::text, 'scan_result'::text, 'approve_notify'::text,
    'reject_notify'::text, 'payment_qr'::text, 'pending_intro'::text,
    'slip_received'::text, 'renewal_reminder'::text, 'daily_pick_push'::text,
    'fb_consent_ask'::text, 'scan_failure_notify'::text
  ]));
