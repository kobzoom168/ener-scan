-- Verify production applied: supabase/migrations/20260401200000_fix_claim_next_outbound_message_null_composite.sql
-- Expected: function body contains BOTH "get diagnostics updated_count = row_count" AND "if updated_count = 0 then".
-- If missing, PostgREST can return an all-null composite when no row is updated → app logs OUTBOUND_CLAIM_ROW_INVALID.

SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'claim_next_outbound_message'
  AND pg_function_is_visible(p.oid);

-- Quick sanity: definition must mention row_count and return null (manual review of query result).
