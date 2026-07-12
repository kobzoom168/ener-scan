-- 042: เพิ่ม kind "renewal_reminder" (เตือนต่ออายุแพ็กรายเดือนอัตโนมัติ — /admin/promo)
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
      'renewal_reminder'::text
    ]
  )
);
