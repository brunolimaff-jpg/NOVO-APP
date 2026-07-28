-- =====================================================================
-- Production Schema Baseline — Dump Nativo pg_dump 17.10
-- Fonte: supabase db dump --linked --schema public (via dry-run + pg_dump nativo)
-- Timestamp: 20260501000000 (anterior a todas as migrations remotas)
-- Produção: vmqfcaoirjcfucvlnpig (sa-east-1, PostgreSQL 17.6)
-- =====================================================================

-- Extensões necessárias para este schema
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";




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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."dossier_runs" (
    "run_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "operator_id" "text" NOT NULL,
    "session_id" "uuid",
    "dossier_id" "uuid",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "lease_owner" "text",
    "lease_expires_at" timestamp with time zone,
    "cancel_requested_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "last_heartbeat_at" timestamp with time zone,
    "environment" "text" NOT NULL,
    "app_version" "text" NOT NULL,
    "error_code" "text",
    "error_stage" "text",
    CONSTRAINT "dossier_runs_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'RUNNING'::"text", 'CANCEL_REQUESTED'::"text", 'CANCELLED'::"text", 'COMPLETED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."dossier_runs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."acquire_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text", "p_lease_seconds" integer DEFAULT 45) RETURNS "public"."dossier_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  IF auth.uid() IS NULL OR coalesce(btrim(p_lease_owner), '') = '' OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Invalid authenticated lease request';
  END IF;
  UPDATE public.dossier_runs
     SET lease_owner = p_lease_owner, lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         last_heartbeat_at = now(), started_at = coalesce(started_at, now()), status = 'RUNNING'
   WHERE run_id = p_run_id AND owner_id = auth.uid()
     AND status IN ('PENDING', 'RUNNING')
     AND (lease_expires_at IS NULL OR lease_expires_at < now() OR lease_owner = p_lease_owner)
  RETURNING * INTO v_run;
  RETURN v_run;
END; $$;


ALTER FUNCTION "public"."acquire_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text", "p_lease_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_close_stale_sessions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  closed_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE operator_sessions
    SET
      ended_at        = last_seen_at,
      ended_reason    = 'timeout',
      duration_seconds = EXTRACT(EPOCH FROM (last_seen_at - started_at))::INTEGER
    WHERE ended_at IS NULL
      AND last_seen_at IS NOT NULL
      AND last_seen_at < NOW() - INTERVAL '30 minutes'
    RETURNING 1
  )
  SELECT COUNT(*) INTO closed_count FROM updated;

  RETURN closed_count;
END;
$$;


ALTER FUNCTION "public"."auto_close_stale_sessions"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auto_close_stale_sessions"() IS 'Fecha sessoes sem atividade ha 30+ minutos. ended_at = last_seen_at. Uso: SELECT auto_close_stale_sessions()';



CREATE OR REPLACE FUNCTION "public"."complete_dossier_run"("p_run_id" "uuid", "p_lease_owner" "text", "p_dossier_id" "uuid") RETURNS "public"."dossier_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET status = 'COMPLETED', dossier_id = p_dossier_id, completed_at = coalesce(completed_at, now()), lease_owner = NULL, lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND lease_owner = p_lease_owner AND status = 'RUNNING'
  RETURNING * INTO v_run;
  IF v_run.run_id IS NOT NULL THEN RETURN v_run; END IF;
  SELECT * INTO v_run
    FROM public.dossier_runs
   WHERE run_id = p_run_id AND owner_id = auth.uid()
     AND status = 'COMPLETED' AND dossier_id = p_dossier_id AND lease_owner IS NULL;
  RETURN v_run;
END; $$;


