-- schema เต็มของ staging (pg_dump -s --no-owner, 1 ต.ค. 2026, read-only · ไม่มีข้อมูล) — ใช้เฉพาะ container ใช้แล้วทิ้งของ integration test
-- ไม่ใช่ migration · ต้องใช้ image ที่มี pgvector (pgvector/pgvector:pg16)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='web_anon') THEN CREATE ROLE web_anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN PASSWORD 'authenticator'; END IF;
END $$;
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14 (Ubuntu 16.14-1.pgdg24.04+1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: graphql(text, text, jsonb, jsonb); Type: FUNCTION; Schema: graphql_public; Owner: -
--

CREATE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


--
-- Name: approve_payment_and_grant(uuid, text, text, text, numeric, text, integer, timestamp with time zone, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_payment_and_grant(p_payment_id uuid, p_channel text, p_actor text, p_expect_package_code text, p_expect_amount numeric, p_plan_code text, p_scans integer, p_paid_until timestamp with time zone, p_is_top_package boolean, p_calculation_snapshot jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  pay     public.payments%ROWTYPE;
  usr     public.app_users%ROWTYPE;
  g       public.payment_entitlement_grants%ROWTYPE;
  carry   integer := 0;
  total   integer;
BEGIN
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'payment_id_required'; END IF;
  IF p_channel IS NULL OR btrim(p_channel) = '' THEN RAISE EXCEPTION 'channel_required'; END IF;
  IF p_plan_code IS NULL OR p_scans IS NULL OR p_paid_until IS NULL THEN
    RAISE EXCEPTION 'entitlement_params_required';
  END IF;

  -- 1) ล็อกใบชำระเงิน
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found'); END IF;

  -- เคยเติมไปแล้ว → คืนของเดิม ไม่คำนวณใหม่ ไม่เติมใหม่
  SELECT * INTO g FROM public.payment_entitlement_grants WHERE payment_id = p_payment_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'alreadyGranted', true,
      'lineUserId', g.line_user_id, 'paidPlanCode', g.paid_plan_code,
      'paidUntil', g.paid_until, 'scansAdded', g.scans_added, 'carryOver', g.carry_over);
  END IF;

  -- paid แต่ไม่มี grant = แถวเก่าก่อนระบบนี้ → **ห้ามเดาว่าเติมแล้วหรือยัง**
  IF pay.status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'legacy_unverified');
  END IF;
  IF pay.status <> 'pending_verify' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', pay.status);
  END IF;

  -- 2) ตรวจ expect ณ จุด commit จริง (ไม่ใช่ตรวจใน handler แล้วอ่านใหม่)
  IF p_expect_package_code IS NOT NULL
     AND COALESCE(pay.package_code, '') IS DISTINCT FROM p_expect_package_code THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_package',
      'currentPackageCode', pay.package_code);
  END IF;
  IF p_expect_amount IS NOT NULL
     AND COALESCE(pay.expected_amount, -1)::numeric IS DISTINCT FROM p_expect_amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_amount',
      'currentAmount', pay.expected_amount);
  END IF;

  -- Mandatory null-safe check of ALL inputs used by JS to calculate this grant.
  -- Runs under the payment row lock. Missing/old clients fail closed.
  IF p_calculation_snapshot IS DISTINCT FROM jsonb_build_object(
      'package_code', pay.package_code, 'expected_amount', pay.expected_amount,
      'unlock_hours', pay.unlock_hours, 'user_id', pay.user_id,
      'line_user_id', pay.line_user_id, 'status', pay.status) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_calculation');
  END IF;

  -- 3) ล็อกบัญชีผู้ใช้ก่อนอ่านยอด (กันเขียนทับยอดที่ถูกหักจากการสแกนพร้อมกัน)
  SELECT * INTO usr FROM public.app_users WHERE id = pay.user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'app_user_not_found'); END IF;

  -- 4) carry-over: กติกาเดิมเป๊ะ (แพ็กใหญ่สุด + ยังไม่หมดอายุ + คนละ plan + เหลือ>0 และ <900000)
  IF COALESCE(p_is_top_package, false) AND p_scans < 900000
     AND usr.paid_until IS NOT NULL AND usr.paid_until > now()
     AND COALESCE(usr.paid_plan_code, '') IS DISTINCT FROM p_plan_code
     AND COALESCE(usr.paid_remaining_scans, 0) > 0
     AND COALESCE(usr.paid_remaining_scans, 0) < 900000 THEN
    carry := COALESCE(usr.paid_remaining_scans, 0);
  END IF;
  total := p_scans + carry;

  -- 5) เติมสิทธิ์
  UPDATE public.app_users
     SET paid_until = p_paid_until,
         paid_remaining_scans = total,
         paid_plan_code = p_plan_code,
         updated_at = now()
   WHERE id = usr.id;

  -- 6) หลักฐานการเติม + กันเติมซ้ำถาวร (ชน PK = abort ทั้ง transaction)
  INSERT INTO public.payment_entitlement_grants(
      payment_id, app_user_id, line_user_id, paid_plan_code,
      scans_added, carry_over, paid_until, channel, actor)
  VALUES (p_payment_id, usr.id, pay.line_user_id, p_plan_code,
          p_scans, carry, p_paid_until, p_channel, p_actor);

  -- 7) เปลี่ยนสถานะใบชำระเงิน
  UPDATE public.payments
     SET status = 'paid', verified_at = now(), approved_by = p_actor, updated_at = now()
   WHERE id = p_payment_id;

  -- 8) audit ถาวร อยู่ใน transaction เดียวกับการอนุมัติ
  INSERT INTO public.payment_approval_audit(payment_id, channel, actor, action, result, detail)
  VALUES (p_payment_id, p_channel, p_actor, 'approve_confirmed', 'ok',
          jsonb_build_object('planCode', p_plan_code, 'scansAdded', p_scans,
                             'carryOver', carry, 'paidUntil', p_paid_until));

  RETURN jsonb_build_object('ok', true, 'alreadyGranted', false,
    'lineUserId', pay.line_user_id, 'paidPlanCode', p_plan_code,
    'paidUntil', p_paid_until, 'scansAdded', p_scans, 'carryOver', carry,
    'paidRemainingScans', total);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: outbound_messages; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: claim_next_outbound_message(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_next_outbound_message(p_worker_id text) RETURNS public.outbound_messages
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  r public.outbound_messages;
  updated_count int;
begin
  update public.outbound_messages m
  set
    status = 'sending',
    attempt_count = m.attempt_count + 1,
    updated_at = now()
  from (
    select id
    from public.outbound_messages
    where status in ('queued', 'retry_wait')
      and (next_retry_at is null or next_retry_at <= now())
    order by priority asc, created_at asc
    limit 1
    for update skip locked
  ) picked
  where m.id = picked.id
  returning m.* into r;

  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    return null;
  end if;
  return r;
end;
$$;


--
-- Name: scan_jobs; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: claim_next_scan_job(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_next_scan_job(p_worker_id text) RETURNS public.scan_jobs
    LANGUAGE plpgsql
    AS $$
declare
  r public.scan_jobs;
begin
  update public.scan_jobs j
  set
    status = 'processing',
    worker_id = p_worker_id,
    locked_at = now(),
    started_at = coalesce(j.started_at, now()),
    attempt_count = j.attempt_count + 1,
    updated_at = now()
  from (
    select id
    from public.scan_jobs
    where status = 'queued'
      and (process_after is null or process_after <= now())
    order by priority asc, created_at asc
    limit 1
    for update skip locked
  ) picked
  where j.id = picked.id
  returning j.* into r;

  if not found then
    return null;
  end if;
  return r;
end;
$$;


--
-- Name: video_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_type text NOT NULL,
    source_id uuid,
    source_metadata jsonb,
    script_text text,
    voice_url text,
    video_url text,
    subtitle_url text,
    status text DEFAULT 'queued'::text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    background_url text,
    subtitle_fontsize integer,
    footage_clip_id uuid,
    qc_result_json jsonb,
    qc_error_message text,
    qc_checked_at timestamp with time zone,
    CONSTRAINT video_jobs_source_type_chk CHECK ((source_type = ANY (ARRAY['scan_result'::text, 'temple_footage'::text]))),
    CONSTRAINT video_jobs_status_chk CHECK ((status = ANY (ARRAY['queued'::text, 'scripting'::text, 'voicing'::text, 'rendering'::text, 'qc_checking'::text, 'qc_failed'::text, 'ready_review'::text, 'approved'::text, 'published'::text, 'failed'::text])))
);


--
-- Name: claim_next_video_job_render(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_next_video_job_render() RETURNS SETOF public.video_jobs
    LANGUAGE sql
    AS $$
  with cte as (
    select id
    from public.video_jobs
    where status = 'rendering'
      and voice_url is not null
      and subtitle_url is not null
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.video_jobs v
  set updated_at = now()
  from cte
  where v.id = cte.id
  returning v.*;
$$;


--
-- Name: claim_next_video_job_script(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_next_video_job_script() RETURNS SETOF public.video_jobs
    LANGUAGE sql
    AS $$
  with cte as (
    select id
    from public.video_jobs
    where status = 'queued'
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.video_jobs v
  set status = 'scripting'
  from cte
  where v.id = cte.id
  returning v.*;
$$;


--
-- Name: claim_next_video_job_voice(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_next_video_job_voice() RETURNS SETOF public.video_jobs
    LANGUAGE sql
    AS $$
  with cte as (
    select id
    from public.video_jobs
    where status = 'voicing'
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.video_jobs v
  set updated_at = now()
  from cte
  where v.id = cte.id
  returning v.*;
$$;


--
-- Name: claim_paid_scan_decrement(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_paid_scan_decrement(p_job_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  j scan_jobs%ROWTYPE;
  led scan_quota_decrements%ROWTYPE;
  ev text;
  affected integer;
BEGIN
  SELECT * INTO led FROM scan_quota_decrements WHERE job_id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no_ledger'; END IF;
  IF led.status = 'completed' THEN RETURN 'already_completed'; END IF;
  -- P0-H: ตรวจหลักฐานซ้ำใน transaction (ledger อาจถูกสร้างก่อน state เปลี่ยน) — lock job กัน state แกว่ง
  SELECT * INTO j FROM scan_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'job_not_found'; END IF;
  IF j.app_user_id IS DISTINCT FROM led.app_user_id THEN RETURN 'user_mismatch'; END IF;
  ev := quota_delivery_evidence(j);
  IF ev <> 'ok' THEN RETURN ev; END IF;
  UPDATE app_users
  SET paid_remaining_scans = GREATEST(COALESCE(paid_remaining_scans, 0) - 1, 0)
  WHERE id = led.app_user_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'app_user_update_affected_%', affected;
  END IF;
  UPDATE scan_quota_decrements
  SET status = 'completed', attempts = attempts + 1, completed_at = now(), last_error = NULL
  WHERE job_id = p_job_id;
  RETURN 'completed';
END;
$$;


--
-- Name: consume_telegram_approval_token(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_telegram_approval_token(p_token text, p_tg_user_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r public.telegram_approval_tokens%ROWTYPE; existed boolean;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN RAISE EXCEPTION 'token_required'; END IF;
  UPDATE public.telegram_approval_tokens
     SET used_at = now(), used_by_tg_user_id = btrim(COALESCE(p_tg_user_id,''))
   WHERE token = p_token AND used_at IS NULL AND expires_at > now()
   RETURNING * INTO r;
  IF r.token IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'paymentId', r.payment_id, 'kind', r.kind,
      'snapshotAmount', r.snapshot_amount, 'snapshotPackageCode', r.snapshot_package_code,
      'snapshotStatus', r.snapshot_status);
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.telegram_approval_tokens WHERE token = p_token) INTO existed;
  RETURN jsonb_build_object('ok', false,
    'reason', CASE WHEN existed THEN 'used_or_expired' ELSE 'unknown_token' END);
END;
$$;


--
-- Name: ener_form_stats(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ener_form_stats(p_form text) RETURNS json
    LANGUAGE sql STABLE
    AS $_$
  WITH s AS (
    SELECT (report_payload_json->'summary'->>'energyScore')::numeric AS sc
    FROM scan_results_v2
    WHERE report_payload_json->'object'->'objectUnderstanding'->>'objectForm' = p_form
      AND report_payload_json->'summary'->>'energyScore' ~ '^[0-9]+(\.[0-9]+)?$'
      AND COALESCE(report_payload_json->>'precheckMode','') <> 'true'
  )
  SELECT json_build_object(
    'count', (SELECT count(*) FROM s),
    'avg',   (SELECT round(avg(sc), 1) FROM s),
    'p25',   (SELECT round(percentile_cont(0.25) WITHIN GROUP (ORDER BY sc)::numeric, 1) FROM s),
    'p75',   (SELECT round(percentile_cont(0.75) WITHIN GROUP (ORDER BY sc)::numeric, 1) FROM s)
  );
$_$;


--
-- Name: ener_mark_precheck(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ener_mark_precheck(p_token text) RETURNS boolean
    LANGUAGE sql
    AS $$
  UPDATE scan_results_v2
  SET report_payload_json = (report_payload_json::jsonb || '{"precheckMode": true}'::jsonb)::json
  WHERE html_public_token = p_token
  RETURNING true;
$$;


--
-- Name: ener_score_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ener_score_stats() RETURNS json
    LANGUAGE sql STABLE
    AS $_$
  WITH s AS (
    SELECT (report_payload_json->'summary'->>'energyScore')::numeric AS sc,
           line_user_id
    FROM scan_results_v2
    WHERE report_payload_json->'summary'->>'energyScore' ~ '^[0-9]+(\.[0-9]+)?$'
  )
  SELECT json_build_object(
    'total',       (SELECT count(*) FROM s),
    'max',         (SELECT max(sc) FROM s),
    'cntAtMax',    (SELECT count(*) FROM s WHERE sc = (SELECT max(sc) FROM s)),
    'ownersAtMax', (SELECT count(DISTINCT line_user_id) FROM s WHERE sc = (SELECT max(sc) FROM s)),
    'cnt85',       (SELECT count(*) FROM s WHERE sc >= 8.5),
    'cnt89',       (SELECT count(*) FROM s WHERE sc >= 8.9)
  );
$_$;


--
-- Name: ener_vault_unique_count(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ener_vault_unique_count(p_uid text) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT count(DISTINCT
      COALESCE(report_payload_json->'summary'->>'energyScore','') || '|' ||
      COALESCE(report_payload_json->'amuletV1'->>'powerCategories','') || '|' ||
      COALESCE(report_payload_json->'crystalBraceletV1'->>'axes',''))::int
  FROM scan_results_v2
  WHERE line_user_id = p_uid
    AND (report_payload_json->'amuletV1' IS NOT NULL OR report_payload_json->'crystalBraceletV1' IS NOT NULL)
    AND COALESCE(report_payload_json->'object'->>'objectType','') <> 'พระบูชา'
    AND COALESCE(report_payload_json->'object'->'objectUnderstanding'->'usageProfile'->>'canCarry','true') <> 'false'
$$;


--
-- Name: enqueue_video_job_from_scan_result(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_video_job_from_scan_result() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if exists (
    select 1
    from public.video_pipeline_settings s
    where s.key = 'auto_video_job_on_scan_result'
      and s.value = true
  ) then
    insert into public.video_jobs (source_type, source_id, status)
    values ('scan_result', new.id, 'queued');
  end if;
  return new;
end;
$$;


--
-- Name: ensure_quota_decrement_pending(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_quota_decrement_pending(p_job_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  j scan_jobs%ROWTYPE;
  led scan_quota_decrements%ROWTYPE;
  ev text;
BEGIN
  SELECT * INTO j FROM scan_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RETURN 'job_not_found'; END IF;
  ev := quota_delivery_evidence(j);
  IF ev <> 'ok' THEN RETURN ev; END IF;
  SELECT * INTO led FROM scan_quota_decrements WHERE job_id = p_job_id;
  IF FOUND THEN
    IF led.app_user_id IS DISTINCT FROM j.app_user_id THEN RETURN 'user_mismatch'; END IF;
    RETURN led.status;
  END IF;
  INSERT INTO scan_quota_decrements (job_id, app_user_id)
  VALUES (p_job_id, j.app_user_id)
  ON CONFLICT (job_id) DO NOTHING;
  SELECT status INTO led.status FROM scan_quota_decrements WHERE job_id = p_job_id;
  RETURN COALESCE(led.status, 'pending');
END;
$$;


--
-- Name: get_daily_pick_optout(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_pick_optout(p_line_user_id text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'known', EXISTS (SELECT 1 FROM public.notification_preferences
                     WHERE line_user_id = btrim(p_line_user_id)),
    'optedOut', EXISTS (SELECT 1 FROM public.notification_preferences
                        WHERE line_user_id = btrim(p_line_user_id)
                          AND daily_pick_optout_at IS NOT NULL)
  );
$$;


--
-- Name: guard_new_customer_trial_job(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_new_customer_trial_job() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE cfg jsonb; u public.app_users%ROWTYPE;
BEGIN
  IF NEW.access_source <> 'free' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    -- (ก) คืนโบนัสครั้งเดียวเมื่อกลายเป็น failed — เฉพาะงานที่จองจริง ('bonus' legacy ไม่คืน)
    IF NEW.status = 'failed' AND OLD.status <> 'failed' THEN
      IF NEW.free_access_kind = 'bonus_reserved' THEN
        PERFORM 1 FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
        UPDATE public.app_users SET bonus_scans = bonus_scans + 1 WHERE id = NEW.app_user_id;
        NEW.free_access_kind := 'bonus_released';
      END IF;
      RETURN NEW;
    END IF;
    IF NOT (OLD.status = 'failed' AND NEW.status <> 'failed') THEN RETURN NEW; END IF;
    -- retry failed → active
    IF NEW.free_access_kind = 'bonus_released' THEN
      SELECT * INTO u FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
      IF COALESCE(u.bonus_scans, 0) < 1 THEN RAISE EXCEPTION 'bonus_quota_exhausted'; END IF;
      UPDATE public.app_users SET bonus_scans = bonus_scans - 1 WHERE id = u.id;
      NEW.free_access_kind := 'bonus_reserved';
      RETURN NEW;
    END IF;
    IF NEW.free_access_kind IN ('bonus', 'bonus_reserved') THEN RETURN NEW; END IF;
    -- daily/trial: ตรวจโควตา trial ซ้ำด้านล่าง (พฤติกรรมเดิม 057)
  ELSIF NEW.free_access_kind = 'bonus' THEN
    -- legacy จากโค้ดเก่า (หัก/ไม่หักที่ webhook แล้ว) — ห้ามหักซ้ำ ห้ามคืน
    RETURN NEW;
  ELSIF NEW.free_access_kind = 'bonus_reserved' THEN
    -- จองโบนัสที่ INSERT ทุกโหมด
    SELECT * INTO u FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
    IF u.id IS NULL OR u.line_user_id IS DISTINCT FROM NEW.line_user_id THEN
      RAISE EXCEPTION 'trial_user_mismatch';
    END IF;
    IF COALESCE(u.bonus_scans, 0) < 1 THEN RAISE EXCEPTION 'bonus_quota_exhausted'; END IF;
    UPDATE public.app_users SET bonus_scans = bonus_scans - 1 WHERE id = u.id;
    RETURN NEW;
  END IF;

  SELECT value INTO cfg FROM public.app_settings WHERE key = 'new_customer_trial';
  IF cfg IS NULL THEN RAISE EXCEPTION 'trial_policy_unavailable'; END IF;
  IF (cfg->>'enabled')::boolean IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT * INTO u FROM public.app_users WHERE id = NEW.app_user_id FOR UPDATE;
  IF u.id IS NULL OR u.line_user_id IS DISTINCT FROM NEW.line_user_id THEN
    RAISE EXCEPTION 'trial_user_mismatch';
  END IF;
  IF cfg->>'eligible_since' IS NULL OR u.created_at IS NULL
    OR u.created_at < (cfg->>'eligible_since')::timestamptz THEN
    RAISE EXCEPTION 'trial_not_eligible' USING ERRCODE = 'P0001';
  END IF;
  IF public.new_customer_trial_used(u.id) >= 2 THEN
    RAISE EXCEPTION 'trial_quota_exhausted' USING ERRCODE = 'P0001';
  END IF;
  NEW.free_access_kind := 'trial';
  RETURN NEW;
END;
$$;


--
-- Name: issue_telegram_approval_token(text, uuid, integer, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_telegram_approval_token(p_token text, p_payment_id uuid, p_ttl_seconds integer, p_amount numeric, p_package_code text, p_status text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN RAISE EXCEPTION 'token_required'; END IF;
  IF p_payment_id IS NULL THEN RAISE EXCEPTION 'payment_id_required'; END IF;
  IF COALESCE(p_ttl_seconds, 0) <= 0 OR p_ttl_seconds > 86400 THEN RAISE EXCEPTION 'ttl_out_of_range'; END IF;
  INSERT INTO public.telegram_approval_tokens(
      token, payment_id, kind, snapshot_amount, snapshot_package_code, snapshot_status, expires_at)
  VALUES (p_token, p_payment_id, 'confirm', p_amount, p_package_code, p_status,
          now() + make_interval(secs => p_ttl_seconds));
  RETURN true;
END;
$$;


--
-- Name: list_payment_grants_pending_notify(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_payment_grants_pending_notify(p_limit integer DEFAULT 20) RETURNS TABLE(payment_id uuid, line_user_id text, paid_plan_code text, paid_until timestamp with time zone, scans_added integer, carry_over integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT g.payment_id, g.line_user_id, g.paid_plan_code, g.paid_until, g.scans_added, g.carry_over
    FROM public.payment_entitlement_grants g
   WHERE g.notified_at IS NULL
     AND g.granted_at < now() - interval '2 minutes'
     AND g.line_user_id IS NOT NULL
   ORDER BY g.granted_at
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
$$;


--
-- Name: mark_payment_grant_notified(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_payment_grant_notified(p_payment_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- A duplicate-key exception alone is not evidence for this payment's outbox.
  IF NOT EXISTS (SELECT 1 FROM public.outbound_messages
      WHERE related_payment_id = p_payment_id AND kind = 'approve_notify') THEN
    RETURN false;
  END IF;
  UPDATE public.payment_entitlement_grants
     SET notified_at = COALESCE(notified_at, now())
   WHERE payment_id = p_payment_id;
  RETURN FOUND; -- already stamped is an idempotent success
END;
$$;


--
-- Name: mark_quota_decrement_error(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_quota_decrement_error(p_job_id uuid, p_error text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE affected integer;
BEGIN
  UPDATE scan_quota_decrements
  SET attempts = attempts + 1, last_error = left(COALESCE(p_error, 'unknown'), 300)
  WHERE job_id = p_job_id AND status = 'pending';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;


--
-- Name: match_amulet_type_examples(public.vector, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_amulet_type_examples(query_embedding public.vector, match_count integer DEFAULT 8) RETURNS TABLE(example_id uuid, type_key text, label_thai text, similarity double precision)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    e.id as example_id,
    e.type_key,
    t.label_thai,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.amulet_type_examples e
  join public.amulet_types t on t.type_key = e.type_key and t.enabled
  where e.status = 'confirmed'
  order by e.embedding <=> query_embedding asc
  limit greatest(1, least(50, match_count));
$$;


--
-- Name: match_global_object_baselines(public.vector, text, text, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_global_object_baselines(query_embedding public.vector, match_lane text DEFAULT NULL::text, match_family text DEFAULT NULL::text, min_similarity double precision DEFAULT 0.92, match_count integer DEFAULT 5) RETURNS TABLE(id uuid, image_sha256 text, image_phash text, stable_feature_seed text, lane text, object_family text, baseline_schema_version integer, prompt_version text, scoring_version text, object_baseline_json jsonb, axis_scores_json jsonb, peak_power_key text, thumbnail_path text, source_scan_result_v2_id uuid, source_upload_id uuid, confidence numeric, reuse_count integer, created_at timestamp with time zone, similarity double precision)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    b.id,
    b.image_sha256,
    b.image_phash,
    b.stable_feature_seed,
    b.lane,
    b.object_family,
    b.baseline_schema_version,
    b.prompt_version,
    b.scoring_version,
    b.object_baseline_json,
    b.axis_scores_json,
    b.peak_power_key,
    b.thumbnail_path,
    b.source_scan_result_v2_id,
    b.source_upload_id,
    b.confidence,
    b.reuse_count,
    b.created_at,
    1 - (b.image_embedding <=> query_embedding) as similarity
  from public.global_object_baselines b
  where b.image_embedding is not null
    and (match_lane is null or b.lane = match_lane)
    and (match_family is null or b.object_family = match_family)
    and (1 - (b.image_embedding <=> query_embedding)) >= min_similarity
  order by b.image_embedding <=> query_embedding asc
  limit greatest(1, least(50, match_count));
$$;


--
-- Name: match_global_object_baselines_visual(public.vector, text, text, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_global_object_baselines_visual(query_embedding public.vector, match_lane text DEFAULT NULL::text, match_family text DEFAULT NULL::text, min_similarity double precision DEFAULT 0.60, match_count integer DEFAULT 6) RETURNS TABLE(id uuid, image_sha256 text, image_phash text, stable_feature_seed text, lane text, object_family text, baseline_schema_version integer, prompt_version text, scoring_version text, object_baseline_json jsonb, axis_scores_json jsonb, peak_power_key text, thumbnail_path text, source_scan_result_v2_id uuid, source_upload_id uuid, confidence numeric, reuse_count integer, created_at timestamp with time zone, similarity double precision)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    b.id,
    b.image_sha256,
    b.image_phash,
    b.stable_feature_seed,
    b.lane,
    b.object_family,
    b.baseline_schema_version,
    b.prompt_version,
    b.scoring_version,
    b.object_baseline_json,
    b.axis_scores_json,
    b.peak_power_key,
    b.thumbnail_path,
    b.source_scan_result_v2_id,
    b.source_upload_id,
    b.confidence,
    b.reuse_count,
    b.created_at,
    1 - (b.visual_embedding <=> query_embedding) as similarity
  from public.global_object_baselines b
  where b.visual_embedding is not null
    and (match_lane is null or b.lane = match_lane)
    and (match_family is null or b.object_family = match_family)
    and (1 - (b.visual_embedding <=> query_embedding)) >= min_similarity
  order by b.visual_embedding <=> query_embedding asc
  limit greatest(1, least(50, match_count));
$$;


--
-- Name: migrate_daily_pick_optout_if_absent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.migrate_daily_pick_optout_if_absent(p_line_user_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid text; inserted boolean := false; v timestamptz; found boolean;
BEGIN
  uid := btrim(COALESCE(p_line_user_id, ''));
  IF uid = '' THEN RAISE EXCEPTION 'line_user_id_required'; END IF;

  INSERT INTO public.notification_preferences(line_user_id, daily_pick_optout_at, updated_at)
  VALUES (uid, now(), now())
  ON CONFLICT (line_user_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;

  -- อ่านค่าที่ชนะจริงเสมอ — ถ้ามีแถวอยู่ก่อน (เช่นลูกค้าเพิ่งสั่งเปิดคืน) ค่านั้นคือค่าที่ใช้
  SELECT daily_pick_optout_at, true INTO v, found
    FROM public.notification_preferences WHERE line_user_id = uid;

  RETURN jsonb_build_object(
    'known',    COALESCE(found, false),
    'optedOut', v IS NOT NULL,
    'migrated', inserted
  );
END;
$$;


--
-- Name: new_customer_trial_status(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.new_customer_trial_status(p_line_user_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE cfg jsonb; u public.app_users%ROWTYPE; eligible boolean := false; used integer := 0; pending integer := 0;
BEGIN
  SELECT value INTO cfg FROM public.app_settings WHERE key = 'new_customer_trial';
  IF cfg IS NULL OR jsonb_typeof(cfg->'enabled') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'trial_policy_unavailable';
  END IF;
  IF p_line_user_id IS NOT NULL THEN
    SELECT * INTO u FROM public.app_users WHERE line_user_id = p_line_user_id;
    eligible := u.id IS NOT NULL AND cfg->>'eligible_since' IS NOT NULL
      AND u.created_at >= (cfg->>'eligible_since')::timestamptz;
    IF eligible THEN
      used := public.new_customer_trial_used(u.id);
      SELECT count(*)::integer INTO pending FROM public.scan_jobs j
        WHERE j.app_user_id=u.id AND j.access_source='free'
          AND COALESCE(j.free_access_kind,'daily') <> 'bonus'
          AND j.status NOT IN ('failed','delivered');
    END IF;
  END IF;
  RETURN jsonb_build_object('enabled',(cfg->>'enabled')::boolean,
    'eligible_since',cfg->>'eligible_since','limit',2,'eligible',COALESCE(eligible,false),'used',used,'pending',pending);
END;
$$;


--
-- Name: new_customer_trial_used(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.new_customer_trial_used(p_user uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT count(*)::integer FROM public.scan_jobs j
  WHERE j.app_user_id = p_user AND j.access_source = 'free'
    AND COALESCE(j.free_access_kind, 'daily') NOT LIKE 'bonus%'
    AND j.status <> 'failed'
    AND NOT EXISTS (
      SELECT 1 FROM public.outbound_messages o
      WHERE o.related_job_id = j.id AND o.kind = 'scan_result'
        AND o.status = 'sent' AND o.payload_json->>'skipQuotaDecrement' = 'true'
    );
$$;


--
-- Name: purge_expired_telegram_approval_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_expired_telegram_approval_tokens() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.telegram_approval_tokens WHERE expires_at < now() - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;


--
-- Name: quota_delivery_evidence(public.scan_jobs); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.quota_delivery_evidence(p_job public.scan_jobs) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_job.access_source IS DISTINCT FROM 'paid' OR p_job.app_user_id IS NULL THEN RETURN 'not_paid'; END IF;
  IF COALESCE(p_job.quota_accounting_version, 0) <> 2 THEN RETURN 'not_accountable'; END IF;
  IF p_job.status IS DISTINCT FROM 'delivered' THEN RETURN 'not_delivered'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM outbound_messages o
    WHERE o.related_job_id = p_job.id AND o.kind = 'scan_result' AND o.status = 'sent'
      AND COALESCE(o.payload_json ->> 'skipQuotaDecrement', '') <> 'true'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM outbound_messages o
      WHERE o.related_job_id = p_job.id AND o.kind = 'scan_result' AND o.status = 'sent'
    ) THEN RETURN 'skip_quota'; END IF;
    RETURN 'no_sent_outbound';
  END IF;
  RETURN 'ok';
END;
$$;


--
-- Name: reconcile_missing_quota_ledgers(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconcile_missing_quota_ledgers(p_limit integer DEFAULT 20) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE inserted integer;
BEGIN
  INSERT INTO scan_quota_decrements (job_id, app_user_id)
  SELECT j.id, j.app_user_id
  FROM scan_jobs j
  WHERE j.quota_accounting_version = 2
    AND j.access_source = 'paid'
    AND j.app_user_id IS NOT NULL
    AND j.status = 'delivered'
    AND NOT EXISTS (SELECT 1 FROM scan_quota_decrements l WHERE l.job_id = j.id)
    AND EXISTS (
      SELECT 1 FROM outbound_messages o
      WHERE o.related_job_id = j.id
        AND o.kind = 'scan_result'
        AND o.status = 'sent'
        AND COALESCE(o.payload_json ->> 'skipQuotaDecrement', '') <> 'true'
    )
  ORDER BY j.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  ON CONFLICT (job_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;


--
-- Name: record_payment_approval_audit(uuid, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_payment_approval_audit(p_payment_id uuid, p_channel text, p_actor text, p_action text, p_result text, p_detail jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_channel IS NULL OR p_action IS NULL OR p_result IS NULL THEN
    RAISE EXCEPTION 'audit_fields_required';
  END IF;
  INSERT INTO public.payment_approval_audit(payment_id, channel, actor, action, result, detail)
  VALUES (p_payment_id, p_channel, p_actor, p_action, p_result, COALESCE(p_detail, '{}'::jsonb));
  RETURN true;
END;
$$;


--
-- Name: release_bonus_on_dup_evidence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_bonus_on_dup_evidence() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.kind = 'scan_result' AND NEW.related_job_id IS NOT NULL
     AND NEW.payload_json->>'skipQuotaDecrement' = 'true' THEN
    PERFORM public.release_bonus_reservation(NEW.related_job_id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: release_bonus_reservation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_bonus_reservation(p_job_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE j public.scan_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.scan_jobs WHERE id = p_job_id FOR UPDATE;
  IF j.id IS NULL THEN RETURN 'job_not_found'; END IF;
  IF j.access_source <> 'free' OR j.free_access_kind IS DISTINCT FROM 'bonus_reserved' THEN RETURN 'noop'; END IF;
  IF j.status <> 'failed' AND NOT EXISTS (
    SELECT 1 FROM public.outbound_messages o
    WHERE o.related_job_id = j.id AND o.kind = 'scan_result'
      AND o.payload_json->>'skipQuotaDecrement' = 'true'
  ) THEN RETURN 'no_evidence'; END IF;
  PERFORM 1 FROM public.app_users WHERE id = j.app_user_id FOR UPDATE;
  UPDATE public.app_users SET bonus_scans = bonus_scans + 1 WHERE id = j.app_user_id;
  UPDATE public.scan_jobs SET free_access_kind = 'bonus_released' WHERE id = j.id;
  RETURN 'released';
END;
$$;


--
-- Name: set_daily_pick_optout(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_daily_pick_optout(p_line_user_id text, p_opted_out boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v timestamptz;
BEGIN
  IF p_line_user_id IS NULL OR btrim(p_line_user_id) = '' THEN
    RAISE EXCEPTION 'line_user_id_required';
  END IF;
  IF p_opted_out IS NULL THEN RAISE EXCEPTION 'opted_out_required'; END IF;
  v := CASE WHEN p_opted_out THEN now() ELSE NULL END;
  INSERT INTO public.notification_preferences(line_user_id, daily_pick_optout_at, updated_at)
  VALUES (btrim(p_line_user_id), v, now())
  ON CONFLICT (line_user_id) DO UPDATE
    SET daily_pick_optout_at = EXCLUDED.daily_pick_optout_at, updated_at = now();
  -- อ่านกลับจากแถวที่บันทึกจริง (ไม่ใช่คืนค่าที่ส่งเข้ามา) เพื่อให้ยืนยันได้ว่าเขียนสำเร็จ
  SELECT daily_pick_optout_at INTO v FROM public.notification_preferences
   WHERE line_user_id = btrim(p_line_user_id);
  RETURN v IS NOT NULL;
END;
$$;


--
-- Name: set_footage_clips_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_footage_clips_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_new_customer_trial_policy(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_new_customer_trial_policy(p_enabled boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE cfg jsonb;
BEGIN
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'trial_enabled_required'; END IF;
  SELECT value INTO cfg FROM public.app_settings WHERE key='new_customer_trial' FOR UPDATE;
  IF cfg IS NULL THEN RAISE EXCEPTION 'trial_policy_unavailable'; END IF;
  cfg := jsonb_build_object('enabled',p_enabled,'limit',2,
    'eligible_since',COALESCE(cfg->>'eligible_since',
      CASE WHEN p_enabled THEN clock_timestamp()::text ELSE NULL END));
  UPDATE public.app_settings SET value=cfg,updated_at=now() WHERE key='new_customer_trial';
  RETURN cfg;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_video_jobs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_video_jobs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_visual_assets_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_visual_assets_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: sweep_bonus_releases(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sweep_bonus_releases(p_limit integer DEFAULT 50) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE n integer := 0; r record;
BEGIN
  FOR r IN
    SELECT j.id FROM public.scan_jobs j
    WHERE j.access_source = 'free' AND j.free_access_kind = 'bonus_reserved'
      AND (j.status = 'failed' OR EXISTS (
        SELECT 1 FROM public.outbound_messages o
        WHERE o.related_job_id = j.id AND o.kind = 'scan_result'
          AND o.payload_json->>'skipQuotaDecrement' = 'true'))
    ORDER BY j.created_at LIMIT GREATEST(1, LEAST(p_limit, 500))
  LOOP
    IF public.release_bonus_reservation(r.id) = 'released' THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_
        -- Filter by action early - only get subscriptions interested in this action
        -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
        and (subs.action_filter = '*' or subs.action_filter = action::text);

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL AND ppt.tablename NOT LIKE '% %'),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  -- Count raw slot entries before apply_rls/subscription filter
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  -- Apply RLS and filter as before
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  -- Real rows with slot count attached
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  -- Sentinel row: always returned when no real rows exist so Elixir can
  -- always read slot_changes_count. Identified by wal IS NULL.
  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: amulet_type_examples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.amulet_type_examples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type_key text NOT NULL,
    embedding public.vector(384) NOT NULL,
    image_path text,
    source_baseline_id uuid,
    source text DEFAULT 'upload'::text NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT amulet_type_examples_source_check CHECK ((source = ANY (ARRAY['upload'::text, 'library'::text, 'suggested'::text]))),
    CONSTRAINT amulet_type_examples_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'rejected'::text])))
);


--
-- Name: amulet_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.amulet_types (
    type_key text NOT NULL,
    label_thai text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: COLUMN app_users.bonus_scans; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_users.bonus_scans IS 'สิทธิ์สแกนโบนัส (จากชวนเพื่อน) — ใช้เมื่อฟรีรายวันหมด ไม่ใช่สถานะจ่ายเงิน';


--
-- Name: banned_users; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: banned_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.banned_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: banned_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.banned_users_id_seq OWNED BY public.banned_users.id;


--
-- Name: conversation_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_state (
    line_user_id text NOT NULL,
    app_user_id uuid NOT NULL,
    flow_state text,
    payment_state text,
    pending_upload_id uuid,
    selected_package_key text,
    birthdate_change_state text,
    reply_token_spent boolean DEFAULT false NOT NULL,
    pending_approved_intro_compensation jsonb,
    last_inbound_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: energy_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.energy_categories (
    id bigint NOT NULL,
    code text NOT NULL,
    name_th text NOT NULL,
    display_name_th text NOT NULL,
    short_name_th text,
    description_th text,
    tone_default text DEFAULT 'hard'::text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE energy_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.energy_categories IS 'Primary energy themes: system key (code), display labels, default tone.';


--
-- Name: energy_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.energy_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: energy_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.energy_categories_id_seq OWNED BY public.energy_categories.id;


--
-- Name: energy_copy_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.energy_copy_templates (
    id bigint NOT NULL,
    category_code text NOT NULL,
    object_family text DEFAULT 'all'::text NOT NULL,
    copy_type text NOT NULL,
    tone text DEFAULT 'hard'::text NOT NULL,
    text_th text NOT NULL,
    weight integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    presentation_angle text,
    cluster_tag text,
    fallback_level integer DEFAULT 0 NOT NULL,
    visible_tone text
);


--
-- Name: TABLE energy_copy_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.energy_copy_templates IS 'Headline / fit_line / bullet lines per category × object_family × tone; editable without deploy.';


--
-- Name: COLUMN energy_copy_templates.object_family; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energy_copy_templates.object_family IS 'all | thai_amulet | thai_talisman | crystal | global_symbol';


--
-- Name: COLUMN energy_copy_templates.copy_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energy_copy_templates.copy_type IS 'headline | fit_line | bullet';


--
-- Name: COLUMN energy_copy_templates.presentation_angle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energy_copy_templates.presentation_angle IS 'Flex/report angle id (e.g. shield, filter). Null = family-wide row for this slot.';


--
-- Name: COLUMN energy_copy_templates.cluster_tag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energy_copy_templates.cluster_tag IS 'Semantic cluster for anti-repeat (e.g. sem:protection, sem:ground).';


--
-- Name: COLUMN energy_copy_templates.fallback_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energy_copy_templates.fallback_level IS 'Lower = higher priority within the same angle/family match; use for staged DB fallbacks.';


--
-- Name: COLUMN energy_copy_templates.visible_tone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energy_copy_templates.visible_tone IS 'plain_th | warm | concise | default; null matches any.';


--
-- Name: energy_copy_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.energy_copy_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: energy_copy_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.energy_copy_templates_id_seq OWNED BY public.energy_copy_templates.id;


--
-- Name: fb_showcase_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fb_showcase_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    line_user_id text NOT NULL,
    public_token text NOT NULL,
    source text DEFAULT 'customer'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    caption text,
    fb_post_id text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    posted_at timestamp with time zone
);


--
-- Name: TABLE fb_showcase_queue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fb_showcase_queue IS 'คิวโพสต์การ์ดอวดพระขึ้นเพจ Facebook (ต้องมี consent จากลูกค้า หรือเป็นชิ้นจากคลังเจ้าของระบบเท่านั้น)';


--
-- Name: footage_clips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.footage_clips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    temple_name text,
    clip_type text NOT NULL,
    scene_label text,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    duration_sec numeric,
    width integer,
    height integer,
    fps numeric,
    has_audio boolean DEFAULT false NOT NULL,
    ambient_audio_enabled boolean DEFAULT true NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT footage_clips_clip_type_check CHECK ((clip_type = ANY (ARRAY['temple_exterior'::text, 'buddha_image'::text, 'incense'::text, 'walking'::text, 'market'::text, 'amulet_table'::text, 'generic_spiritual'::text]))),
    CONSTRAINT footage_clips_status_check CHECK ((status = ANY (ARRAY['active'::text, 'hidden'::text, 'deleted'::text])))
);


--
-- Name: global_object_baselines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_object_baselines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_sha256 text,
    image_phash text,
    stable_feature_seed text,
    lane text NOT NULL,
    object_family text NOT NULL,
    baseline_schema_version integer DEFAULT 1 NOT NULL,
    prompt_version text,
    scoring_version text,
    object_baseline_json jsonb NOT NULL,
    axis_scores_json jsonb,
    peak_power_key text,
    thumbnail_path text,
    source_scan_result_v2_id uuid,
    source_upload_id uuid,
    confidence numeric DEFAULT 1,
    reuse_count integer DEFAULT 0 NOT NULL,
    last_reused_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    object_group_id uuid,
    is_enrolled boolean DEFAULT false NOT NULL,
    view_count integer DEFAULT 1 NOT NULL,
    locked_axis_scores_json jsonb,
    image_embedding public.vector(1536),
    embedding_model text,
    embedding_version text,
    embedding_descriptor text,
    visual_embedding public.vector(384),
    visual_embedding_model text
);


--
-- Name: TABLE global_object_baselines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.global_object_baselines IS 'Object-only scan baseline for reuse across LINE accounts (allowlist JSON). No owner overlay / tokens.';


--
-- Name: COLUMN global_object_baselines.image_embedding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.global_object_baselines.image_embedding IS 'Angle-robust semantic fingerprint (descriptor -> text embedding). Used for same-object NN reuse.';


--
-- Name: COLUMN global_object_baselines.visual_embedding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.global_object_baselines.visual_embedding IS 'DINOv2 ViT-S/14 image embedding of the rembg-cropped object (L2-normalized). Recall filter for LightGlue re-id.';


--
-- Name: kb_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_type text DEFAULT 'knowledge'::text NOT NULL,
    title text NOT NULL,
    question_patterns text DEFAULT ''::text NOT NULL,
    answer text NOT NULL,
    tags text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kb_entries_entry_type_check CHECK ((entry_type = ANY (ARRAY['faq'::text, 'knowledge'::text]))),
    CONSTRAINT kb_entries_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);


--
-- Name: liff_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liff_profiles (
    line_user_id text NOT NULL,
    display_name text,
    nickname text,
    phone text,
    birthdate date,
    birth_time text,
    gender text,
    interest text,
    channel text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: line_conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.line_conversation_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    line_user_id text NOT NULL,
    role text NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata_json jsonb,
    CONSTRAINT line_conversation_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'bot'::text])))
);


--
-- Name: TABLE line_conversation_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.line_conversation_messages IS 'Recent user/bot text bubbles for conversation context (e.g. Gemini planner/phrasing).';


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    line_user_id text NOT NULL,
    daily_pick_optout_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_preferences IS 'ความต้องการรับแจ้งเตือนอัตโนมัติต่อผู้ใช้ — เก็บถาวร ไม่มีวันหมดอายุเอง (แจ้งเตือนธุรกรรมไม่เกี่ยวกับตารางนี้)';


--
-- Name: object_family_category_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.object_family_category_map (
    id bigint NOT NULL,
    object_family text NOT NULL,
    category_code text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE object_family_category_map; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.object_family_category_map IS 'Suggested category emphasis order per object family (e.g. crystal vs thai amulet).';


--
-- Name: object_family_category_map_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.object_family_category_map_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: object_family_category_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.object_family_category_map_id_seq OWNED BY public.object_family_category_map.id;


--
-- Name: object_owner_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.object_owner_info (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    line_user_id text NOT NULL,
    scan_result_id text,
    object_key text NOT NULL,
    lane text,
    raw_text text,
    object_name text,
    temple text,
    era_year text,
    stone_type text,
    purpose text,
    origin_story text,
    parse_confidence numeric,
    conflict_flag boolean DEFAULT false NOT NULL,
    unknown boolean DEFAULT false NOT NULL,
    skipped boolean DEFAULT false NOT NULL,
    source text DEFAULT 'owner'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    normalized_tag text
);


--
-- Name: payment_approval_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_approval_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    channel text NOT NULL,
    actor text,
    action text NOT NULL,
    result text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_entitlement_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_entitlement_grants (
    payment_id uuid NOT NULL,
    app_user_id uuid NOT NULL,
    line_user_id text,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_plan_code text NOT NULL,
    scans_added integer NOT NULL,
    carry_over integer DEFAULT 0 NOT NULL,
    paid_until timestamp with time zone NOT NULL,
    channel text NOT NULL,
    actor text,
    notified_at timestamp with time zone
);


--
-- Name: payment_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_notifications (
    payment_id uuid NOT NULL,
    line_user_id text NOT NULL,
    notify_status text DEFAULT 'queued'::text NOT NULL,
    pending_intro_queued boolean DEFAULT false NOT NULL,
    last_attempt_at timestamp with time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error_code text,
    last_error_message text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_notifications_notify_status_check CHECK ((notify_status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'retry_wait'::text, 'failed'::text])))
);


--
-- Name: payment_slips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_slips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    slip_hash text,
    slip_expires_at timestamp with time zone NOT NULL,
    slip_deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE payment_slips; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_slips IS 'Slip image retention; payments.* keeps financial truth after raw image deleted.';


--
-- Name: COLUMN payment_slips.slip_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_slips.slip_hash IS 'Optional digest of slip image for audit/dedupe.';


--
-- Name: COLUMN payment_slips.slip_expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_slips.slip_expires_at IS 'After this time worker may delete raw slip from storage.';


--
-- Name: COLUMN payment_slips.slip_deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_slips.slip_deleted_at IS 'Set when slip object removed from bucket; slip_url on payments may be cleared by app.';


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    scan_request_id uuid,
    provider text DEFAULT 'promptpay_manual'::text NOT NULL,
    amount integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'THB'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    slip_image_url text,
    provider_payment_id text,
    paid_at timestamp with time zone,
    unlock_hours integer DEFAULT 24 NOT NULL,
    unlocked_until timestamp with time zone,
    verified_by text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_reference_no text,
    qr_base64 text,
    line_user_id text,
    package_code text,
    package_name text,
    expected_amount integer,
    slip_url text,
    slip_message_id text,
    verified_at timestamp with time zone,
    rejected_at timestamp with time zone,
    reject_reason text,
    approved_by text,
    payment_ref text,
    slip_ref text,
    slip_amount numeric,
    slip_transferred_at timestamp with time zone,
    slip_receiver_name text,
    slip_receiver_account_last4 text,
    slip_receiver_promptpay text,
    slip_sender_name text,
    slip_bank_name text,
    slip_ocr_confidence numeric,
    slip_ocr_raw_text text,
    slip_verify_status text,
    slip_review_reason text,
    auto_approved_at timestamp with time zone,
    manual_review_at timestamp with time zone,
    slip_verify_provider text DEFAULT 'internal_vision'::text
);


--
-- Name: COLUMN payments.payment_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.payment_ref IS 'Customer-visible ref (PAY-xxxxxxxx), unique when set';


--
-- Name: persona_ab_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persona_ab_assignments (
    line_user_id text NOT NULL,
    persona_variant text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_session_key text DEFAULT '__idle__'::text NOT NULL
);


--
-- Name: TABLE persona_ab_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.persona_ab_assignments IS 'Sticky LINE user -> persona variant (never rotated by optimizer).';


--
-- Name: COLUMN persona_ab_assignments.payment_session_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.persona_ab_assignments.payment_session_key IS 'payments.id while awaiting_payment/pending_verify; __idle__ when no active payment row.';


--
-- Name: persona_ab_funnel_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persona_ab_funnel_daily (
    variant text NOT NULL,
    bucket_date date NOT NULL,
    paywall_shown bigint DEFAULT 0 NOT NULL,
    payment_intent bigint DEFAULT 0 NOT NULL,
    payment_success bigint DEFAULT 0 NOT NULL,
    paywall_shown_deduped bigint DEFAULT 0 NOT NULL,
    payment_intent_deduped bigint DEFAULT 0 NOT NULL,
    slip_uploaded_raw bigint DEFAULT 0 NOT NULL,
    slip_uploaded_deduped bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE persona_ab_funnel_daily; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.persona_ab_funnel_daily IS 'Per-variant funnel counts per calendar day for rolling-window + recency-weighted recompute.';


--
-- Name: persona_ab_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persona_ab_stats (
    variant text NOT NULL,
    paywall_shown bigint DEFAULT 0 NOT NULL,
    payment_intent bigint DEFAULT 0 NOT NULL,
    payment_success bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paywall_shown_deduped bigint DEFAULT 0 NOT NULL,
    payment_intent_deduped bigint DEFAULT 0 NOT NULL,
    slip_uploaded_raw bigint DEFAULT 0 NOT NULL,
    slip_uploaded_deduped bigint DEFAULT 0 NOT NULL
);


--
-- Name: TABLE persona_ab_stats; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.persona_ab_stats IS 'Aggregated funnel counts per variant for recomputeWeights.';


--
-- Name: COLUMN persona_ab_stats.paywall_shown; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.persona_ab_stats.paywall_shown IS 'Raw paywall_shown events (one per log line).';


--
-- Name: COLUMN persona_ab_stats.payment_intent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.persona_ab_stats.payment_intent IS 'Raw payment_intent events.';


--
-- Name: COLUMN persona_ab_stats.payment_success; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.persona_ab_stats.payment_success IS 'Raw payment_success only (no dedupe variant).';


--
-- Name: COLUMN persona_ab_stats.paywall_shown_deduped; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.persona_ab_stats.paywall_shown_deduped IS 'Deduped paywall_shown (first per funnel key in window / payment scope).';


--
-- Name: COLUMN persona_ab_stats.payment_intent_deduped; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.persona_ab_stats.payment_intent_deduped IS 'Deduped payment_intent.';


--
-- Name: COLUMN persona_ab_stats.slip_uploaded_raw; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.persona_ab_stats.slip_uploaded_raw IS 'Raw slip_uploaded events.';


--
-- Name: COLUMN persona_ab_stats.slip_uploaded_deduped; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.persona_ab_stats.slip_uploaded_deduped IS 'Deduped slip_uploaded.';


--
-- Name: persona_ab_weights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persona_ab_weights (
    id smallint DEFAULT 1 NOT NULL,
    weights jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT persona_ab_weights_singleton CHECK ((id = 1))
);


--
-- Name: TABLE persona_ab_weights; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.persona_ab_weights IS 'Single row (id=1): current traffic weights per variant letter.';


--
-- Name: referral_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_codes (
    code text NOT NULL,
    line_user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referral_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    referrer_line_user_id text NOT NULL,
    friend_line_user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: report_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_publications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scan_result_id uuid NOT NULL,
    status text NOT NULL,
    public_token text NOT NULL,
    report_url text,
    rendered_html_path text,
    expires_at timestamp with time zone,
    published_at timestamp with time zone,
    last_error_code text,
    last_error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_publications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'rendering'::text, 'published'::text, 'failed'::text, 'expired'::text])))
);


--
-- Name: TABLE report_publications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.report_publications IS 'Web-primary result surface: publication state independent of LINE outbound delivery.';


--
-- Name: COLUMN report_publications.scan_result_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report_publications.scan_result_id IS 'FK to scan_results_v2.id — canonical row for V2 async worker output per scan_jobs.';


--
-- Name: scan_image_phashes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scan_image_phashes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_phash text NOT NULL,
    scan_result_id uuid NOT NULL,
    report_url text,
    line_user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scan_public_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scan_public_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scan_result_id uuid NOT NULL,
    public_token text NOT NULL,
    report_payload jsonb NOT NULL,
    report_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE scan_public_reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.scan_public_reports IS 'LINE scan result: public token + JSON payload for /r/:token HTML report';


--
-- Name: scan_quota_decrements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scan_quota_decrements (
    job_id uuid NOT NULL,
    app_user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT scan_quota_decrements_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text])))
);


--
-- Name: scan_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scan_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    request_status text DEFAULT 'pending'::text NOT NULL,
    flow_version integer,
    scan_job_id text,
    birthdate_used text,
    used_saved_birthdate boolean DEFAULT false NOT NULL,
    request_source text DEFAULT 'line'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scan_result_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scan_result_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_hash text NOT NULL,
    birthdate text NOT NULL,
    prompt_version text DEFAULT 'v1'::text NOT NULL,
    result_text text NOT NULL,
    object_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_hit_at timestamp with time zone,
    hit_count integer DEFAULT 0 NOT NULL,
    object_category text,
    object_category_source text,
    dominant_color text,
    dominant_color_source text
);


--
-- Name: COLUMN scan_result_cache.object_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scan_result_cache.object_category IS 'Thai label from classifyObjectCategory (fresh or cache_classify heal)';


--
-- Name: COLUMN scan_result_cache.object_category_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scan_result_cache.object_category_source IS 'deep_scan | cache_classify';


--
-- Name: COLUMN scan_result_cache.dominant_color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scan_result_cache.dominant_color IS 'Slug from reportPipelineDominantColor v1; omit unknown';


--
-- Name: COLUMN scan_result_cache.dominant_color_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scan_result_cache.dominant_color_source IS 'vision_v1 when persisted from pixel pipeline';


--
-- Name: scan_results; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: COLUMN scan_results.quality_analytics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scan_results.quality_analytics IS 'Ener deep-scan quality snapshot: score_before/after, delta, improve flags, skip reason, latency_ms (see deepScanQualityAnalytics.service.js)';


--
-- Name: scan_results_v2; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: scan_uploads; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: COLUMN scan_uploads.original_expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scan_uploads.original_expires_at IS 'Free tier: delete original object bytes at/after this time if not is_pinned.';


--
-- Name: COLUMN scan_uploads.thumbnail_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scan_uploads.thumbnail_path IS 'Optional long-retention thumbnail in storage (library UI); worker must not delete.';


--
-- Name: COLUMN scan_uploads.is_pinned; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scan_uploads.is_pinned IS 'User pinned full-res original; excluded from free-tier original purge until unpinned.';


--
-- Name: COLUMN scan_uploads.storage_tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scan_uploads.storage_tier IS 'free | paid_future — reserved for paid storage plans.';


--
-- Name: COLUMN scan_uploads.original_deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scan_uploads.original_deleted_at IS 'Set when raw original file removed from bucket; payload/thumb unchanged.';


--
-- Name: telegram_approval_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_approval_tokens (
    token text NOT NULL,
    payment_id uuid NOT NULL,
    kind text NOT NULL,
    snapshot_amount numeric,
    snapshot_package_code text,
    snapshot_status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    used_by_tg_user_id text,
    CONSTRAINT telegram_approval_tokens_kind_check CHECK ((kind = 'confirm'::text))
);


--
-- Name: user_entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_entitlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    app_user_id uuid,
    entitlement_key text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_page_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_page_tokens (
    id bigint NOT NULL,
    line_user_id text NOT NULL,
    purpose text NOT NULL,
    token_hash text NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_page_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_page_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_page_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_page_tokens_id_seq OWNED BY public.user_page_tokens.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    birthdate text,
    updated_at timestamp with time zone
);


--
-- Name: video_job_visual_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_job_visual_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_job_id uuid NOT NULL,
    visual_asset_id uuid NOT NULL,
    insert_position text NOT NULL,
    duration_sec numeric DEFAULT 3 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_job_visual_assets_insert_position_check CHECK ((insert_position = ANY (ARRAY['intro'::text, 'middle'::text, 'before_cta'::text, 'outro'::text])))
);


--
-- Name: video_pipeline_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_pipeline_settings (
    key text NOT NULL,
    value boolean DEFAULT false NOT NULL
);


--
-- Name: visual_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_job_id uuid,
    content_session_id uuid,
    asset_type text NOT NULL,
    prompt_text text NOT NULL,
    storage_bucket text,
    storage_path text,
    asset_url text,
    status text DEFAULT 'queued'::text NOT NULL,
    generation_provider text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visual_assets_asset_type_check CHECK ((asset_type = ANY (ARRAY['opening_card'::text, 'transition_card'::text, 'explainer_card'::text, 'cta_card'::text, 'product_support'::text, 'motion_background'::text]))),
    CONSTRAINT visual_assets_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'generating'::text, 'ready'::text, 'failed'::text, 'rejected'::text, 'used'::text])))
);


--
-- Name: banned_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_users ALTER COLUMN id SET DEFAULT nextval('public.banned_users_id_seq'::regclass);


--
-- Name: energy_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energy_categories ALTER COLUMN id SET DEFAULT nextval('public.energy_categories_id_seq'::regclass);


--
-- Name: energy_copy_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energy_copy_templates ALTER COLUMN id SET DEFAULT nextval('public.energy_copy_templates_id_seq'::regclass);


--
-- Name: object_family_category_map id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_family_category_map ALTER COLUMN id SET DEFAULT nextval('public.object_family_category_map_id_seq'::regclass);


--
-- Name: user_page_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_page_tokens ALTER COLUMN id SET DEFAULT nextval('public.user_page_tokens_id_seq'::regclass);


--
-- Name: amulet_type_examples amulet_type_examples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amulet_type_examples
    ADD CONSTRAINT amulet_type_examples_pkey PRIMARY KEY (id);


--
-- Name: amulet_types amulet_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amulet_types
    ADD CONSTRAINT amulet_types_pkey PRIMARY KEY (type_key);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: banned_users banned_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_users
    ADD CONSTRAINT banned_users_pkey PRIMARY KEY (id);


--
-- Name: conversation_state conversation_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_state
    ADD CONSTRAINT conversation_state_pkey PRIMARY KEY (line_user_id);


--
-- Name: energy_categories energy_categories_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energy_categories
    ADD CONSTRAINT energy_categories_code_key UNIQUE (code);


--
-- Name: energy_categories energy_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energy_categories
    ADD CONSTRAINT energy_categories_pkey PRIMARY KEY (id);


--
-- Name: energy_copy_templates energy_copy_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energy_copy_templates
    ADD CONSTRAINT energy_copy_templates_pkey PRIMARY KEY (id);


--
-- Name: fb_showcase_queue fb_showcase_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fb_showcase_queue
    ADD CONSTRAINT fb_showcase_queue_pkey PRIMARY KEY (id);


--
-- Name: footage_clips footage_clips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.footage_clips
    ADD CONSTRAINT footage_clips_pkey PRIMARY KEY (id);


--
-- Name: global_object_baselines global_object_baselines_image_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_object_baselines
    ADD CONSTRAINT global_object_baselines_image_sha256_key UNIQUE (image_sha256);


--
-- Name: global_object_baselines global_object_baselines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_object_baselines
    ADD CONSTRAINT global_object_baselines_pkey PRIMARY KEY (id);


--
-- Name: kb_entries kb_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_entries
    ADD CONSTRAINT kb_entries_pkey PRIMARY KEY (id);


--
-- Name: kb_entries kb_entries_title_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_entries
    ADD CONSTRAINT kb_entries_title_key UNIQUE (title);


--
-- Name: liff_profiles liff_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liff_profiles
    ADD CONSTRAINT liff_profiles_pkey PRIMARY KEY (line_user_id);


--
-- Name: line_conversation_messages line_conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.line_conversation_messages
    ADD CONSTRAINT line_conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (line_user_id);


--
-- Name: object_family_category_map object_family_category_map_object_family_category_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_family_category_map
    ADD CONSTRAINT object_family_category_map_object_family_category_code_key UNIQUE (object_family, category_code);


--
-- Name: object_family_category_map object_family_category_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_family_category_map
    ADD CONSTRAINT object_family_category_map_pkey PRIMARY KEY (id);


--
-- Name: object_owner_info object_owner_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_owner_info
    ADD CONSTRAINT object_owner_info_pkey PRIMARY KEY (id);


--
-- Name: payment_approval_audit payment_approval_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_approval_audit
    ADD CONSTRAINT payment_approval_audit_pkey PRIMARY KEY (id);


--
-- Name: payment_entitlement_grants payment_entitlement_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_entitlement_grants
    ADD CONSTRAINT payment_entitlement_grants_pkey PRIMARY KEY (payment_id);


--
-- Name: payment_notifications payment_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_notifications
    ADD CONSTRAINT payment_notifications_pkey PRIMARY KEY (payment_id);


--
-- Name: payment_slips payment_slips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_slips
    ADD CONSTRAINT payment_slips_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: persona_ab_assignments persona_ab_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_ab_assignments
    ADD CONSTRAINT persona_ab_assignments_pkey PRIMARY KEY (line_user_id, payment_session_key);


--
-- Name: persona_ab_funnel_daily persona_ab_funnel_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_ab_funnel_daily
    ADD CONSTRAINT persona_ab_funnel_daily_pkey PRIMARY KEY (variant, bucket_date);


--
-- Name: persona_ab_stats persona_ab_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_ab_stats
    ADD CONSTRAINT persona_ab_stats_pkey PRIMARY KEY (variant);


--
-- Name: persona_ab_weights persona_ab_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_ab_weights
    ADD CONSTRAINT persona_ab_weights_pkey PRIMARY KEY (id);


--
-- Name: referral_codes referral_codes_line_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_line_user_id_key UNIQUE (line_user_id);


--
-- Name: referral_codes referral_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_pkey PRIMARY KEY (code);


--
-- Name: referral_redemptions referral_redemptions_friend_line_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_redemptions
    ADD CONSTRAINT referral_redemptions_friend_line_user_id_key UNIQUE (friend_line_user_id);


--
-- Name: referral_redemptions referral_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_redemptions
    ADD CONSTRAINT referral_redemptions_pkey PRIMARY KEY (id);


--
-- Name: report_publications report_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_publications
    ADD CONSTRAINT report_publications_pkey PRIMARY KEY (id);


--
-- Name: report_publications report_publications_public_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_publications
    ADD CONSTRAINT report_publications_public_token_key UNIQUE (public_token);


--
-- Name: report_publications report_publications_scan_result_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_publications
    ADD CONSTRAINT report_publications_scan_result_id_key UNIQUE (scan_result_id);


--
-- Name: scan_image_phashes scan_image_phashes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_image_phashes
    ADD CONSTRAINT scan_image_phashes_pkey PRIMARY KEY (id);


--
-- Name: scan_jobs scan_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_jobs
    ADD CONSTRAINT scan_jobs_pkey PRIMARY KEY (id);


--
-- Name: scan_public_reports scan_public_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_public_reports
    ADD CONSTRAINT scan_public_reports_pkey PRIMARY KEY (id);


--
-- Name: scan_public_reports scan_public_reports_public_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_public_reports
    ADD CONSTRAINT scan_public_reports_public_token_key UNIQUE (public_token);


--
-- Name: scan_public_reports scan_public_reports_scan_result_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_public_reports
    ADD CONSTRAINT scan_public_reports_scan_result_id_key UNIQUE (scan_result_id);


--
-- Name: scan_quota_decrements scan_quota_decrements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_quota_decrements
    ADD CONSTRAINT scan_quota_decrements_pkey PRIMARY KEY (job_id);


--
-- Name: scan_requests scan_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_requests
    ADD CONSTRAINT scan_requests_pkey PRIMARY KEY (id);


--
-- Name: scan_result_cache scan_result_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_result_cache
    ADD CONSTRAINT scan_result_cache_pkey PRIMARY KEY (id);


--
-- Name: scan_results scan_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_results
    ADD CONSTRAINT scan_results_pkey PRIMARY KEY (id);


--
-- Name: scan_results_v2 scan_results_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_results_v2
    ADD CONSTRAINT scan_results_v2_pkey PRIMARY KEY (id);


--
-- Name: scan_uploads scan_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_uploads
    ADD CONSTRAINT scan_uploads_pkey PRIMARY KEY (id);


--
-- Name: telegram_approval_tokens telegram_approval_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_approval_tokens
    ADD CONSTRAINT telegram_approval_tokens_pkey PRIMARY KEY (token);


--
-- Name: fb_showcase_queue uq_fb_showcase_queue_token; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fb_showcase_queue
    ADD CONSTRAINT uq_fb_showcase_queue_token UNIQUE (public_token);


--
-- Name: payment_slips uq_payment_slips_payment_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_slips
    ADD CONSTRAINT uq_payment_slips_payment_id UNIQUE (payment_id);


--
-- Name: user_entitlements user_entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_entitlements
    ADD CONSTRAINT user_entitlements_pkey PRIMARY KEY (id);


--
-- Name: user_page_tokens user_page_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_page_tokens
    ADD CONSTRAINT user_page_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_page_tokens user_page_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_page_tokens
    ADD CONSTRAINT user_page_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: video_job_visual_assets video_job_visual_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_job_visual_assets
    ADD CONSTRAINT video_job_visual_assets_pkey PRIMARY KEY (id);


--
-- Name: video_jobs video_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_jobs
    ADD CONSTRAINT video_jobs_pkey PRIMARY KEY (id);


--
-- Name: video_pipeline_settings video_pipeline_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_pipeline_settings
    ADD CONSTRAINT video_pipeline_settings_pkey PRIMARY KEY (key);


--
-- Name: visual_assets visual_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visual_assets
    ADD CONSTRAINT visual_assets_pkey PRIMARY KEY (id);


--
-- Name: footage_clips_clip_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX footage_clips_clip_type_idx ON public.footage_clips USING btree (clip_type);


--
-- Name: footage_clips_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX footage_clips_status_idx ON public.footage_clips USING btree (status);


--
-- Name: footage_clips_temple_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX footage_clips_temple_name_idx ON public.footage_clips USING btree (temple_name);


--
-- Name: idx_amulet_type_examples_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_amulet_type_examples_embedding ON public.amulet_type_examples USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='10');


--
-- Name: idx_amulet_type_examples_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_amulet_type_examples_type ON public.amulet_type_examples USING btree (type_key, status);


--
-- Name: idx_app_users_line_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_users_line_user_id ON public.app_users USING btree (line_user_id);


--
-- Name: idx_banned_users_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_banned_users_active ON public.banned_users USING btree (line_user_id) WHERE (unbanned_at IS NULL);


--
-- Name: idx_banned_users_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banned_users_uid ON public.banned_users USING btree (line_user_id);


--
-- Name: idx_energy_categories_active_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_energy_categories_active_priority ON public.energy_categories USING btree (is_active, priority);


--
-- Name: idx_energy_copy_templates_copy_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_energy_copy_templates_copy_type ON public.energy_copy_templates USING btree (category_code, copy_type, tone, is_active);


--
-- Name: idx_energy_copy_templates_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_energy_copy_templates_lookup ON public.energy_copy_templates USING btree (category_code, object_family, tone, is_active);


--
-- Name: idx_energy_copy_templates_presentation_angle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_energy_copy_templates_presentation_angle ON public.energy_copy_templates USING btree (category_code, object_family, tone, is_active, presentation_angle);


--
-- Name: idx_fb_showcase_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fb_showcase_queue_status ON public.fb_showcase_queue USING btree (status, created_at);


--
-- Name: idx_global_object_baselines_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_global_object_baselines_embedding ON public.global_object_baselines USING ivfflat (image_embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_global_object_baselines_image_phash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_global_object_baselines_image_phash ON public.global_object_baselines USING btree (image_phash);


--
-- Name: idx_global_object_baselines_lane_family; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_global_object_baselines_lane_family ON public.global_object_baselines USING btree (lane, object_family);


--
-- Name: idx_global_object_baselines_object_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_global_object_baselines_object_group ON public.global_object_baselines USING btree (object_group_id);


--
-- Name: idx_global_object_baselines_stable_seed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_global_object_baselines_stable_seed ON public.global_object_baselines USING btree (stable_feature_seed);


--
-- Name: idx_global_object_baselines_visual_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_global_object_baselines_visual_embedding ON public.global_object_baselines USING ivfflat (visual_embedding public.vector_cosine_ops) WITH (lists='20');


--
-- Name: idx_kb_entries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_entries_status ON public.kb_entries USING btree (status);


--
-- Name: idx_line_conversation_messages_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_line_conversation_messages_user_created ON public.line_conversation_messages USING btree (line_user_id, created_at DESC);


--
-- Name: idx_object_family_category_map_family; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_object_family_category_map_family ON public.object_family_category_map USING btree (object_family, is_active, priority);


--
-- Name: idx_object_owner_info_user_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_object_owner_info_user_key ON public.object_owner_info USING btree (line_user_id, object_key);


--
-- Name: idx_outbound_messages_line_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_messages_line_user_created ON public.outbound_messages USING btree (line_user_id, created_at DESC);


--
-- Name: idx_outbound_messages_ready; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_messages_ready ON public.outbound_messages USING btree (status, priority, next_retry_at NULLS FIRST, created_at);


--
-- Name: idx_payment_approval_audit_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_approval_audit_payment ON public.payment_approval_audit USING btree (payment_id, created_at DESC);


--
-- Name: idx_payment_grants_pending_notify; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_grants_pending_notify ON public.payment_entitlement_grants USING btree (granted_at) WHERE (notified_at IS NULL);


--
-- Name: idx_payment_slips_expires_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_slips_expires_pending ON public.payment_slips USING btree (slip_expires_at) WHERE (slip_deleted_at IS NULL);


--
-- Name: idx_payments_line_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_line_user_id_created_at ON public.payments USING btree (line_user_id, created_at DESC);


--
-- Name: idx_payments_payment_ref_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payments_payment_ref_unique ON public.payments USING btree (payment_ref) WHERE (payment_ref IS NOT NULL);


--
-- Name: idx_payments_provider_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_provider_payment_id ON public.payments USING btree (provider_payment_id);


--
-- Name: idx_payments_provider_reference_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_provider_reference_no ON public.payments USING btree (provider_reference_no);


--
-- Name: idx_payments_slip_ref_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payments_slip_ref_unique ON public.payments USING btree (slip_ref) WHERE (slip_ref IS NOT NULL);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_payments_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_user_id_created_at ON public.payments USING btree (user_id, created_at DESC);


--
-- Name: idx_persona_ab_assignments_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persona_ab_assignments_session ON public.persona_ab_assignments USING btree (payment_session_key);


--
-- Name: idx_persona_ab_assignments_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persona_ab_assignments_variant ON public.persona_ab_assignments USING btree (persona_variant);


--
-- Name: idx_persona_ab_funnel_daily_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persona_ab_funnel_daily_date ON public.persona_ab_funnel_daily USING btree (bucket_date);


--
-- Name: idx_referral_redemptions_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_redemptions_referrer ON public.referral_redemptions USING btree (referrer_line_user_id, created_at);


--
-- Name: idx_report_publications_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_publications_expires_at ON public.report_publications USING btree (expires_at);


--
-- Name: idx_report_publications_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_publications_status_created ON public.report_publications USING btree (status, created_at DESC);


--
-- Name: idx_scan_image_phashes_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_image_phashes_user_created ON public.scan_image_phashes USING btree (line_user_id, created_at DESC);


--
-- Name: idx_scan_jobs_line_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_jobs_line_user_created ON public.scan_jobs USING btree (line_user_id, created_at DESC);


--
-- Name: idx_scan_jobs_queued_process_after; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_jobs_queued_process_after ON public.scan_jobs USING btree (status, process_after);


--
-- Name: idx_scan_jobs_status_priority_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_jobs_status_priority_created ON public.scan_jobs USING btree (status, priority, created_at);


--
-- Name: idx_scan_jobs_trial_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_jobs_trial_usage ON public.scan_jobs USING btree (app_user_id) WHERE ((access_source = 'free'::text) AND (status <> 'failed'::text));


--
-- Name: idx_scan_public_reports_public_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_public_reports_public_token ON public.scan_public_reports USING btree (public_token);


--
-- Name: idx_scan_quota_decrements_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_quota_decrements_pending ON public.scan_quota_decrements USING btree (created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_scan_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_requests_status ON public.scan_requests USING btree (request_status);


--
-- Name: idx_scan_requests_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_requests_user_id_created_at ON public.scan_requests USING btree (user_id, created_at DESC);


--
-- Name: idx_scan_result_cache_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_scan_result_cache_lookup ON public.scan_result_cache USING btree (image_hash, birthdate, prompt_version);


--
-- Name: idx_scan_results_quality_analytics_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_results_quality_analytics_gin ON public.scan_results USING gin (quality_analytics jsonb_path_ops);


--
-- Name: idx_scan_results_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_results_request_id ON public.scan_results USING btree (scan_request_id);


--
-- Name: idx_scan_results_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_results_user_id_created_at ON public.scan_results USING btree (user_id, created_at DESC);


--
-- Name: idx_scan_uploads_line_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_uploads_line_user_created ON public.scan_uploads USING btree (line_user_id, created_at DESC);


--
-- Name: idx_scan_uploads_line_user_pinned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_uploads_line_user_pinned ON public.scan_uploads USING btree (line_user_id) WHERE (COALESCE(is_pinned, false) = true);


--
-- Name: idx_scan_uploads_original_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_uploads_original_deleted_at ON public.scan_uploads USING btree (original_deleted_at DESC) WHERE (original_deleted_at IS NOT NULL);


--
-- Name: idx_scan_uploads_retention_original; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_uploads_retention_original ON public.scan_uploads USING btree (original_expires_at) WHERE ((original_deleted_at IS NULL) AND (COALESCE(is_pinned, false) = false));


--
-- Name: idx_tg_approval_tokens_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tg_approval_tokens_expires ON public.telegram_approval_tokens USING btree (expires_at);


--
-- Name: idx_tg_approval_tokens_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tg_approval_tokens_payment ON public.telegram_approval_tokens USING btree (payment_id);


--
-- Name: idx_user_entitlements_app_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_entitlements_app_user_id ON public.user_entitlements USING btree (app_user_id);


--
-- Name: idx_user_page_tokens_uid_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_page_tokens_uid_purpose ON public.user_page_tokens USING btree (line_user_id, purpose);


--
-- Name: uq_app_users_line_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_app_users_line_user_id ON public.app_users USING btree (line_user_id);


--
-- Name: uq_app_users_synergy_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_app_users_synergy_token ON public.app_users USING btree (synergy_token) WHERE (synergy_token IS NOT NULL);


--
-- Name: uq_outbound_approve_notify_per_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_outbound_approve_notify_per_payment ON public.outbound_messages USING btree (related_payment_id) WHERE ((kind = 'approve_notify'::text) AND (related_payment_id IS NOT NULL));


--
-- Name: uq_scan_results_v2_job; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_scan_results_v2_job ON public.scan_results_v2 USING btree (scan_job_id);


--
-- Name: uq_scan_uploads_line_message; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_scan_uploads_line_message ON public.scan_uploads USING btree (line_message_id);


--
-- Name: video_job_visual_assets_video_job_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_job_visual_assets_video_job_id_idx ON public.video_job_visual_assets USING btree (video_job_id);


--
-- Name: video_job_visual_assets_visual_asset_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_job_visual_assets_visual_asset_id_idx ON public.video_job_visual_assets USING btree (visual_asset_id);


--
-- Name: video_jobs_footage_clip_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_jobs_footage_clip_id_idx ON public.video_jobs USING btree (footage_clip_id);


--
-- Name: video_jobs_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_jobs_status_created_idx ON public.video_jobs USING btree (status, created_at);


--
-- Name: visual_assets_content_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visual_assets_content_session_id_idx ON public.visual_assets USING btree (content_session_id);


--
-- Name: visual_assets_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visual_assets_status_idx ON public.visual_assets USING btree (status);


--
-- Name: visual_assets_video_job_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visual_assets_video_job_id_idx ON public.visual_assets USING btree (video_job_id);


--
-- Name: scan_jobs guard_new_customer_trial_job; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_new_customer_trial_job BEFORE INSERT OR UPDATE OF status ON public.scan_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_new_customer_trial_job();


--
-- Name: conversation_state trg_conversation_state_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_conversation_state_set_updated_at BEFORE UPDATE ON public.conversation_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: energy_categories trg_energy_categories_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_energy_categories_set_updated_at BEFORE UPDATE ON public.energy_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: energy_copy_templates trg_energy_copy_templates_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_energy_copy_templates_set_updated_at BEFORE UPDATE ON public.energy_copy_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: footage_clips trg_footage_clips_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_footage_clips_updated_at BEFORE UPDATE ON public.footage_clips FOR EACH ROW EXECUTE FUNCTION public.set_footage_clips_updated_at();


--
-- Name: global_object_baselines trg_global_object_baselines_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_global_object_baselines_set_updated_at BEFORE UPDATE ON public.global_object_baselines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: kb_entries trg_kb_entries_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kb_entries_set_updated_at BEFORE UPDATE ON public.kb_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: outbound_messages trg_outbound_messages_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_outbound_messages_set_updated_at BEFORE UPDATE ON public.outbound_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payment_notifications trg_payment_notifications_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_notifications_set_updated_at BEFORE UPDATE ON public.payment_notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payments trg_payments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: outbound_messages trg_release_bonus_on_dup_evidence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_release_bonus_on_dup_evidence AFTER INSERT OR UPDATE OF payload_json ON public.outbound_messages FOR EACH ROW EXECUTE FUNCTION public.release_bonus_on_dup_evidence();


--
-- Name: report_publications trg_report_publications_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_report_publications_set_updated_at BEFORE UPDATE ON public.report_publications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: scan_jobs trg_scan_jobs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_scan_jobs_set_updated_at BEFORE UPDATE ON public.scan_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: scan_requests trg_scan_requests_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_scan_requests_set_updated_at BEFORE UPDATE ON public.scan_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: video_jobs trg_video_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_jobs_updated_at BEFORE UPDATE ON public.video_jobs FOR EACH ROW EXECUTE FUNCTION public.set_video_jobs_updated_at();


--
-- Name: visual_assets trg_visual_assets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_visual_assets_updated_at BEFORE UPDATE ON public.visual_assets FOR EACH ROW EXECUTE FUNCTION public.set_visual_assets_updated_at();


--
-- Name: amulet_type_examples amulet_type_examples_type_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amulet_type_examples
    ADD CONSTRAINT amulet_type_examples_type_key_fkey FOREIGN KEY (type_key) REFERENCES public.amulet_types(type_key) ON DELETE CASCADE;


--
-- Name: conversation_state conversation_state_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_state
    ADD CONSTRAINT conversation_state_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: conversation_state conversation_state_pending_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_state
    ADD CONSTRAINT conversation_state_pending_upload_id_fkey FOREIGN KEY (pending_upload_id) REFERENCES public.scan_uploads(id) ON DELETE SET NULL;


--
-- Name: energy_copy_templates energy_copy_templates_category_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energy_copy_templates
    ADD CONSTRAINT energy_copy_templates_category_code_fkey FOREIGN KEY (category_code) REFERENCES public.energy_categories(code) ON DELETE CASCADE;


--
-- Name: global_object_baselines global_object_baselines_source_scan_result_v2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_object_baselines
    ADD CONSTRAINT global_object_baselines_source_scan_result_v2_id_fkey FOREIGN KEY (source_scan_result_v2_id) REFERENCES public.scan_results_v2(id) ON DELETE SET NULL;


--
-- Name: global_object_baselines global_object_baselines_source_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_object_baselines
    ADD CONSTRAINT global_object_baselines_source_upload_id_fkey FOREIGN KEY (source_upload_id) REFERENCES public.scan_uploads(id) ON DELETE SET NULL;


--
-- Name: object_family_category_map object_family_category_map_category_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_family_category_map
    ADD CONSTRAINT object_family_category_map_category_code_fkey FOREIGN KEY (category_code) REFERENCES public.energy_categories(code) ON DELETE CASCADE;


--
-- Name: payment_notifications payment_notifications_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_notifications
    ADD CONSTRAINT payment_notifications_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payment_slips payment_slips_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_slips
    ADD CONSTRAINT payment_slips_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payments payments_scan_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_scan_request_id_fkey FOREIGN KEY (scan_request_id) REFERENCES public.scan_requests(id) ON DELETE SET NULL;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: report_publications report_publications_scan_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_publications
    ADD CONSTRAINT report_publications_scan_result_id_fkey FOREIGN KEY (scan_result_id) REFERENCES public.scan_results_v2(id) ON DELETE CASCADE;


--
-- Name: scan_image_phashes scan_image_phashes_scan_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_image_phashes
    ADD CONSTRAINT scan_image_phashes_scan_result_id_fkey FOREIGN KEY (scan_result_id) REFERENCES public.scan_results_v2(id) ON DELETE CASCADE;


--
-- Name: scan_public_reports scan_public_reports_scan_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_public_reports
    ADD CONSTRAINT scan_public_reports_scan_result_id_fkey FOREIGN KEY (scan_result_id) REFERENCES public.scan_results(id) ON DELETE CASCADE;


--
-- Name: scan_quota_decrements scan_quota_decrements_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_quota_decrements
    ADD CONSTRAINT scan_quota_decrements_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_users(id);


--
-- Name: scan_quota_decrements scan_quota_decrements_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_quota_decrements
    ADD CONSTRAINT scan_quota_decrements_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.scan_jobs(id);


--
-- Name: scan_requests scan_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_requests
    ADD CONSTRAINT scan_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: scan_results scan_results_scan_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_results
    ADD CONSTRAINT scan_results_scan_request_id_fkey FOREIGN KEY (scan_request_id) REFERENCES public.scan_requests(id) ON DELETE CASCADE;


--
-- Name: scan_results scan_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_results
    ADD CONSTRAINT scan_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: scan_results_v2 scan_results_v2_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_results_v2
    ADD CONSTRAINT scan_results_v2_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: scan_results_v2 scan_results_v2_scan_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_results_v2
    ADD CONSTRAINT scan_results_v2_scan_job_id_fkey FOREIGN KEY (scan_job_id) REFERENCES public.scan_jobs(id) ON DELETE CASCADE;


--
-- Name: scan_uploads scan_uploads_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan_uploads
    ADD CONSTRAINT scan_uploads_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: user_entitlements user_entitlements_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_entitlements
    ADD CONSTRAINT user_entitlements_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: video_job_visual_assets video_job_visual_assets_video_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_job_visual_assets
    ADD CONSTRAINT video_job_visual_assets_video_job_id_fkey FOREIGN KEY (video_job_id) REFERENCES public.video_jobs(id) ON DELETE CASCADE;


--
-- Name: video_job_visual_assets video_job_visual_assets_visual_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_job_visual_assets
    ADD CONSTRAINT video_job_visual_assets_visual_asset_id_fkey FOREIGN KEY (visual_asset_id) REFERENCES public.visual_assets(id) ON DELETE CASCADE;


--
-- Name: video_jobs video_jobs_footage_clip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_jobs
    ADD CONSTRAINT video_jobs_footage_clip_id_fkey FOREIGN KEY (footage_clip_id) REFERENCES public.footage_clips(id) ON DELETE SET NULL;


--
-- Name: visual_assets visual_assets_video_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visual_assets
    ADD CONSTRAINT visual_assets_video_job_id_fkey FOREIGN KEY (video_job_id) REFERENCES public.video_jobs(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO web_anon;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION approve_payment_and_grant(p_payment_id uuid, p_channel text, p_actor text, p_expect_package_code text, p_expect_amount numeric, p_plan_code text, p_scans integer, p_paid_until timestamp with time zone, p_is_top_package boolean, p_calculation_snapshot jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.approve_payment_and_grant(p_payment_id uuid, p_channel text, p_actor text, p_expect_package_code text, p_expect_amount numeric, p_plan_code text, p_scans integer, p_paid_until timestamp with time zone, p_is_top_package boolean, p_calculation_snapshot jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_payment_and_grant(p_payment_id uuid, p_channel text, p_actor text, p_expect_package_code text, p_expect_amount numeric, p_plan_code text, p_scans integer, p_paid_until timestamp with time zone, p_is_top_package boolean, p_calculation_snapshot jsonb) TO web_anon;
GRANT ALL ON FUNCTION public.approve_payment_and_grant(p_payment_id uuid, p_channel text, p_actor text, p_expect_package_code text, p_expect_amount numeric, p_plan_code text, p_scans integer, p_paid_until timestamp with time zone, p_is_top_package boolean, p_calculation_snapshot jsonb) TO service_role;


--
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.armor(bytea) TO service_role;
GRANT ALL ON FUNCTION public.armor(bytea) TO web_anon;


--
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.armor(bytea, text[], text[]) TO service_role;
GRANT ALL ON FUNCTION public.armor(bytea, text[], text[]) TO web_anon;


--
-- Name: TABLE outbound_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.outbound_messages TO web_anon;
GRANT ALL ON TABLE public.outbound_messages TO service_role;


--
-- Name: FUNCTION claim_next_outbound_message(p_worker_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_next_outbound_message(p_worker_id text) TO web_anon;
GRANT ALL ON FUNCTION public.claim_next_outbound_message(p_worker_id text) TO service_role;


--
-- Name: TABLE scan_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scan_jobs TO web_anon;
GRANT ALL ON TABLE public.scan_jobs TO service_role;


--
-- Name: FUNCTION claim_next_scan_job(p_worker_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_next_scan_job(p_worker_id text) TO web_anon;
GRANT ALL ON FUNCTION public.claim_next_scan_job(p_worker_id text) TO service_role;


--
-- Name: TABLE video_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.video_jobs TO web_anon;
GRANT ALL ON TABLE public.video_jobs TO service_role;


--
-- Name: FUNCTION claim_next_video_job_render(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_next_video_job_render() TO web_anon;
GRANT ALL ON FUNCTION public.claim_next_video_job_render() TO service_role;


--
-- Name: FUNCTION claim_next_video_job_script(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_next_video_job_script() TO web_anon;
GRANT ALL ON FUNCTION public.claim_next_video_job_script() TO service_role;


--
-- Name: FUNCTION claim_next_video_job_voice(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_next_video_job_voice() TO web_anon;
GRANT ALL ON FUNCTION public.claim_next_video_job_voice() TO service_role;


--
-- Name: FUNCTION claim_paid_scan_decrement(p_job_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_paid_scan_decrement(p_job_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_paid_scan_decrement(p_job_id uuid) TO web_anon;
GRANT ALL ON FUNCTION public.claim_paid_scan_decrement(p_job_id uuid) TO service_role;


--
-- Name: FUNCTION consume_telegram_approval_token(p_token text, p_tg_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_telegram_approval_token(p_token text, p_tg_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_telegram_approval_token(p_token text, p_tg_user_id text) TO web_anon;
GRANT ALL ON FUNCTION public.consume_telegram_approval_token(p_token text, p_tg_user_id text) TO service_role;


--
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.crypt(text, text) TO service_role;
GRANT ALL ON FUNCTION public.crypt(text, text) TO web_anon;


--
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dearmor(text) TO service_role;
GRANT ALL ON FUNCTION public.dearmor(text) TO web_anon;


--
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.decrypt(bytea, bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.decrypt(bytea, bytea, text) TO web_anon;


--
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.decrypt_iv(bytea, bytea, bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.decrypt_iv(bytea, bytea, bytea, text) TO web_anon;


--
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.digest(bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.digest(bytea, text) TO web_anon;


--
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.digest(text, text) TO service_role;
GRANT ALL ON FUNCTION public.digest(text, text) TO web_anon;


--
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.encrypt(bytea, bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.encrypt(bytea, bytea, text) TO web_anon;


--
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.encrypt_iv(bytea, bytea, bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.encrypt_iv(bytea, bytea, bytea, text) TO web_anon;


--
-- Name: FUNCTION ener_form_stats(p_form text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ener_form_stats(p_form text) TO web_anon;
GRANT ALL ON FUNCTION public.ener_form_stats(p_form text) TO service_role;


--
-- Name: FUNCTION ener_mark_precheck(p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ener_mark_precheck(p_token text) TO web_anon;
GRANT ALL ON FUNCTION public.ener_mark_precheck(p_token text) TO service_role;


--
-- Name: FUNCTION ener_score_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ener_score_stats() TO web_anon;
GRANT ALL ON FUNCTION public.ener_score_stats() TO service_role;


--
-- Name: FUNCTION ener_vault_unique_count(p_uid text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ener_vault_unique_count(p_uid text) TO web_anon;
GRANT ALL ON FUNCTION public.ener_vault_unique_count(p_uid text) TO service_role;


--
-- Name: FUNCTION enqueue_video_job_from_scan_result(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enqueue_video_job_from_scan_result() TO web_anon;
GRANT ALL ON FUNCTION public.enqueue_video_job_from_scan_result() TO service_role;


--
-- Name: FUNCTION ensure_quota_decrement_pending(p_job_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_quota_decrement_pending(p_job_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_quota_decrement_pending(p_job_id uuid) TO web_anon;
GRANT ALL ON FUNCTION public.ensure_quota_decrement_pending(p_job_id uuid) TO service_role;


--
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gen_random_bytes(integer) TO service_role;
GRANT ALL ON FUNCTION public.gen_random_bytes(integer) TO web_anon;


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gen_random_uuid() TO service_role;
GRANT ALL ON FUNCTION public.gen_random_uuid() TO web_anon;


--
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gen_salt(text) TO service_role;
GRANT ALL ON FUNCTION public.gen_salt(text) TO web_anon;


--
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gen_salt(text, integer) TO service_role;
GRANT ALL ON FUNCTION public.gen_salt(text, integer) TO web_anon;


--
-- Name: FUNCTION get_daily_pick_optout(p_line_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_daily_pick_optout(p_line_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_daily_pick_optout(p_line_user_id text) TO web_anon;
GRANT ALL ON FUNCTION public.get_daily_pick_optout(p_line_user_id text) TO service_role;


--
-- Name: FUNCTION guard_new_customer_trial_job(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_new_customer_trial_job() FROM PUBLIC;


--
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hmac(bytea, bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.hmac(bytea, bytea, text) TO web_anon;


--
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hmac(text, text, text) TO service_role;
GRANT ALL ON FUNCTION public.hmac(text, text, text) TO web_anon;


--
-- Name: FUNCTION issue_telegram_approval_token(p_token text, p_payment_id uuid, p_ttl_seconds integer, p_amount numeric, p_package_code text, p_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.issue_telegram_approval_token(p_token text, p_payment_id uuid, p_ttl_seconds integer, p_amount numeric, p_package_code text, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.issue_telegram_approval_token(p_token text, p_payment_id uuid, p_ttl_seconds integer, p_amount numeric, p_package_code text, p_status text) TO web_anon;
GRANT ALL ON FUNCTION public.issue_telegram_approval_token(p_token text, p_payment_id uuid, p_ttl_seconds integer, p_amount numeric, p_package_code text, p_status text) TO service_role;


--
-- Name: FUNCTION list_payment_grants_pending_notify(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_payment_grants_pending_notify(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_payment_grants_pending_notify(p_limit integer) TO web_anon;
GRANT ALL ON FUNCTION public.list_payment_grants_pending_notify(p_limit integer) TO service_role;


--
-- Name: FUNCTION mark_payment_grant_notified(p_payment_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_payment_grant_notified(p_payment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_payment_grant_notified(p_payment_id uuid) TO web_anon;
GRANT ALL ON FUNCTION public.mark_payment_grant_notified(p_payment_id uuid) TO service_role;


--
-- Name: FUNCTION mark_quota_decrement_error(p_job_id uuid, p_error text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_quota_decrement_error(p_job_id uuid, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_quota_decrement_error(p_job_id uuid, p_error text) TO web_anon;
GRANT ALL ON FUNCTION public.mark_quota_decrement_error(p_job_id uuid, p_error text) TO service_role;


--
-- Name: FUNCTION match_amulet_type_examples(query_embedding public.vector, match_count integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.match_amulet_type_examples(query_embedding public.vector, match_count integer) TO service_role;
GRANT ALL ON FUNCTION public.match_amulet_type_examples(query_embedding public.vector, match_count integer) TO web_anon;


--
-- Name: FUNCTION match_global_object_baselines_visual(query_embedding public.vector, match_lane text, match_family text, min_similarity double precision, match_count integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.match_global_object_baselines_visual(query_embedding public.vector, match_lane text, match_family text, min_similarity double precision, match_count integer) TO service_role;
GRANT ALL ON FUNCTION public.match_global_object_baselines_visual(query_embedding public.vector, match_lane text, match_family text, min_similarity double precision, match_count integer) TO web_anon;


--
-- Name: FUNCTION migrate_daily_pick_optout_if_absent(p_line_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.migrate_daily_pick_optout_if_absent(p_line_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.migrate_daily_pick_optout_if_absent(p_line_user_id text) TO web_anon;
GRANT ALL ON FUNCTION public.migrate_daily_pick_optout_if_absent(p_line_user_id text) TO service_role;


--
-- Name: FUNCTION new_customer_trial_status(p_line_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.new_customer_trial_status(p_line_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.new_customer_trial_status(p_line_user_id text) TO web_anon;
GRANT ALL ON FUNCTION public.new_customer_trial_status(p_line_user_id text) TO service_role;


--
-- Name: FUNCTION new_customer_trial_used(p_user uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.new_customer_trial_used(p_user uuid) FROM PUBLIC;


--
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_armor_headers(text, OUT key text, OUT value text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_armor_headers(text, OUT key text, OUT value text) TO web_anon;


--
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_key_id(bytea) TO service_role;
GRANT ALL ON FUNCTION public.pgp_key_id(bytea) TO web_anon;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt(bytea, bytea) TO service_role;
GRANT ALL ON FUNCTION public.pgp_pub_decrypt(bytea, bytea) TO web_anon;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt(bytea, bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_pub_decrypt(bytea, bytea, text) TO web_anon;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt(bytea, bytea, text, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_pub_decrypt(bytea, bytea, text, text) TO web_anon;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea) TO service_role;
GRANT ALL ON FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea) TO web_anon;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text) TO web_anon;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO web_anon;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_pub_encrypt(text, bytea) TO service_role;
GRANT ALL ON FUNCTION public.pgp_pub_encrypt(text, bytea) TO web_anon;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_pub_encrypt(text, bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_pub_encrypt(text, bytea, text) TO web_anon;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea) TO service_role;
GRANT ALL ON FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea) TO web_anon;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea, text) TO web_anon;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_sym_decrypt(bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_sym_decrypt(bytea, text) TO web_anon;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_sym_decrypt(bytea, text, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_sym_decrypt(bytea, text, text) TO web_anon;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_sym_decrypt_bytea(bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_sym_decrypt_bytea(bytea, text) TO web_anon;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_sym_decrypt_bytea(bytea, text, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_sym_decrypt_bytea(bytea, text, text) TO web_anon;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_sym_encrypt(text, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_sym_encrypt(text, text) TO web_anon;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_sym_encrypt(text, text, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_sym_encrypt(text, text, text) TO web_anon;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_sym_encrypt_bytea(bytea, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_sym_encrypt_bytea(bytea, text) TO web_anon;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text, text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgp_sym_encrypt_bytea(bytea, text, text) TO service_role;
GRANT ALL ON FUNCTION public.pgp_sym_encrypt_bytea(bytea, text, text) TO web_anon;


--
-- Name: FUNCTION purge_expired_telegram_approval_tokens(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.purge_expired_telegram_approval_tokens() FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_expired_telegram_approval_tokens() TO web_anon;
GRANT ALL ON FUNCTION public.purge_expired_telegram_approval_tokens() TO service_role;


--
-- Name: FUNCTION quota_delivery_evidence(p_job public.scan_jobs); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.quota_delivery_evidence(p_job public.scan_jobs) FROM PUBLIC;


--
-- Name: FUNCTION reconcile_missing_quota_ledgers(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reconcile_missing_quota_ledgers(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reconcile_missing_quota_ledgers(p_limit integer) TO web_anon;
GRANT ALL ON FUNCTION public.reconcile_missing_quota_ledgers(p_limit integer) TO service_role;


--
-- Name: FUNCTION record_payment_approval_audit(p_payment_id uuid, p_channel text, p_actor text, p_action text, p_result text, p_detail jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_payment_approval_audit(p_payment_id uuid, p_channel text, p_actor text, p_action text, p_result text, p_detail jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_payment_approval_audit(p_payment_id uuid, p_channel text, p_actor text, p_action text, p_result text, p_detail jsonb) TO web_anon;
GRANT ALL ON FUNCTION public.record_payment_approval_audit(p_payment_id uuid, p_channel text, p_actor text, p_action text, p_result text, p_detail jsonb) TO service_role;


--
-- Name: FUNCTION release_bonus_on_dup_evidence(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_bonus_on_dup_evidence() FROM PUBLIC;


--
-- Name: FUNCTION release_bonus_reservation(p_job_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_bonus_reservation(p_job_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_bonus_reservation(p_job_id uuid) TO web_anon;
GRANT ALL ON FUNCTION public.release_bonus_reservation(p_job_id uuid) TO service_role;


--
-- Name: FUNCTION set_daily_pick_optout(p_line_user_id text, p_opted_out boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_daily_pick_optout(p_line_user_id text, p_opted_out boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_daily_pick_optout(p_line_user_id text, p_opted_out boolean) TO web_anon;
GRANT ALL ON FUNCTION public.set_daily_pick_optout(p_line_user_id text, p_opted_out boolean) TO service_role;


--
-- Name: FUNCTION set_footage_clips_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_footage_clips_updated_at() TO web_anon;
GRANT ALL ON FUNCTION public.set_footage_clips_updated_at() TO service_role;


--
-- Name: FUNCTION set_new_customer_trial_policy(p_enabled boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_new_customer_trial_policy(p_enabled boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_new_customer_trial_policy(p_enabled boolean) TO web_anon;
GRANT ALL ON FUNCTION public.set_new_customer_trial_policy(p_enabled boolean) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO web_anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION set_video_jobs_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_video_jobs_updated_at() TO web_anon;
GRANT ALL ON FUNCTION public.set_video_jobs_updated_at() TO service_role;


--
-- Name: FUNCTION set_visual_assets_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_visual_assets_updated_at() TO web_anon;
GRANT ALL ON FUNCTION public.set_visual_assets_updated_at() TO service_role;


--
-- Name: FUNCTION sweep_bonus_releases(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sweep_bonus_releases(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sweep_bonus_releases(p_limit integer) TO web_anon;
GRANT ALL ON FUNCTION public.sweep_bonus_releases(p_limit integer) TO service_role;


--
-- Name: TABLE amulet_type_examples; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.amulet_type_examples TO service_role;
GRANT ALL ON TABLE public.amulet_type_examples TO web_anon;


--
-- Name: TABLE amulet_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.amulet_types TO service_role;
GRANT ALL ON TABLE public.amulet_types TO web_anon;


--
-- Name: TABLE app_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.app_settings TO service_role;
GRANT ALL ON TABLE public.app_settings TO web_anon;


--
-- Name: TABLE app_users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_users TO service_role;
GRANT ALL ON TABLE public.app_users TO web_anon;


--
-- Name: TABLE banned_users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.banned_users TO web_anon;
GRANT SELECT,INSERT ON TABLE public.banned_users TO service_role;


--
-- Name: COLUMN banned_users.unbanned_by; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(unbanned_by) ON TABLE public.banned_users TO web_anon;
GRANT UPDATE(unbanned_by) ON TABLE public.banned_users TO service_role;


--
-- Name: COLUMN banned_users.unbanned_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(unbanned_at) ON TABLE public.banned_users TO web_anon;
GRANT UPDATE(unbanned_at) ON TABLE public.banned_users TO service_role;


--
-- Name: COLUMN banned_users.unban_reason; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(unban_reason) ON TABLE public.banned_users TO web_anon;
GRANT UPDATE(unban_reason) ON TABLE public.banned_users TO service_role;


--
-- Name: SEQUENCE banned_users_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.banned_users_id_seq TO web_anon;
GRANT SELECT,USAGE ON SEQUENCE public.banned_users_id_seq TO service_role;


--
-- Name: TABLE conversation_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_state TO web_anon;
GRANT ALL ON TABLE public.conversation_state TO service_role;


--
-- Name: TABLE energy_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.energy_categories TO web_anon;
GRANT ALL ON TABLE public.energy_categories TO service_role;


--
-- Name: SEQUENCE energy_categories_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.energy_categories_id_seq TO web_anon;
GRANT ALL ON SEQUENCE public.energy_categories_id_seq TO service_role;


--
-- Name: TABLE energy_copy_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.energy_copy_templates TO web_anon;
GRANT ALL ON TABLE public.energy_copy_templates TO service_role;


--
-- Name: SEQUENCE energy_copy_templates_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.energy_copy_templates_id_seq TO web_anon;
GRANT ALL ON SEQUENCE public.energy_copy_templates_id_seq TO service_role;


--
-- Name: TABLE fb_showcase_queue; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.fb_showcase_queue TO service_role;
GRANT ALL ON TABLE public.fb_showcase_queue TO web_anon;


--
-- Name: TABLE footage_clips; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.footage_clips TO web_anon;
GRANT ALL ON TABLE public.footage_clips TO service_role;


--
-- Name: TABLE global_object_baselines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.global_object_baselines TO web_anon;
GRANT ALL ON TABLE public.global_object_baselines TO service_role;


--
-- Name: TABLE kb_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kb_entries TO service_role;
GRANT ALL ON TABLE public.kb_entries TO web_anon;


--
-- Name: TABLE liff_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.liff_profiles TO web_anon;


--
-- Name: TABLE line_conversation_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.line_conversation_messages TO web_anon;
GRANT ALL ON TABLE public.line_conversation_messages TO service_role;


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.notification_preferences TO web_anon;
GRANT SELECT ON TABLE public.notification_preferences TO service_role;


--
-- Name: TABLE object_family_category_map; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.object_family_category_map TO web_anon;
GRANT ALL ON TABLE public.object_family_category_map TO service_role;


--
-- Name: SEQUENCE object_family_category_map_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.object_family_category_map_id_seq TO web_anon;
GRANT ALL ON SEQUENCE public.object_family_category_map_id_seq TO service_role;


--
-- Name: TABLE object_owner_info; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.object_owner_info TO web_anon;
GRANT SELECT,INSERT,UPDATE ON TABLE public.object_owner_info TO service_role;


--
-- Name: TABLE payment_approval_audit; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.payment_approval_audit TO service_role;


--
-- Name: TABLE payment_entitlement_grants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.payment_entitlement_grants TO service_role;


--
-- Name: TABLE payment_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payment_notifications TO web_anon;
GRANT ALL ON TABLE public.payment_notifications TO service_role;


--
-- Name: TABLE payment_slips; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payment_slips TO web_anon;
GRANT ALL ON TABLE public.payment_slips TO service_role;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payments TO web_anon;
GRANT ALL ON TABLE public.payments TO service_role;


--
-- Name: TABLE persona_ab_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.persona_ab_assignments TO web_anon;
GRANT ALL ON TABLE public.persona_ab_assignments TO service_role;


--
-- Name: TABLE persona_ab_funnel_daily; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.persona_ab_funnel_daily TO web_anon;
GRANT ALL ON TABLE public.persona_ab_funnel_daily TO service_role;


--
-- Name: TABLE persona_ab_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.persona_ab_stats TO web_anon;
GRANT ALL ON TABLE public.persona_ab_stats TO service_role;


--
-- Name: TABLE persona_ab_weights; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.persona_ab_weights TO web_anon;
GRANT ALL ON TABLE public.persona_ab_weights TO service_role;


--
-- Name: TABLE referral_codes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.referral_codes TO service_role;
GRANT ALL ON TABLE public.referral_codes TO web_anon;


--
-- Name: TABLE referral_redemptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.referral_redemptions TO service_role;
GRANT ALL ON TABLE public.referral_redemptions TO web_anon;


--
-- Name: TABLE report_publications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.report_publications TO web_anon;
GRANT ALL ON TABLE public.report_publications TO service_role;


--
-- Name: TABLE scan_image_phashes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scan_image_phashes TO web_anon;
GRANT ALL ON TABLE public.scan_image_phashes TO service_role;


--
-- Name: TABLE scan_public_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scan_public_reports TO web_anon;
GRANT ALL ON TABLE public.scan_public_reports TO service_role;


--
-- Name: TABLE scan_quota_decrements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.scan_quota_decrements TO web_anon;
GRANT SELECT ON TABLE public.scan_quota_decrements TO service_role;


--
-- Name: TABLE scan_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scan_requests TO web_anon;
GRANT ALL ON TABLE public.scan_requests TO service_role;


--
-- Name: TABLE scan_result_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scan_result_cache TO web_anon;
GRANT ALL ON TABLE public.scan_result_cache TO service_role;


--
-- Name: TABLE scan_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scan_results TO web_anon;
GRANT ALL ON TABLE public.scan_results TO service_role;


--
-- Name: TABLE scan_results_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scan_results_v2 TO web_anon;
GRANT ALL ON TABLE public.scan_results_v2 TO service_role;


--
-- Name: TABLE scan_uploads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scan_uploads TO web_anon;
GRANT ALL ON TABLE public.scan_uploads TO service_role;


--
-- Name: TABLE user_entitlements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_entitlements TO service_role;
GRANT ALL ON TABLE public.user_entitlements TO web_anon;


--
-- Name: TABLE user_page_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.user_page_tokens TO service_role;
GRANT ALL ON TABLE public.user_page_tokens TO web_anon;


--
-- Name: SEQUENCE user_page_tokens_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_page_tokens_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.user_page_tokens_id_seq TO web_anon;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO service_role;
GRANT ALL ON TABLE public.users TO web_anon;


--
-- Name: TABLE video_job_visual_assets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.video_job_visual_assets TO web_anon;
GRANT ALL ON TABLE public.video_job_visual_assets TO service_role;


--
-- Name: TABLE video_pipeline_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.video_pipeline_settings TO web_anon;
GRANT ALL ON TABLE public.video_pipeline_settings TO service_role;


--
-- Name: TABLE visual_assets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.visual_assets TO web_anon;
GRANT ALL ON TABLE public.visual_assets TO service_role;


--
-- PostgreSQL database dump complete
--



GRANT web_anon TO authenticator; GRANT service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO web_anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO web_anon, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO web_anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO web_anon, service_role;
