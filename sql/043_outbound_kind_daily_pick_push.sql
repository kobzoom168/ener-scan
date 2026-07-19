-- 043: เพิ่ม kind "daily_pick_push" (push หนุนดวงรายเช้า 7 โมง — กบ 19 ก.ค. 2026)
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
      'daily_pick_push'::text
    ]
  )
);