ALTER FUNCTION "public"."complete_dossier_run"("p_run_id" "uuid", "p_lease_owner" "text", "p_dossier_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_or_get_dossier_run"("p_idempotency_key" "text", "p_session_id" "uuid", "p_environment" "text", "p_app_version" "text") RETURNS "public"."dossier_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_owner UUID := auth.uid(); v_run public.dossier_runs;
BEGIN
  IF v_owner IS NULL OR coalesce(btrim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Authenticated user and idempotency key are required';
  END IF;
  INSERT INTO public.dossier_runs (owner_id, operator_id, session_id, status, idempotency_key, environment, app_version)
  SELECT v_owner, p.operator_id, p_session_id, 'PENDING', p_idempotency_key,
         coalesce(nullif(btrim(p_environment), ''), 'development'), coalesce(nullif(btrim(p_app_version), ''), 'unknown')
  FROM public.profiles p WHERE p.id = v_owner
  ON CONFLICT (owner_id, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING * INTO v_run;
  IF v_run.run_id IS NULL THEN RAISE EXCEPTION 'Authenticated profile is required'; END IF;
  RETURN v_run;
END; $$;


ALTER FUNCTION "public"."create_or_get_dossier_run"("p_idempotency_key" "text", "p_session_id" "uuid", "p_environment" "text", "p_app_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fail_dossier_run"("p_run_id" "uuid", "p_lease_owner" "text", "p_error_code" "text", "p_error_stage" "text") RETURNS "public"."dossier_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET status = 'FAILED', failed_at = coalesce(failed_at, now()), error_code = p_error_code, error_stage = p_error_stage,
      lease_owner = NULL, lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND lease_owner = p_lease_owner AND status NOT IN ('CANCELLED', 'COMPLETED', 'FAILED')
  RETURNING * INTO v_run;
  IF v_run.run_id IS NOT NULL THEN RETURN v_run; END IF;
  SELECT * INTO v_run
    FROM public.dossier_runs
   WHERE run_id = p_run_id AND owner_id = auth.uid()
     AND status = 'FAILED' AND error_code = p_error_code AND error_stage = p_error_stage AND lease_owner IS NULL;
  RETURN v_run;
END; $$;


ALTER FUNCTION "public"."fail_dossier_run"("p_run_id" "uuid", "p_lease_owner" "text", "p_error_code" "text", "p_error_stage" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_expired_unconfirmed_users"("older_than" timestamp with time zone, "max_results" integer DEFAULT 50) RETURNS TABLE("id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT u.id
  FROM auth.users u
  WHERE u.created_at < older_than
    AND u.last_sign_in_at IS NULL
    AND u.deleted_at IS NULL
  LIMIT max_results;
END;
$$;


ALTER FUNCTION "public"."get_expired_unconfirmed_users"("older_than" timestamp with time zone, "max_results" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_own_dossier_run"("p_run_id" "uuid") RETURNS "public"."dossier_runs"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT r.* FROM public.dossier_runs r WHERE r.run_id = p_run_id AND r.owner_id = auth.uid()
$$;


ALTER FUNCTION "public"."get_own_dossier_run"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  new_operator_id TEXT;
BEGIN
  new_operator_id := 'op_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.profiles (id, operator_id, email, name)
  VALUES (NEW.id, new_operator_id, NEW.email, NEW.raw_user_meta_data->>'name');

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_legacy_operator"("p_auth_user_id" "uuid", "p_operator_id" "text", "p_email" "text" DEFAULT NULL::"text", "p_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_auth_user_id THEN
    RAISE EXCEPTION 'You can only link your own account';
  END IF;

  IF p_email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_context
    WHERE operator_id = p_operator_id AND email_normalized = LOWER(p_email)
  ) THEN
    RAISE EXCEPTION 'Operator ID does not match provided email';
  END IF;

  INSERT INTO public.profiles (id, operator_id, email, name)
  VALUES (p_auth_user_id, p_operator_id, p_email, p_name)
  ON CONFLICT (id)
  DO UPDATE SET
    operator_id = EXCLUDED.operator_id,
    email = COALESCE(EXCLUDED.email, profiles.email),
    name = COALESCE(EXCLUDED.name, profiles.name);
END;
$$;


ALTER FUNCTION "public"."link_legacy_operator"("p_auth_user_id" "uuid", "p_operator_id" "text", "p_email" "text", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_dossier_run_cancelled"("p_run_id" "uuid", "p_lease_owner" "text") RETURNS "public"."dossier_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs
     SET status = 'CANCELLED',
         cancel_requested_at = coalesce(cancel_requested_at, now()),
         cancelled_at = coalesce(cancelled_at, now()),
         lease_owner = NULL,
         lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND lease_owner = p_lease_owner
     AND status IN ('RUNNING', 'CANCEL_REQUESTED')
  RETURNING * INTO v_run;
  IF v_run.run_id IS NOT NULL THEN RETURN v_run; END IF;
  SELECT * INTO v_run
    FROM public.dossier_runs
   WHERE run_id = p_run_id AND owner_id = auth.uid()
     AND status = 'CANCELLED' AND lease_owner IS NULL;
  RETURN v_run;
END; $$;


ALTER FUNCTION "public"."mark_dossier_run_cancelled"("p_run_id" "uuid", "p_lease_owner" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text") RETURNS "public"."dossier_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET lease_owner = NULL, lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND lease_owner = p_lease_owner
  RETURNING * INTO v_run; RETURN v_run;
END; $$;


ALTER FUNCTION "public"."release_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."renew_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text", "p_lease_seconds" integer DEFAULT 45) RETURNS "public"."dossier_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET lease_expires_at = now() + make_interval(secs => p_lease_seconds), last_heartbeat_at = now()
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND status IN ('RUNNING', 'CANCEL_REQUESTED')
     AND lease_owner = p_lease_owner AND lease_expires_at >= now()
  RETURNING * INTO v_run;
  IF v_run.run_id IS NOT NULL THEN RETURN v_run; END IF;
  SELECT * INTO v_run
    FROM public.dossier_runs
   WHERE run_id = p_run_id AND owner_id = auth.uid()
     AND status IN ('COMPLETED', 'FAILED', 'CANCELLED')
     AND lease_owner IS NULL;
  RETURN v_run;
END; $$;


ALTER FUNCTION "public"."renew_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text", "p_lease_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_dossier_run_cancel"("p_run_id" "uuid") RETURNS "public"."dossier_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET status = 'CANCEL_REQUESTED', cancel_requested_at = coalesce(cancel_requested_at, now())
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND status IN ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  RETURNING * INTO v_run; RETURN v_run;
END; $$;


ALTER FUNCTION "public"."request_dossier_run_cancel"("p_run_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text",
    "target_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "razao_social" "text" NOT NULL,
    "cnpj" "text",
    "linha_produto" "text",
    "agrupador_modulos" "text",
    "estado" "text",
    "cidade" "text",
    "cnae" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dossier_accesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dossier_id" "uuid" NOT NULL,
    "operator_id" "text" NOT NULL,
    "cnpj" "text",
    "accessed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dossier_accesses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dossies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "text" NOT NULL,
    "title" "text",
    "empresa_alvo" "text",
    "cnpj" "text",
    "modo_principal" "text",
    "score_oportunidade" integer,
    "resumo_dossie" "text",
    "content" "jsonb" NOT NULL,
    "synced_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "operator_email" "text"
);


ALTER TABLE "public"."dossies" OWNER TO "postgres";


COMMENT ON COLUMN "public"."dossies"."operator_email" IS 'Email do operador que pesquisou/criou o dossie no Scout 360.';



CREATE TABLE IF NOT EXISTS "public"."extract_cache" (
    "id" "text" NOT NULL,
    "operator_id" "text" NOT NULL,
    "result" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."extract_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "text" NOT NULL,
    "cnpj" "text" NOT NULL,
    "company_name" "text",
    "reason" "text",
    "dossier_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "feedback_id" "text" NOT NULL,
    "operator_id" "text" NOT NULL,
    "user_name" "text",
    "session_id" "text" NOT NULL,
    "message_id" "text" NOT NULL,
    "scope" "text" NOT NULL,
    "section_key" "text",
    "section_title" "text",
    "feedback_type" "text" NOT NULL,
    "reason" "text",
    "comment" "text" DEFAULT ''::"text",
    "ai_content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "feedback_events_feedback_type_check" CHECK (("feedback_type" = ANY (ARRAY['like'::"text", 'dislike'::"text"]))),
    CONSTRAINT "feedback_events_reason_check" CHECK (("reason" = ANY (ARRAY['generic'::"text", 'no_evidence'::"text", 'wrong_info'::"text", 'not_actionable'::"text", 'too_long'::"text", 'other'::"text"]))),
    CONSTRAINT "feedback_events_scope_check" CHECK (("scope" = ANY (ARRAY['message'::"text", 'section'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."feedback_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."llm_experiment_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "experiment_id" "text" NOT NULL,
    "variant" "text",
    "selected_model" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "litellm_base_url" "text",
    "environment" "text" DEFAULT 'production'::"text" NOT NULL,
    "run_id" "text" NOT NULL,
    "session_id" "text",
    "operator_id" "text",
    "company_name" "text",
    "company_cnpj_hash" "text",
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "exclusion_reason" "text",
    "fallback_used" boolean DEFAULT false,
    "fallback_model" "text",
    "retry_count" integer DEFAULT 0,
    "total_latency_ms" integer,
    "model_latency_ms" integer,
    "waterfall_duration_ms" integer,
    "modules_generated" integer,
    "modules_required_present" integer,
    "modules_missing" "text"[],
    "report_chars" integer,
    "report_tokens_estimated" integer,
    "input_tokens" integer,
    "output_tokens" integer,
    "total_tokens" integer,
    "input_cost_usd" numeric(10,6),
    "output_cost_usd" numeric(10,6),
    "total_cost_usd" numeric(10,6),
    "estimated_cost" boolean DEFAULT false,
    "cost_estimation_method" "text",
    "input_price_used" numeric(10,4),
    "output_price_used" numeric(10,4),
    "sources_count" integer,
    "valid_sources_count" integer,
    "removed_sources_count" integer,
    "porta_score_present" boolean,
    "porta_markers_valid" boolean,
    "porta_score" integer,
    "teia_complexidade_present" boolean,
    "teia_complexidade" "text",
    "parser_success" boolean,
    "render_success" boolean,
    "prompt_leak_detected" boolean,
    "response_empty" boolean,
    "response_truncated" boolean,
    "markdown_broken" boolean,
    "structural_score" integer,
    "error_normalized" "text",
    "prompt_version" "text" NOT NULL,
    "code_version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."llm_experiment_runs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."llm_model_daily_report" WITH ("security_invoker"='true') AS
 SELECT "date"("created_at") AS "report_date",
    "experiment_id",
    "selected_model",
    "count"(*) FILTER (WHERE ("status" <> ALL (ARRAY['excluded'::"text", 'running'::"text"]))) AS "runs_valid",
    "count"(*) FILTER (WHERE ("status" = 'success'::"text")) AS "runs_success",
    "count"(*) FILTER (WHERE ("status" = 'quality_failure'::"text")) AS "runs_quality_failure",
    "count"(*) FILTER (WHERE ("status" = 'failed'::"text")) AS "runs_failed",
    "count"(*) FILTER (WHERE ("fallback_used" = true)) AS "runs_fallback",
    "round"("avg"("total_cost_usd"), 6) AS "avg_cost_per_dossier",
    "sum"("total_cost_usd") AS "total_cost",
    "round"("avg"("input_tokens")) AS "avg_input_tokens",
    "round"("avg"("output_tokens")) AS "avg_output_tokens",
    "round"("avg"("total_latency_ms")) AS "avg_latency_ms",
    "percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (("total_latency_ms")::double precision)) AS "p50_latency_ms",
    "percentile_cont"((0.95)::double precision) WITHIN GROUP (ORDER BY (("total_latency_ms")::double precision)) AS "p95_latency_ms",
    "round"("avg"("report_chars")) AS "avg_report_chars",
    "round"("avg"("valid_sources_count")) AS "avg_valid_sources",
    "round"("avg"("structural_score"), 2) AS "avg_structural_score",
    "round"(((100.0 * ("count"(*) FILTER (WHERE ("porta_markers_valid" = true)))::numeric) / (NULLIF("count"(*) FILTER (WHERE ("status" <> ALL (ARRAY['excluded'::"text", 'running'::"text"]))), 0))::numeric), 2) AS "pct_porta_valid"
   FROM "public"."llm_experiment_runs" "r"
  GROUP BY ("date"("created_at")), "experiment_id", "selected_model"
  ORDER BY ("date"("created_at")) DESC, "selected_model";


ALTER VIEW "public"."llm_model_daily_report" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operator_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "text" NOT NULL,
    "email_normalized" "text",
    "session_id" "uuid",
    "event_name" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "company_cnpj" "text",
    "company_name" "text",
    "environment" "text",
    "route" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."operator_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operator_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "text" NOT NULL,
    "email_normalized" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "last_seen_at" timestamp with time zone,
    "duration_seconds" integer,
    "ended_reason" "text",
    "environment" "text",
    "app_version" "text",
    "user_agent" "text"
);


ALTER TABLE "public"."operator_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "operator_id" "text" NOT NULL,
    "email" "text",
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."radar_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "text" NOT NULL,
    "alert_data" "jsonb" NOT NULL,
    "meta_insight" "text",
    "last_scan" timestamp with time zone,
    "synced_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."radar_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."radar_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "text" NOT NULL,
    "config" "jsonb" NOT NULL,
    "synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."radar_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scout_diagnostics" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run_id" "text" NOT NULL,
    "session_id" "text",
    "operator_id" "text",
    "environment" "text",
    "app_version" "text",
    "route" "text",
    "user_agent" "text",
    "area" "text" NOT NULL,
    "event" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "elapsed_ms" double precision,
    "payload" "jsonb"
);


ALTER TABLE "public"."scout_diagnostics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."scout_diagnostics_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."scout_diagnostics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."scout_diagnostics_id_seq" OWNED BY "public"."scout_diagnostics"."id";



CREATE TABLE IF NOT EXISTS "public"."shared_dossiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dossier_id" "uuid" NOT NULL,
    "operator_id" "text" NOT NULL,
    "access_token" "text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    "view_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shared_dossiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_context" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "text" NOT NULL,
    "display_name" "text",
    "email" "text",
    "auth_provider" "text" DEFAULT 'local'::"text",
    "supabase_auth_id" "uuid",
    "last_seen" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email_normalized" "text"
);


ALTER TABLE "public"."user_context" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_company_ranking" AS
 SELECT "company_cnpj" AS "cnpj",
    "max"("company_name") AS "nome_empresa",
    "count"(*) AS "total_pesquisas",
    "count"(DISTINCT COALESCE("email_normalized", "operator_id")) AS "usuarios_unicos",
    ("min"("created_at"))::"date" AS "primeira_pesquisa",
    ("max"("created_at"))::"date" AS "ultima_pesquisa"
   FROM "public"."operator_events"
  WHERE (("event_name" = 'dossier_started'::"text") AND ("company_cnpj" IS NOT NULL))
  GROUP BY "company_cnpj"
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."vw_company_ranking" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_daily_usage" AS
 SELECT "date"("created_at") AS "data",
    "count"(*) AS "total_eventos",
    "count"(DISTINCT COALESCE("email_normalized", "operator_id")) AS "usuarios_unicos",
    "count"(DISTINCT "session_id") AS "sessoes_unicas",
    "count"(*) FILTER (WHERE ("event_name" = 'dossier_started'::"text")) AS "pesquisas_iniciadas",
    "count"(*) FILTER (WHERE ("event_name" = 'dossier_completed'::"text")) AS "pesquisas_concluidas",
    "count"(*) FILTER (WHERE ("event_name" = 'dossier_failed'::"text")) AS "pesquisas_falhas",
    "count"(*) FILTER (WHERE ("event_name" = 'app_opened'::"text")) AS "app_aberturas",
    "count"(*) FILTER (WHERE ("event_name" = 'operator_registered'::"text")) AS "novos_registros"
   FROM "public"."operator_events"
  GROUP BY ("date"("created_at"))
  ORDER BY ("date"("created_at")) DESC;


ALTER VIEW "public"."vw_daily_usage" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_event_funnel" AS
 SELECT "event_name" AS "evento",
    "count"(*) AS "total",
    "count"(DISTINCT COALESCE("email_normalized", "operator_id")) AS "usuarios",
    "round"(((("count"(*))::numeric * 100.0) / "sum"("count"(*)) OVER ()), 1) AS "percentual"
   FROM "public"."operator_events"
  GROUP BY "event_name"
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."vw_event_funnel" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_operator_ranking" AS
 SELECT "email_normalized" AS "email",
    "min"("operator_id") AS "operator_id_canonico",
    "count"(*) AS "total_eventos",
    "count"(DISTINCT "session_id") AS "total_sessoes",
    "count"(DISTINCT "date"("created_at")) AS "dias_ativos",
    ("min"("created_at"))::"date" AS "primeiro_acesso",
    ("max"("created_at"))::"date" AS "ultimo_acesso",
    "count"(*) FILTER (WHERE ("event_name" = 'dossier_started'::"text")) AS "pesquisas_iniciadas",
    "count"(*) FILTER (WHERE ("event_name" = 'dossier_completed'::"text")) AS "pesquisas_concluidas",
    "count"(*) FILTER (WHERE ("event_name" = 'dossier_shared'::"text")) AS "compartilhamentos"
   FROM "public"."operator_events"
  WHERE (("email_normalized" IS NOT NULL) AND ("email_normalized" !~~ 'bruno.%'::"text") AND ("email_normalized" !~~ 'e2e.%'::"text") AND ("email_normalized" !~~ 'dev@%'::"text") AND ("email_normalized" !~~ 'test@%'::"text") AND ("email_normalized" !~~ 'teste@%'::"text"))
  GROUP BY "email_normalized"
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."vw_operator_ranking" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_metrics_summary" AS
 SELECT ( SELECT "count"(*) AS "count"
           FROM "public"."vw_operator_ranking") AS "total_usuarios",
    ( SELECT "count"(DISTINCT "operator_events"."email_normalized") AS "count"
           FROM "public"."operator_events"
          WHERE (("date"("operator_events"."created_at") = CURRENT_DATE) AND ("operator_events"."email_normalized" IS NOT NULL))) AS "ativos_hoje",
    ( SELECT "count"(*) AS "count"
           FROM "public"."operator_events"
          WHERE (("operator_events"."event_name" = 'dossier_started'::"text") AND ("date"("operator_events"."created_at") = CURRENT_DATE))) AS "pesquisas_hoje",
    ( SELECT "count"(*) AS "count"
           FROM "public"."operator_events"
          WHERE ("operator_events"."event_name" = 'dossier_started'::"text")) AS "pesquisas_total",
    ( SELECT "round"(((("count"(*) FILTER (WHERE ("operator_events"."event_name" = 'dossier_completed'::"text")))::numeric * 100.0) / (NULLIF("count"(*) FILTER (WHERE ("operator_events"."event_name" = 'dossier_started'::"text")), 0))::numeric), 1) AS "round"
           FROM "public"."operator_events") AS "taxa_conclusao_pct";


ALTER VIEW "public"."vw_metrics_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_session_stats" AS
 SELECT "date"("started_at") AS "data",
    "count"(*) AS "sessoes_total",
    "count"(*) FILTER (WHERE ("ended_at" IS NOT NULL)) AS "sessoes_finalizadas",
    "round"("avg"("duration_seconds")) AS "duracao_media_seg",
    "round"(("avg"("duration_seconds") / 60.0), 1) AS "duracao_media_min",
    "count"(DISTINCT COALESCE("email_normalized", "operator_id")) AS "usuarios",
    "environment" AS "ambiente"
   FROM "public"."operator_sessions"
  GROUP BY ("date"("started_at")), "environment"
  ORDER BY ("date"("started_at")) DESC;


ALTER VIEW "public"."vw_session_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waterfall_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "operator_id" "text",
    "company_name" "text",
    "event" "text" NOT NULL,
    "module_name" "text",
    "status" "text",
    "elapsed_ms" integer,
    "detail" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."waterfall_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."scout_diagnostics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."scout_diagnostics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_clientes"
    ADD CONSTRAINT "crm_clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dossier_accesses"
    ADD CONSTRAINT "dossier_accesses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dossier_runs"
    ADD CONSTRAINT "dossier_runs_owner_idempotency_key_unique" UNIQUE ("owner_id", "idempotency_key");



ALTER TABLE ONLY "public"."dossier_runs"
    ADD CONSTRAINT "dossier_runs_pkey" PRIMARY KEY ("run_id");



ALTER TABLE ONLY "public"."dossies"
    ADD CONSTRAINT "dossies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."extract_cache"
    ADD CONSTRAINT "extract_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_operator_id_cnpj_key" UNIQUE ("operator_id", "cnpj");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_events"
    ADD CONSTRAINT "feedback_events_feedback_id_key" UNIQUE ("feedback_id");



ALTER TABLE ONLY "public"."feedback_events"
    ADD CONSTRAINT "feedback_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."llm_experiment_runs"
    ADD CONSTRAINT "llm_experiment_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operator_events"
    ADD CONSTRAINT "operator_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operator_sessions"
    ADD CONSTRAINT "operator_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_operator_id_key" UNIQUE ("operator_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."radar_alerts"
    ADD CONSTRAINT "radar_alerts_operator_id_unique" UNIQUE ("operator_id");



ALTER TABLE ONLY "public"."radar_alerts"
    ADD CONSTRAINT "radar_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."radar_configs"
    ADD CONSTRAINT "radar_configs_operator_id_key" UNIQUE ("operator_id");



ALTER TABLE ONLY "public"."radar_configs"
    ADD CONSTRAINT "radar_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scout_diagnostics"
    ADD CONSTRAINT "scout_diagnostics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shared_dossiers"
    ADD CONSTRAINT "shared_dossiers_access_token_key" UNIQUE ("access_token");



ALTER TABLE ONLY "public"."shared_dossiers"
    ADD CONSTRAINT "shared_dossiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_context"
    ADD CONSTRAINT "user_context_operator_id_key" UNIQUE ("operator_id");



ALTER TABLE ONLY "public"."user_context"
    ADD CONSTRAINT "user_context_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_context"
    ADD CONSTRAINT "user_context_supabase_auth_id_key" UNIQUE ("supabase_auth_id");



ALTER TABLE ONLY "public"."waterfall_logs"
    ADD CONSTRAINT "waterfall_logs_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audit_log_operator_created" ON "public"."audit_log" USING "btree" ("operator_id", "created_at" DESC);



CREATE INDEX "idx_crm_clientes_cnpj" ON "public"."crm_clientes" USING "btree" ("cnpj");



CREATE INDEX "idx_crm_clientes_linha_produto" ON "public"."crm_clientes" USING "btree" ("linha_produto");



CREATE INDEX "idx_crm_clientes_razao_social_trgm" ON "public"."crm_clientes" USING "gin" ("razao_social" "public"."gin_trgm_ops");



CREATE INDEX "idx_dossier_accesses_cnpj" ON "public"."dossier_accesses" USING "btree" ("cnpj", "accessed_at" DESC) WHERE ("cnpj" IS NOT NULL);



CREATE INDEX "idx_dossier_accesses_dossier" ON "public"."dossier_accesses" USING "btree" ("dossier_id", "accessed_at" DESC);



CREATE INDEX "idx_dossier_accesses_operator" ON "public"."dossier_accesses" USING "btree" ("operator_id", "accessed_at" DESC);



CREATE INDEX "idx_dossier_runs_dossier" ON "public"."dossier_runs" USING "btree" ("dossier_id") WHERE ("dossier_id" IS NOT NULL);



CREATE INDEX "idx_dossier_runs_expired_lease" ON "public"."dossier_runs" USING "btree" ("lease_expires_at") WHERE ("lease_expires_at" IS NOT NULL);



CREATE INDEX "idx_dossier_runs_owner_status" ON "public"."dossier_runs" USING "btree" ("owner_id", "status", "created_at" DESC);



CREATE INDEX "idx_dossier_runs_session" ON "public"."dossier_runs" USING "btree" ("session_id") WHERE ("session_id" IS NOT NULL);



CREATE INDEX "idx_dossies_cnpj_created" ON "public"."dossies" USING "btree" ("cnpj", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_dossies_operator_cnpj" ON "public"."dossies" USING "btree" ("operator_id", "cnpj");



CREATE INDEX "idx_dossies_operator_created" ON "public"."dossies" USING "btree" ("operator_id", "created_at" DESC);



CREATE INDEX "idx_extract_cache_operator" ON "public"."extract_cache" USING "btree" ("operator_id");



CREATE INDEX "idx_favorites_operator" ON "public"."favorites" USING "btree" ("operator_id");



CREATE INDEX "idx_feedback_events_operator_created" ON "public"."feedback_events" USING "btree" ("operator_id", "created_at" DESC);



CREATE INDEX "idx_feedback_events_reason" ON "public"."feedback_events" USING "btree" ("reason");



CREATE INDEX "idx_feedback_events_session" ON "public"."feedback_events" USING "btree" ("session_id");



CREATE INDEX "idx_llm_runs_created" ON "public"."llm_experiment_runs" USING "btree" ("created_at");



CREATE INDEX "idx_llm_runs_experiment_model" ON "public"."llm_experiment_runs" USING "btree" ("experiment_id", "selected_model");



CREATE INDEX "idx_llm_runs_model_created" ON "public"."llm_experiment_runs" USING "btree" ("selected_model", "created_at");



CREATE INDEX "idx_llm_runs_status" ON "public"."llm_experiment_runs" USING "btree" ("status");



CREATE INDEX "idx_operator_events_name" ON "public"."operator_events" USING "btree" ("event_name", "created_at" DESC);



CREATE INDEX "idx_operator_events_operator" ON "public"."operator_events" USING "btree" ("operator_id", "created_at" DESC);



CREATE INDEX "idx_operator_events_session" ON "public"."operator_events" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "idx_operator_sessions_operator" ON "public"."operator_sessions" USING "btree" ("operator_id", "started_at" DESC);



CREATE INDEX "idx_operator_sessions_stale" ON "public"."operator_sessions" USING "btree" ("last_seen_at") WHERE ("ended_at" IS NULL);



CREATE INDEX "idx_radar_alerts_operator" ON "public"."radar_alerts" USING "btree" ("operator_id");



CREATE INDEX "idx_radar_configs_operator" ON "public"."radar_configs" USING "btree" ("operator_id");



CREATE INDEX "idx_scout_diagnostics_area_event_created" ON "public"."scout_diagnostics" USING "btree" ("area", "event", "created_at" DESC);



CREATE INDEX "idx_scout_diagnostics_blank_panel_created" ON "public"."scout_diagnostics" USING "btree" ("created_at" DESC) WHERE ("area" = 'BlankPanel'::"text");



CREATE INDEX "idx_scout_diagnostics_created_at" ON "public"."scout_diagnostics" USING "btree" ("created_at");



CREATE INDEX "idx_scout_diagnostics_operator_created" ON "public"."scout_diagnostics" USING "btree" ("operator_id", "created_at" DESC);



CREATE INDEX "idx_scout_diagnostics_run_id" ON "public"."scout_diagnostics" USING "btree" ("run_id");



CREATE INDEX "idx_scout_diagnostics_session_created" ON "public"."scout_diagnostics" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "idx_scout_diagnostics_session_id" ON "public"."scout_diagnostics" USING "btree" ("session_id");



CREATE INDEX "idx_scout_diagnostics_severity" ON "public"."scout_diagnostics" USING "btree" ("severity");



CREATE INDEX "idx_sd_created_at" ON "public"."scout_diagnostics" USING "btree" ("created_at");



CREATE INDEX "idx_sd_run_id" ON "public"."scout_diagnostics" USING "btree" ("run_id");



CREATE INDEX "idx_sd_session_id" ON "public"."scout_diagnostics" USING "btree" ("session_id");



CREATE INDEX "idx_sd_severity" ON "public"."scout_diagnostics" USING "btree" ("severity");



CREATE INDEX "idx_shared_dossiers_token" ON "public"."shared_dossiers" USING "btree" ("access_token");



CREATE INDEX "idx_user_context_email_normalized" ON "public"."user_context" USING "btree" ("email_normalized");



CREATE INDEX "idx_user_context_supabase_auth_id" ON "public"."user_context" USING "btree" ("supabase_auth_id") WHERE ("supabase_auth_id" IS NOT NULL);



CREATE INDEX "idx_waterfall_logs_session" ON "public"."waterfall_logs" USING "btree" ("session_id", "created_at");



CREATE UNIQUE INDEX "user_context_email_normalized_unique_idx" ON "public"."user_context" USING "btree" ("email_normalized") WHERE (("email_normalized" IS NOT NULL) AND ("email_normalized" <> ''::"text"));



ALTER TABLE ONLY "public"."dossier_accesses"
    ADD CONSTRAINT "dossier_accesses_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dossier_runs"
    ADD CONSTRAINT "dossier_runs_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dossier_runs"
    ADD CONSTRAINT "dossier_runs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shared_dossiers"
    ADD CONSTRAINT "shared_dossiers_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossies"("id") ON DELETE CASCADE;



CREATE POLICY "Permitir insert anonimo em waterfall_logs" ON "public"."waterfall_logs" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Permitir select pelo operador dono" ON "public"."waterfall_logs" FOR SELECT TO "authenticated" USING (("operator_id" = ( SELECT ("auth"."uid"())::"text" AS "uid")));



CREATE POLICY "Usuário atualiza próprio perfil" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Usuário lê próprio perfil" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_insert_own_radar_alerts" ON "public"."radar_alerts" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "radar_alerts"."operator_id"))))));



CREATE POLICY "authenticated_insert_own_radar_configs" ON "public"."radar_configs" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "radar_configs"."operator_id"))))));



