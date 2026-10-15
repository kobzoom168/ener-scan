-- READ-ONLY: สิทธิ์ที่เติมสำเร็จแล้ว (062/063) แต่ยังไม่มีงานแจ้งลูกค้า (notified_at IS NULL)
-- ใช้ก่อน/หลัง rollback โค้ด Pro: โค้ดเก่า be67a98 ไม่มี sweep นี้ → ต้องให้แถวว่างก่อนย้อน หรือกู้ด้วย one-shot จาก image ใหม่
-- notified_at = "สร้างงานแจ้งแล้ว" (ไม่ใช่ส่งถึง) · ห้าม UPDATE notified_at มือ · ห้ามเติมสิทธิ์ซ้ำ
SELECT 'pending_notify='||count(*) FROM public.payment_entitlement_grants WHERE notified_at IS NULL;
SELECT 'oldest_pending_minutes='||COALESCE(EXTRACT(EPOCH FROM (now()-min(granted_at)))/60,0)::int FROM public.payment_entitlement_grants WHERE notified_at IS NULL;
SELECT 'approve_notify_outbound_for_pending='||count(*) FROM public.outbound_messages o
  JOIN public.payment_entitlement_grants g ON g.payment_id = o.related_payment_id
 WHERE g.notified_at IS NULL AND o.kind='approve_notify';
SELECT left(g.payment_id::text,8) AS payment_prefix, g.granted_at, g.scans_added, g.paid_until,
       (SELECT status FROM public.outbound_messages o WHERE o.related_payment_id=g.payment_id AND o.kind='approve_notify' ORDER BY id DESC LIMIT 1) AS outbound_status
  FROM public.payment_entitlement_grants g WHERE g.notified_at IS NULL ORDER BY g.granted_at LIMIT 20;
