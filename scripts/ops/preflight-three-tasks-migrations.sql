-- Preflight (READ-ONLY) ก่อน apply ชุด three-tasks: 057 → 061 → 062 → 063 → 064 → 065 → 066
-- ใช้: sudo -u postgres psql -d <db> -X -f scripts/ops/preflight-three-tasks-migrations.sql
-- ไม่มีคำสั่งเขียนใด ๆ · ทุกแถว prereq ต้องเป็น ok=t ก่อนเริ่ม apply
\pset footer off
SELECT 'prereq' AS kind, x.name, x.ok FROM (VALUES
  ('table app_users',               to_regclass('public.app_users') IS NOT NULL),
  ('col app_users.bonus_scans',     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_users' AND column_name='bonus_scans')),
  ('col app_users.created_at',      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_users' AND column_name='created_at')),
  ('table app_settings',            to_regclass('public.app_settings') IS NOT NULL),
  ('table scan_jobs',               to_regclass('public.scan_jobs') IS NOT NULL),
  ('col scan_jobs.access_source',   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scan_jobs' AND column_name='access_source')),
  ('table scan_uploads',            to_regclass('public.scan_uploads') IS NOT NULL),
  ('uq_scan_uploads_line_message',  to_regclass('public.uq_scan_uploads_line_message') IS NOT NULL),
  ('table outbound_messages',       to_regclass('public.outbound_messages') IS NOT NULL),
  ('col outbound.related_job_id',   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='outbound_messages' AND column_name='related_job_id')),
  ('col outbound.related_payment_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='outbound_messages' AND column_name='related_payment_id')),
  ('table payments',                to_regclass('public.payments') IS NOT NULL),
  ('role web_anon',                 EXISTS (SELECT 1 FROM pg_roles WHERE rolname='web_anon')),
  ('role service_role',             EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')),
  ('055 claim_paid_scan_decrement', to_regproc('public.claim_paid_scan_decrement') IS NOT NULL),
  ('058 notification_preferences',  to_regclass('public.notification_preferences') IS NOT NULL),
  ('060 migrate_daily_pick_optout', to_regproc('public.migrate_daily_pick_optout_if_absent') IS NOT NULL),
  ('no approve_notify dup (062 uq)', NOT EXISTS (SELECT 1 FROM public.outbound_messages WHERE kind='approve_notify' AND related_payment_id IS NOT NULL GROUP BY related_payment_id HAVING count(*)>1))
) AS x(name, ok)
UNION ALL
SELECT 'applied', y.name, y.ok FROM (VALUES
  ('057 new_customer_trial_status',  to_regproc('public.new_customer_trial_status') IS NOT NULL),
  ('057 scan_jobs.free_access_kind', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scan_jobs' AND column_name='free_access_kind')),
  ('061 telegram_approval_tokens',   to_regclass('public.telegram_approval_tokens') IS NOT NULL),
  ('062 payment_entitlement_grants', to_regclass('public.payment_entitlement_grants') IS NOT NULL),
  ('063 approve(…,jsonb) only',      (SELECT count(*) FROM pg_proc WHERE proname='approve_payment_and_grant') = 1
                                     AND EXISTS (SELECT 1 FROM pg_proc WHERE proname='approve_payment_and_grant' AND pg_get_function_identity_arguments(oid) LIKE '%jsonb')),
  ('064 release_bonus_reservation',  to_regproc('public.release_bonus_reservation') IS NOT NULL),
  ('064 dup-evidence trigger',       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_release_bonus_on_dup_evidence')),
  ('064 trial_used excludes bonus%', COALESCE(pg_get_functiondef(to_regproc('public.new_customer_trial_used')) LIKE '%NOT LIKE ''bonus%''%', false)),
  ('065 trial_used ignores delivery status (dup evidence counts when recorded)', COALESCE(pg_get_functiondef(to_regproc('public.new_customer_trial_used')) NOT LIKE '%o.status = ''sent''%', false)),
  ('066 telegram_approval_settings table', to_regclass('public.telegram_approval_settings') IS NOT NULL),
  ('066 role telegram_config_admin',       EXISTS (SELECT 1 FROM pg_roles WHERE rolname='telegram_config_admin')),
  ('066 RPCs present (4)',                 (SELECT count(*) FROM pg_proc WHERE proname IN ('telegram_settings_get_public','telegram_settings_get_secrets','telegram_settings_save','telegram_settings_set_enabled')) = 4),
  ('066 web_anon cannot EXECUTE config RPCs', NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname LIKE 'telegram_settings_%' AND (has_function_privilege('web_anon', p.oid, 'EXECUTE') OR has_function_privilege('service_role', p.oid, 'EXECUTE')))),
  ('066 only telegram_config_admin can EXECUTE', (SELECT count(*) FROM pg_proc p WHERE p.proname LIKE 'telegram_settings_%' AND has_function_privilege('telegram_config_admin', p.oid, 'EXECUTE')) = 4),
  ('066 table not readable by web_anon/service_role', NOT (has_table_privilege('web_anon','public.telegram_approval_settings','SELECT') OR has_table_privilege('service_role','public.telegram_approval_settings','SELECT'))),
  ('066 enabled=false (ยังไม่เปิด)',        COALESCE((SELECT NOT enabled FROM public.telegram_approval_settings WHERE id=1), true)),
  -- Codex 30 ก.ย.: md5(prosrc) พิสูจน์แค่ body — ตรวจ definition ที่เหลือด้วย: SECURITY DEFINER, search_path, grants, trigger เปิด
  ('fn: all SECURITY DEFINER',       (SELECT count(*) FROM pg_proc p WHERE p.proname = ANY(ARRAY['new_customer_trial_status','new_customer_trial_used','set_new_customer_trial_policy','guard_new_customer_trial_job','issue_telegram_approval_token','consume_telegram_approval_token','record_payment_approval_audit','purge_expired_telegram_approval_tokens','approve_payment_and_grant','list_payment_grants_pending_notify','mark_payment_grant_notified','release_bonus_reservation','release_bonus_on_dup_evidence','sweep_bonus_releases','telegram_settings_get_public','telegram_settings_get_secrets','telegram_settings_save','telegram_settings_set_enabled']) AND NOT p.prosecdef) = 0
                                     AND (SELECT count(*) FROM pg_proc p WHERE p.proname = ANY(ARRAY['new_customer_trial_status','new_customer_trial_used','set_new_customer_trial_policy','guard_new_customer_trial_job','issue_telegram_approval_token','consume_telegram_approval_token','record_payment_approval_audit','purge_expired_telegram_approval_tokens','approve_payment_and_grant','list_payment_grants_pending_notify','mark_payment_grant_notified','release_bonus_reservation','release_bonus_on_dup_evidence','sweep_bonus_releases','telegram_settings_get_public','telegram_settings_get_secrets','telegram_settings_save','telegram_settings_set_enabled'])) = 18),
  ('fn: search_path pinned (public)', (SELECT count(*) FROM pg_proc p WHERE p.proname = ANY(ARRAY['new_customer_trial_status','new_customer_trial_used','set_new_customer_trial_policy','guard_new_customer_trial_job','issue_telegram_approval_token','consume_telegram_approval_token','record_payment_approval_audit','purge_expired_telegram_approval_tokens','approve_payment_and_grant','list_payment_grants_pending_notify','mark_payment_grant_notified','release_bonus_reservation','release_bonus_on_dup_evidence','sweep_bonus_releases','telegram_settings_get_public','telegram_settings_get_secrets','telegram_settings_save','telegram_settings_set_enabled']) AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%public%')) = 0),
  ('fn: PUBLIC has no EXECUTE',       (SELECT count(*) FROM pg_proc p WHERE p.proname = ANY(ARRAY['new_customer_trial_status','set_new_customer_trial_policy','consume_telegram_approval_token','issue_telegram_approval_token','approve_payment_and_grant','list_payment_grants_pending_notify','mark_payment_grant_notified','release_bonus_reservation','sweep_bonus_releases']) AND has_function_privilege('public', p.oid, 'EXECUTE')) = 0),
  ('fn: service_role can EXECUTE RPCs', (SELECT count(*) FROM pg_proc p WHERE p.proname = ANY(ARRAY['new_customer_trial_status','consume_telegram_approval_token','approve_payment_and_grant','list_payment_grants_pending_notify','mark_payment_grant_notified','release_bonus_reservation','sweep_bonus_releases']) AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')) = 0),
  ('trigger 057/064 enabled',         (SELECT count(*) FROM pg_trigger WHERE tgname IN ('guard_new_customer_trial_job','trg_release_bonus_on_dup_evidence') AND tgenabled = 'O') = 2),
  ('trigger guard on scan_jobs INSERT+UPDATE OF status', EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname='guard_new_customer_trial_job' AND c.relname='scan_jobs' AND pg_get_triggerdef(t.oid) LIKE '%BEFORE INSERT OR UPDATE OF status%'))
) AS y(name, ok);
-- md5(prosrc) ต่อฟังก์ชัน (เทียบ scripts/ops/migration-function-md5.reference.txt ด้วย verify-migration-versions.sh)
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scan_jobs' AND column_name='free_access_kind') AS has_kind \gset
\if :has_kind
SELECT 'state' AS kind, 'free_access_kind=' || free_access_kind AS name, count(*) AS n
FROM public.scan_jobs WHERE free_access_kind LIKE 'bonus%' GROUP BY free_access_kind ORDER BY 2;
\endif