CREATE POLICY "authenticated_insert_own_user_context" ON "public"."user_context" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "user_context"."operator_id"))))));



CREATE POLICY "authenticated_read_own_dossier_runs" ON "public"."dossier_runs" FOR SELECT TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "authenticated_select_own_radar_alerts" ON "public"."radar_alerts" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "radar_alerts"."operator_id"))))));



CREATE POLICY "authenticated_select_own_radar_configs" ON "public"."radar_configs" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "radar_configs"."operator_id"))))));



CREATE POLICY "authenticated_select_own_user_context" ON "public"."user_context" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND (("p"."operator_id" = "user_context"."operator_id") OR (("user_context"."email_normalized" IS NOT NULL) AND ("user_context"."email_normalized" = "lower"("p"."email")))))))));



CREATE POLICY "authenticated_update_own_radar_alerts" ON "public"."radar_alerts" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "radar_alerts"."operator_id")))))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "radar_alerts"."operator_id"))))));



CREATE POLICY "authenticated_update_own_radar_configs" ON "public"."radar_configs" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "radar_configs"."operator_id")))))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "radar_configs"."operator_id"))))));



CREATE POLICY "authenticated_update_own_user_context" ON "public"."user_context" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "user_context"."operator_id")))))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."operator_id" = "user_context"."operator_id"))))));



