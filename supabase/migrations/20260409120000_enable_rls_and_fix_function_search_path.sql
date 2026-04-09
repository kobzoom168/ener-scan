-- Supabase linter: rls_disabled_in_public + function_search_path_mutable
-- - Enables RLS on public tables flagged by security lints (service_role bypasses RLS; no table drops).
-- - Pins search_path on trigger/RPC helpers without replacing function bodies (runtime unchanged).
-- Idempotent: re-running ENABLE ROW LEVEL SECURITY and ALTER FUNCTION ... SET is safe.

-- ---------------------------------------------------------------------------
-- 1) Row Level Security (public schema / PostgREST-exposed tables)
-- ---------------------------------------------------------------------------
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_copy_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_family_category_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_ab_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_ab_funnel_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_ab_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_ab_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_public_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_result_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_results_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) Immutable search_path on functions (linter WARN)
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public;

ALTER FUNCTION public.claim_next_scan_job(text) SET search_path = pg_catalog, public;

ALTER FUNCTION public.claim_next_outbound_message(text) SET search_path = pg_catalog, public;
