-- schema ขั้นต่ำสำหรับ integration test โบนัส (ถอดจาก pg_dump -s ของ staging 26 ก.ย. 2026, read-only)

-- ใช้เฉพาะใน container ใช้แล้วทิ้ง — ไม่ใช่ migration

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN new.updated_at = now(); RETURN new; END $$;

CREATE TABLE public.outbound_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    line_user_id text NOT NULL,
    kind text NOT NULL,
    priority smallint DEFAULT 100 NOT NULL,
    related_job_id uuid,
    related_payment_id uuid,
    payload_json jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error_code text,
    last_error_message text,
    next_retry_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outbound_messages_kind_check CHECK ((kind = ANY (ARRAY['pre_scan_ack'::text, 'scan_result'::text, 'approve_notify'::text, 'reject_notify'::text, 'payment_qr'::text, 'pending_intro'::text, 'slip_received'::text, 'renewal_reminder'::text, 'daily_pick_push'::text, 'fb_consent_ask'::text, 'scan_failure_notify'::text]))),
    CONSTRAINT outbound_messages_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'retry_wait'::text, 'failed'::text, 'dead'::text, 'suppressed_banned'::text, 'held_object_info'::text, 'suppressed_optout'::text])))
);

CREATE TABLE public.scan_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    line_user_id text NOT NULL,
    app_user_id uuid NOT NULL,
    upload_id uuid NOT NULL,
    birthdate_snapshot text,
    access_source text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    priority smallint DEFAULT 100 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    worker_id text,
    locked_at timestamp with time zone,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    result_id uuid,
    error_code text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    process_after timestamp with time zone,
    extra_upload_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    quota_accounting_version integer,
    free_access_kind text,
    CONSTRAINT scan_jobs_access_source_check CHECK ((access_source = ANY (ARRAY['paid'::text, 'free'::text, 'admin_comp'::text]))),
    CONSTRAINT scan_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'delivery_queued'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text])))
);

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.app_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    line_user_id text NOT NULL,
    display_name text,
    birthdate text,
    status text DEFAULT 'active'::text NOT NULL,
    paid_until timestamp with time zone,
    paid_remaining_scans integer DEFAULT 0 NOT NULL,
    paid_plan_code text,
    free_scan_daily_offset integer DEFAULT 0 NOT NULL,
    free_scan_offset_date text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone,
    admin_note text,
    bonus_scans integer DEFAULT 0 NOT NULL,
    synergy_token text
);

CREATE TABLE public.scan_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scan_request_id uuid NOT NULL,
    user_id uuid NOT NULL,
    result_text text NOT NULL,
    result_summary text,
    energy_score numeric,
    main_energy text,
    compatibility text,
    model_name text,
    prompt_version text,
    response_time_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    from_cache boolean DEFAULT false NOT NULL,
    quality_analytics jsonb
);

CREATE TABLE public.scan_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    line_user_id text NOT NULL,
    app_user_id uuid NOT NULL,
    line_message_id text NOT NULL,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint,
    sha256 text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    original_expires_at timestamp with time zone,
    thumbnail_path text,
    is_pinned boolean DEFAULT false NOT NULL,
    storage_tier text DEFAULT 'free'::text NOT NULL,
    original_deleted_at timestamp with time zone
);

CREATE TABLE public.banned_users (
    id bigint NOT NULL,
    line_user_id text NOT NULL,
    reason text,
    source text DEFAULT 'manual'::text NOT NULL,
    banned_by text NOT NULL,
    banned_at timestamp with time zone DEFAULT now() NOT NULL,
    unbanned_by text,
    unbanned_at timestamp with time zone,
    unban_reason text
);

CREATE TABLE public.scan_results_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scan_job_id uuid NOT NULL,
    line_user_id text NOT NULL,
    app_user_id uuid NOT NULL,
    raw_text text,
    formatted_text text,
    flex_payload_json jsonb,
    report_payload_json jsonb,
    report_url text,
    html_public_token text,
    quality_tier text,
    validation_reason text,
    from_cache boolean DEFAULT false NOT NULL,
    model_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.scan_jobs
    ADD CONSTRAINT scan_jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.scan_results
    ADD CONSTRAINT scan_results_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.scan_uploads
    ADD CONSTRAINT scan_uploads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.scan_results
    ADD CONSTRAINT scan_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.scan_uploads
    ADD CONSTRAINT scan_uploads_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.banned_users
    ADD CONSTRAINT banned_users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.scan_results_v2
    ADD CONSTRAINT scan_results_v2_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.scan_results_v2
    ADD CONSTRAINT scan_results_v2_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.scan_results_v2
    ADD CONSTRAINT scan_results_v2_scan_job_id_fkey FOREIGN KEY (scan_job_id) REFERENCES public.scan_jobs(id) ON DELETE CASCADE;

CREATE INDEX idx_outbound_messages_ready ON public.outbound_messages USING btree (status, priority, next_retry_at NULLS FIRST, created_at);

CREATE INDEX idx_scan_jobs_trial_usage ON public.scan_jobs USING btree (app_user_id) WHERE ((access_source = 'free'::text) AND (status <> 'failed'::text));

CREATE UNIQUE INDEX uq_app_users_line_user_id ON public.app_users USING btree (line_user_id);

CREATE UNIQUE INDEX uq_scan_uploads_line_message ON public.scan_uploads USING btree (line_message_id);

CREATE TRIGGER trg_outbound_messages_set_updated_at BEFORE UPDATE ON public.outbound_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_scan_jobs_set_updated_at BEFORE UPDATE ON public.scan_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='web_anon') THEN CREATE ROLE web_anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN PASSWORD 'authenticator'; END IF;
END $$;
GRANT web_anon TO authenticator; GRANT service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO web_anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO web_anon, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO web_anon, service_role;
