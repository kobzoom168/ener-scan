-- Inspect dead outbound rows (e.g. maintenance log: outbound_messages.dead > 0).
-- Run in Supabase SQL editor. Adjust limits as needed.

-- 1) Count by kind
SELECT kind, count(*) AS n
FROM public.outbound_messages
WHERE status = 'dead'
GROUP BY kind
ORDER BY n DESC;

-- 2) Recent dead scan_result rows (potential undelivered LINE flex/report handoff)
SELECT
  o.id,
  o.kind,
  o.status,
  o.line_user_id,
  o.related_job_id,
  o.attempt_count,
  o.last_error_code,
  o.last_error_message,
  o.created_at,
  o.updated_at
FROM public.outbound_messages o
WHERE o.status = 'dead'
  AND o.kind = 'scan_result'
ORDER BY o.updated_at DESC
LIMIT 50;

-- 3) Optional: join to scan_jobs to see if job never reached "delivered"
-- (deliverOutbound updates job to delivered only after successful send for scan_result.)
SELECT
  o.id AS outbound_id,
  o.line_user_id,
  j.id AS job_id,
  j.status AS job_status,
  j.result_id,
  o.last_error_code
FROM public.outbound_messages o
LEFT JOIN public.scan_jobs j ON j.id = o.related_job_id
WHERE o.status = 'dead'
  AND o.kind = 'scan_result'
ORDER BY o.updated_at DESC
LIMIT 30;

-- 4) REQUEUE (dangerous — review rows first). Uncomment only after confirming migration + root cause fixed.
-- Re-queues dead scan_result messages so worker-delivery can retry push.
/*
UPDATE public.outbound_messages o
SET
  status = 'queued',
  attempt_count = 0,
  next_retry_at = NULL,
  last_error_code = NULL,
  last_error_message = NULL,
  updated_at = now()
WHERE o.status = 'dead'
  AND o.kind = 'scan_result'
  AND o.id IN (
    SELECT id FROM public.outbound_messages
    WHERE status = 'dead' AND kind = 'scan_result'
    ORDER BY updated_at DESC
    LIMIT 10
  );
*/