ALTER TABLE "public"."crm_clientes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deny_anon_all_llm_experiment_runs" ON "public"."llm_experiment_runs" TO "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."dossier_accesses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dossier_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dossies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."extract_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."llm_experiment_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operadores_leem_crm" ON "public"."crm_clientes" FOR SELECT USING (true);



ALTER TABLE "public"."operator_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operator_insert_dossier_accesses" ON "public"."dossier_accesses" FOR INSERT TO "authenticated", "anon" WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_audit_log" ON "public"."audit_log" TO "anon" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_dossies" ON "public"."dossies" TO "authenticated", "anon" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_events" ON "public"."operator_events" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_extract_cache" ON "public"."extract_cache" TO "anon" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_favorites" ON "public"."favorites" TO "anon" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_feedback_events" ON "public"."feedback_events" TO "anon" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_radar_alerts" ON "public"."radar_alerts" TO "anon" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_radar_configs" ON "public"."radar_configs" TO "anon" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_sessions" ON "public"."operator_sessions" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_shared_dossiers" ON "public"."shared_dossiers" TO "anon" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_own_user_context" ON "public"."user_context" TO "anon" USING (("operator_id" IS NOT NULL)) WITH CHECK (("operator_id" IS NOT NULL));



CREATE POLICY "operator_select_dossier_accesses" ON "public"."dossier_accesses" FOR SELECT TO "authenticated", "anon" USING (("operator_id" IS NOT NULL));



ALTER TABLE "public"."operator_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."radar_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."radar_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scout_diagnostics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role le todos os perfis" ON "public"."profiles" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "service_role_gerencia_crm" ON "public"."crm_clientes" USING (true) WITH CHECK (true);



ALTER TABLE "public"."shared_dossiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shared_dossiers_access_token" ON "public"."shared_dossiers" FOR SELECT TO "anon" USING ((("access_token" IS NOT NULL) AND ("expires_at" > "now"())));



ALTER TABLE "public"."user_context" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waterfall_logs" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."dossier_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."dossier_runs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."acquire_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text", "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."acquire_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text", "p_lease_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."acquire_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text", "p_lease_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_close_stale_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_close_stale_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_close_stale_sessions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_dossier_run"("p_run_id" "uuid", "p_lease_owner" "text", "p_dossier_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_dossier_run"("p_run_id" "uuid", "p_lease_owner" "text", "p_dossier_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_dossier_run"("p_run_id" "uuid", "p_lease_owner" "text", "p_dossier_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_or_get_dossier_run"("p_idempotency_key" "text", "p_session_id" "uuid", "p_environment" "text", "p_app_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_or_get_dossier_run"("p_idempotency_key" "text", "p_session_id" "uuid", "p_environment" "text", "p_app_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_or_get_dossier_run"("p_idempotency_key" "text", "p_session_id" "uuid", "p_environment" "text", "p_app_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fail_dossier_run"("p_run_id" "uuid", "p_lease_owner" "text", "p_error_code" "text", "p_error_stage" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fail_dossier_run"("p_run_id" "uuid", "p_lease_owner" "text", "p_error_code" "text", "p_error_stage" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fail_dossier_run"("p_run_id" "uuid", "p_lease_owner" "text", "p_error_code" "text", "p_error_stage" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_expired_unconfirmed_users"("older_than" timestamp with time zone, "max_results" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_expired_unconfirmed_users"("older_than" timestamp with time zone, "max_results" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_own_dossier_run"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_own_dossier_run"("p_run_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_own_dossier_run"("p_run_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."link_legacy_operator"("p_auth_user_id" "uuid", "p_operator_id" "text", "p_email" "text", "p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."link_legacy_operator"("p_auth_user_id" "uuid", "p_operator_id" "text", "p_email" "text", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_legacy_operator"("p_auth_user_id" "uuid", "p_operator_id" "text", "p_email" "text", "p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_dossier_run_cancelled"("p_run_id" "uuid", "p_lease_owner" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_dossier_run_cancelled"("p_run_id" "uuid", "p_lease_owner" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_dossier_run_cancelled"("p_run_id" "uuid", "p_lease_owner" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."renew_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text", "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."renew_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text", "p_lease_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."renew_dossier_run_lease"("p_run_id" "uuid", "p_lease_owner" "text", "p_lease_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_dossier_run_cancel"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_dossier_run_cancel"("p_run_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_dossier_run_cancel"("p_run_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."crm_clientes" TO "anon";
GRANT ALL ON TABLE "public"."crm_clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_clientes" TO "service_role";



GRANT ALL ON TABLE "public"."dossier_accesses" TO "anon";
GRANT ALL ON TABLE "public"."dossier_accesses" TO "authenticated";
GRANT ALL ON TABLE "public"."dossier_accesses" TO "service_role";



GRANT ALL ON TABLE "public"."dossies" TO "anon";
GRANT ALL ON TABLE "public"."dossies" TO "authenticated";
GRANT ALL ON TABLE "public"."dossies" TO "service_role";



GRANT ALL ON TABLE "public"."extract_cache" TO "anon";
GRANT ALL ON TABLE "public"."extract_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."extract_cache" TO "service_role";



GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_events" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_events" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."feedback_events" TO "anon";



GRANT ALL ON TABLE "public"."llm_experiment_runs" TO "anon";
GRANT ALL ON TABLE "public"."llm_experiment_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_experiment_runs" TO "service_role";



GRANT ALL ON TABLE "public"."llm_model_daily_report" TO "service_role";



GRANT ALL ON TABLE "public"."operator_events" TO "anon";
GRANT ALL ON TABLE "public"."operator_events" TO "authenticated";
GRANT ALL ON TABLE "public"."operator_events" TO "service_role";



GRANT ALL ON TABLE "public"."operator_sessions" TO "anon";
GRANT ALL ON TABLE "public"."operator_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."operator_sessions" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("name") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."radar_alerts" TO "anon";
GRANT ALL ON TABLE "public"."radar_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."radar_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."radar_configs" TO "anon";
GRANT ALL ON TABLE "public"."radar_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."radar_configs" TO "service_role";



GRANT ALL ON TABLE "public"."scout_diagnostics" TO "anon";
GRANT ALL ON TABLE "public"."scout_diagnostics" TO "authenticated";
GRANT ALL ON TABLE "public"."scout_diagnostics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."scout_diagnostics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."scout_diagnostics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."scout_diagnostics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shared_dossiers" TO "anon";
GRANT ALL ON TABLE "public"."shared_dossiers" TO "authenticated";
GRANT ALL ON TABLE "public"."shared_dossiers" TO "service_role";



GRANT ALL ON TABLE "public"."user_context" TO "anon";
GRANT ALL ON TABLE "public"."user_context" TO "authenticated";
GRANT ALL ON TABLE "public"."user_context" TO "service_role";



GRANT ALL ON TABLE "public"."vw_company_ranking" TO "anon";
GRANT ALL ON TABLE "public"."vw_company_ranking" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_company_ranking" TO "service_role";



GRANT ALL ON TABLE "public"."vw_daily_usage" TO "anon";
GRANT ALL ON TABLE "public"."vw_daily_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_daily_usage" TO "service_role";



GRANT ALL ON TABLE "public"."vw_event_funnel" TO "anon";
GRANT ALL ON TABLE "public"."vw_event_funnel" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_event_funnel" TO "service_role";



GRANT ALL ON TABLE "public"."vw_operator_ranking" TO "anon";
GRANT ALL ON TABLE "public"."vw_operator_ranking" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_operator_ranking" TO "service_role";



GRANT ALL ON TABLE "public"."vw_metrics_summary" TO "anon";
GRANT ALL ON TABLE "public"."vw_metrics_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_metrics_summary" TO "service_role";



GRANT ALL ON TABLE "public"."vw_session_stats" TO "anon";
GRANT ALL ON TABLE "public"."vw_session_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_session_stats" TO "service_role";



GRANT ALL ON TABLE "public"."waterfall_logs" TO "anon";
GRANT ALL ON TABLE "public"."waterfall_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."waterfall_logs" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








-- =====================================================================
-- Trigger on_auth_user_created (pertence ao schema auth, não emitido por pg_dump --schema public)
-- Obtido via pg_get_triggerdef em Produção
-- =====================================================================
CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
