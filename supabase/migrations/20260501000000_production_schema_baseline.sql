-- =====================================================================
-- Production Schema Baseline (Canônico Dump Efetivo)
-- Timestamp: 20260501000000 (Anterior a todas as migrations remotas)
-- Representa a estrutura integral e exata do schema public em Produção.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. SEQUÊNCIAS
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.scout_diagnostics_id_seq AS bigint START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

-- ---------------------------------------------------------------------
-- 2. TABELAS PÚBLICAS (18 TABELAS CANÔNICAS DE PRODUÇÃO)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  operator_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.crm_clientes (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  razao_social TEXT NOT NULL,
  cnpj TEXT,
  linha_produto TEXT,
  agrupador_modulos TEXT,
  estado TEXT,
  cidade TEXT,
  cnae TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.crm_clientes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dossier_accesses (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  dossier_id UUID NOT NULL,
  operator_id TEXT NOT NULL,
  cnpj TEXT,
  accessed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE public.dossier_accesses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dossier_runs (
  run_id UUID DEFAULT gen_random_uuid() NOT NULL,
  owner_id UUID NOT NULL,
  operator_id TEXT NOT NULL,
  session_id UUID,
  dossier_id UUID,
  status TEXT DEFAULT 'PENDING'::text NOT NULL,
  idempotency_key TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  environment TEXT NOT NULL,
  app_version TEXT NOT NULL,
  error_code TEXT,
  error_stage TEXT
);
ALTER TABLE public.dossier_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dossies (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  operator_id TEXT NOT NULL,
  title TEXT,
  empresa_alvo TEXT,
  cnpj TEXT,
  modo_principal TEXT,
  score_oportunidade INTEGER,
  resumo_dossie TEXT,
  content JSONB NOT NULL,
  synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  operator_email TEXT
);
ALTER TABLE public.dossies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.extract_cache (
  id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  result JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.extract_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  operator_id TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  company_name TEXT,
  reason TEXT,
  dossier_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.feedback_events (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  feedback_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  user_name TEXT,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  section_key TEXT,
  section_title TEXT,
  feedback_type TEXT NOT NULL,
  reason TEXT,
  comment TEXT DEFAULT ''::text,
  ai_content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.llm_experiment_runs (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  experiment_id TEXT NOT NULL,
  variant TEXT,
  selected_model TEXT NOT NULL,
  provider TEXT NOT NULL,
  litellm_base_url TEXT,
  environment TEXT DEFAULT 'production'::text NOT NULL,
  run_id TEXT NOT NULL,
  session_id TEXT,
  operator_id TEXT,
  company_name TEXT,
  company_cnpj_hash TEXT,
  status TEXT DEFAULT 'running'::text NOT NULL,
  exclusion_reason TEXT,
  fallback_used BOOLEAN DEFAULT false,
  fallback_model TEXT,
  retry_count INTEGER DEFAULT 0,
  total_latency_ms INTEGER,
  model_latency_ms INTEGER,
  waterfall_duration_ms INTEGER,
  modules_generated INTEGER,
  modules_required_present INTEGER,
  modules_missing TEXT[],
  report_chars INTEGER,
  report_tokens_estimated INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  input_cost_usd NUMERIC,
  output_cost_usd NUMERIC,
  total_cost_usd NUMERIC,
  estimated_cost BOOLEAN DEFAULT false,
  cost_estimation_method TEXT,
  input_price_used NUMERIC,
  output_price_used NUMERIC,
  sources_count INTEGER,
  valid_sources_count INTEGER,
  removed_sources_count INTEGER,
  porta_score_present BOOLEAN,
  porta_markers_valid BOOLEAN,
  porta_score INTEGER,
  teia_complexidade_present BOOLEAN,
  teia_complexidade TEXT,
  parser_success BOOLEAN,
  render_success BOOLEAN,
  prompt_leak_detected BOOLEAN,
  response_empty BOOLEAN,
  response_truncated BOOLEAN,
  markdown_broken BOOLEAN,
  structural_score INTEGER,
  error_normalized TEXT,
  prompt_version TEXT NOT NULL,
  code_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.llm_experiment_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.operator_events (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  operator_id TEXT NOT NULL,
  email_normalized TEXT,
  session_id UUID,
  event_name TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  company_cnpj TEXT,
  company_name TEXT,
  environment TEXT,
  route TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE public.operator_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.operator_sessions (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  operator_id TEXT NOT NULL,
  email_normalized TEXT,
  started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  ended_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  ended_reason TEXT,
  environment TEXT,
  app_version TEXT,
  user_agent TEXT
);
ALTER TABLE public.operator_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL,
  operator_id TEXT NOT NULL,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.radar_alerts (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  operator_id TEXT NOT NULL,
  alert_data JSONB NOT NULL,
  meta_insight TEXT,
  last_scan TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.radar_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.radar_configs (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  operator_id TEXT NOT NULL,
  config JSONB NOT NULL,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.radar_configs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.scout_diagnostics (
  id BIGINT DEFAULT nextval('scout_diagnostics_id_seq'::regclass) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  run_id TEXT NOT NULL,
  session_id TEXT,
  operator_id TEXT,
  environment TEXT,
  app_version TEXT,
  route TEXT,
  user_agent TEXT,
  area TEXT NOT NULL,
  event TEXT NOT NULL,
  severity TEXT DEFAULT 'info'::text NOT NULL,
  elapsed_ms DOUBLE PRECISION,
  payload JSONB
);
ALTER TABLE public.scout_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shared_dossiers (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  dossier_id UUID NOT NULL,
  operator_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT (now() + '7 days'::interval),
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.shared_dossiers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_context (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  operator_id TEXT NOT NULL,
  display_name TEXT,
  email TEXT,
  auth_provider TEXT DEFAULT 'local'::text,
  supabase_auth_id UUID,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  email_normalized TEXT
);
ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.waterfall_logs (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  session_id TEXT NOT NULL,
  operator_id TEXT,
  company_name TEXT,
  event TEXT NOT NULL,
  module_name TEXT,
  status TEXT,
  elapsed_ms INTEGER,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE public.waterfall_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3. ÍNDICES
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX extract_cache_pkey ON public.extract_cache USING btree (id);
CREATE INDEX idx_extract_cache_operator ON public.extract_cache USING btree (operator_id);
CREATE UNIQUE INDEX radar_configs_pkey ON public.radar_configs USING btree (id);
CREATE UNIQUE INDEX radar_configs_operator_id_key ON public.radar_configs USING btree (operator_id);
CREATE INDEX idx_radar_configs_operator ON public.radar_configs USING btree (operator_id);
CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id);
CREATE INDEX idx_audit_log_operator_created ON public.audit_log USING btree (operator_id, created_at DESC);
CREATE UNIQUE INDEX dossies_pkey ON public.dossies USING btree (id);
CREATE INDEX idx_dossies_operator_created ON public.dossies USING btree (operator_id, created_at DESC);
CREATE INDEX idx_dossies_operator_cnpj ON public.dossies USING btree (operator_id, cnpj);
CREATE INDEX idx_dossies_cnpj_created ON public.dossies USING btree (cnpj, created_at DESC) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX shared_dossiers_pkey ON public.shared_dossiers USING btree (id);
CREATE UNIQUE INDEX shared_dossiers_access_token_key ON public.shared_dossiers USING btree (access_token);
CREATE INDEX idx_shared_dossiers_token ON public.shared_dossiers USING btree (access_token);
CREATE UNIQUE INDEX crm_clientes_pkey ON public.crm_clientes USING btree (id);
CREATE INDEX idx_crm_clientes_razao_social_trgm ON public.crm_clientes USING gin (razao_social gin_trgm_ops);
CREATE INDEX idx_crm_clientes_cnpj ON public.crm_clientes USING btree (cnpj);
CREATE INDEX idx_crm_clientes_linha_produto ON public.crm_clientes USING btree (linha_produto);
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX profiles_operator_id_key ON public.profiles USING btree (operator_id);
CREATE UNIQUE INDEX favorites_pkey ON public.favorites USING btree (id);
CREATE UNIQUE INDEX favorites_operator_id_cnpj_key ON public.favorites USING btree (operator_id, cnpj);
CREATE INDEX idx_favorites_operator ON public.favorites USING btree (operator_id);
CREATE UNIQUE INDEX waterfall_logs_pkey ON public.waterfall_logs USING btree (id);
CREATE INDEX idx_waterfall_logs_session ON public.waterfall_logs USING btree (session_id, created_at);
CREATE UNIQUE INDEX dossier_runs_pkey ON public.dossier_runs USING btree (run_id);
CREATE UNIQUE INDEX dossier_runs_owner_idempotency_key_unique ON public.dossier_runs USING btree (owner_id, idempotency_key);
CREATE INDEX idx_dossier_runs_owner_status ON public.dossier_runs USING btree (owner_id, status, created_at DESC);
CREATE INDEX idx_dossier_runs_expired_lease ON public.dossier_runs USING btree (lease_expires_at) WHERE (lease_expires_at IS NOT NULL);
CREATE INDEX idx_dossier_runs_session ON public.dossier_runs USING btree (session_id) WHERE (session_id IS NOT NULL);
CREATE INDEX idx_dossier_runs_dossier ON public.dossier_runs USING btree (dossier_id) WHERE (dossier_id IS NOT NULL);
CREATE UNIQUE INDEX feedback_events_feedback_id_key ON public.feedback_events USING btree (feedback_id);
CREATE UNIQUE INDEX feedback_events_pkey ON public.feedback_events USING btree (id);
CREATE INDEX idx_feedback_events_operator_created ON public.feedback_events USING btree (operator_id, created_at DESC);
CREATE INDEX idx_feedback_events_session ON public.feedback_events USING btree (session_id);
CREATE INDEX idx_feedback_events_reason ON public.feedback_events USING btree (reason);
CREATE UNIQUE INDEX scout_diagnostics_pkey ON public.scout_diagnostics USING btree (id);
CREATE INDEX idx_scout_diagnostics_run_id ON public.scout_diagnostics USING btree (run_id);
CREATE INDEX idx_scout_diagnostics_session_id ON public.scout_diagnostics USING btree (session_id);
CREATE INDEX idx_scout_diagnostics_created_at ON public.scout_diagnostics USING btree (created_at);
CREATE INDEX idx_scout_diagnostics_severity ON public.scout_diagnostics USING btree (severity);
CREATE INDEX idx_sd_run_id ON public.scout_diagnostics USING btree (run_id);
CREATE INDEX idx_sd_session_id ON public.scout_diagnostics USING btree (session_id);
CREATE INDEX idx_sd_created_at ON public.scout_diagnostics USING btree (created_at);
CREATE INDEX idx_sd_severity ON public.scout_diagnostics USING btree (severity);
CREATE INDEX idx_scout_diagnostics_session_created ON public.scout_diagnostics USING btree (session_id, created_at DESC);
CREATE INDEX idx_scout_diagnostics_area_event_created ON public.scout_diagnostics USING btree (area, event, created_at DESC);
CREATE INDEX idx_scout_diagnostics_operator_created ON public.scout_diagnostics USING btree (operator_id, created_at DESC);
CREATE INDEX idx_scout_diagnostics_blank_panel_created ON public.scout_diagnostics USING btree (created_at DESC) WHERE (area = 'BlankPanel'::text);
CREATE UNIQUE INDEX user_context_pkey ON public.user_context USING btree (id);
CREATE UNIQUE INDEX user_context_operator_id_key ON public.user_context USING btree (operator_id);
CREATE UNIQUE INDEX user_context_supabase_auth_id_key ON public.user_context USING btree (supabase_auth_id);
CREATE INDEX idx_user_context_email_normalized ON public.user_context USING btree (email_normalized);
CREATE INDEX idx_user_context_supabase_auth_id ON public.user_context USING btree (supabase_auth_id) WHERE (supabase_auth_id IS NOT NULL);
CREATE UNIQUE INDEX user_context_email_normalized_unique_idx ON public.user_context USING btree (email_normalized) WHERE ((email_normalized IS NOT NULL) AND (email_normalized <> ''::text));
CREATE UNIQUE INDEX radar_alerts_pkey ON public.radar_alerts USING btree (id);
CREATE INDEX idx_radar_alerts_operator ON public.radar_alerts USING btree (operator_id);
CREATE UNIQUE INDEX radar_alerts_operator_id_unique ON public.radar_alerts USING btree (operator_id);
CREATE UNIQUE INDEX llm_experiment_runs_pkey ON public.llm_experiment_runs USING btree (id);
CREATE INDEX idx_llm_runs_experiment_model ON public.llm_experiment_runs USING btree (experiment_id, selected_model);
CREATE INDEX idx_llm_runs_created ON public.llm_experiment_runs USING btree (created_at);
CREATE INDEX idx_llm_runs_status ON public.llm_experiment_runs USING btree (status);
CREATE INDEX idx_llm_runs_model_created ON public.llm_experiment_runs USING btree (selected_model, created_at);
CREATE UNIQUE INDEX dossier_accesses_pkey ON public.dossier_accesses USING btree (id);
CREATE INDEX idx_dossier_accesses_dossier ON public.dossier_accesses USING btree (dossier_id, accessed_at DESC);
CREATE INDEX idx_dossier_accesses_operator ON public.dossier_accesses USING btree (operator_id, accessed_at DESC);
CREATE INDEX idx_dossier_accesses_cnpj ON public.dossier_accesses USING btree (cnpj, accessed_at DESC) WHERE (cnpj IS NOT NULL);
CREATE UNIQUE INDEX operator_sessions_pkey ON public.operator_sessions USING btree (id);
CREATE INDEX idx_operator_sessions_operator ON public.operator_sessions USING btree (operator_id, started_at DESC);
CREATE INDEX idx_operator_sessions_stale ON public.operator_sessions USING btree (last_seen_at) WHERE (ended_at IS NULL);
CREATE UNIQUE INDEX operator_events_pkey ON public.operator_events USING btree (id);
CREATE INDEX idx_operator_events_operator ON public.operator_events USING btree (operator_id, created_at DESC);
CREATE INDEX idx_operator_events_name ON public.operator_events USING btree (event_name, created_at DESC);
CREATE INDEX idx_operator_events_session ON public.operator_events USING btree (session_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 4. FUNÇÕES E RPCS DE PRODUÇÃO
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$;

CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$;

CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$;

CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$;

CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$;

CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$;

CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$;

CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$;

CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$;

CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$;

CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$;

CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$;

CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$;

CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$;

CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$;

CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$;

CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$;

CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$;

CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$;

CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$;

CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$;

CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$;

CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$;

CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$;

CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$;

CREATE OR REPLACE FUNCTION public.auto_close_stale_sessions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  new_operator_id TEXT;
BEGIN
  new_operator_id := 'op_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.profiles (id, operator_id, email, name)
  VALUES (NEW.id, new_operator_id, NEW.email, NEW.raw_user_meta_data->>'name');

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_expired_unconfirmed_users(older_than timestamp with time zone, max_results integer DEFAULT 50)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT u.id
  FROM auth.users u
  WHERE u.created_at < older_than
    AND u.last_sign_in_at IS NULL
    AND u.deleted_at IS NULL
  LIMIT max_results;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_legacy_operator(p_auth_user_id uuid, p_operator_id text, p_email text DEFAULT NULL::text, p_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.create_or_get_dossier_run(p_idempotency_key text, p_session_id uuid, p_environment text, p_app_version text)
 RETURNS dossier_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.get_own_dossier_run(p_run_id uuid)
 RETURNS dossier_runs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT r.* FROM public.dossier_runs r WHERE r.run_id = p_run_id AND r.owner_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.acquire_dossier_run_lease(p_run_id uuid, p_lease_owner text, p_lease_seconds integer DEFAULT 45)
 RETURNS dossier_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.renew_dossier_run_lease(p_run_id uuid, p_lease_owner text, p_lease_seconds integer DEFAULT 45)
 RETURNS dossier_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.release_dossier_run_lease(p_run_id uuid, p_lease_owner text)
 RETURNS dossier_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET lease_owner = NULL, lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND lease_owner = p_lease_owner
  RETURNING * INTO v_run; RETURN v_run;
END; $function$;

CREATE OR REPLACE FUNCTION public.request_dossier_run_cancel(p_run_id uuid)
 RETURNS dossier_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET status = 'CANCEL_REQUESTED', cancel_requested_at = coalesce(cancel_requested_at, now())
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND status IN ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  RETURNING * INTO v_run; RETURN v_run;
END; $function$;

CREATE OR REPLACE FUNCTION public.mark_dossier_run_cancelled(p_run_id uuid, p_lease_owner text)
 RETURNS dossier_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.complete_dossier_run(p_run_id uuid, p_lease_owner text, p_dossier_id uuid)
 RETURNS dossier_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.fail_dossier_run(p_run_id uuid, p_lease_owner text, p_error_code text, p_error_stage text)
 RETURNS dossier_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
END; $function$;

-- ---------------------------------------------------------------------
-- 5. VIEWS OPERACIONAIS (7 VIEWS CANÔNICAS)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_daily_usage WITH (security_invoker = true) AS SELECT date(created_at) AS data,
    count(*) AS total_eventos,
    count(DISTINCT COALESCE(email_normalized, operator_id)) AS usuarios_unicos,
    count(DISTINCT session_id) AS sessoes_unicas,
    count(*) FILTER (WHERE (event_name = 'dossier_started'::text)) AS pesquisas_iniciadas,
    count(*) FILTER (WHERE (event_name = 'dossier_completed'::text)) AS pesquisas_concluidas,
    count(*) FILTER (WHERE (event_name = 'dossier_failed'::text)) AS pesquisas_falhas,
    count(*) FILTER (WHERE (event_name = 'app_opened'::text)) AS app_aberturas,
    count(*) FILTER (WHERE (event_name = 'operator_registered'::text)) AS novos_registros
   FROM operator_events
  GROUP BY (date(created_at))
  ORDER BY (date(created_at)) DESC;

CREATE OR REPLACE VIEW public.vw_company_ranking WITH (security_invoker = true) AS SELECT company_cnpj AS cnpj,
    max(company_name) AS nome_empresa,
    count(*) AS total_pesquisas,
    count(DISTINCT COALESCE(email_normalized, operator_id)) AS usuarios_unicos,
    (min(created_at))::date AS primeira_pesquisa,
    (max(created_at))::date AS ultima_pesquisa
   FROM operator_events
  WHERE ((event_name = 'dossier_started'::text) AND (company_cnpj IS NOT NULL))
  GROUP BY company_cnpj
  ORDER BY (count(*)) DESC;

CREATE OR REPLACE VIEW public.vw_event_funnel WITH (security_invoker = true) AS SELECT event_name AS evento,
    count(*) AS total,
    count(DISTINCT COALESCE(email_normalized, operator_id)) AS usuarios,
    round((((count(*))::numeric * 100.0) / sum(count(*)) OVER ()), 1) AS percentual
   FROM operator_events
  GROUP BY event_name
  ORDER BY (count(*)) DESC;

CREATE OR REPLACE VIEW public.vw_session_stats WITH (security_invoker = true) AS SELECT date(started_at) AS data,
    count(*) AS sessoes_total,
    count(*) FILTER (WHERE (ended_at IS NOT NULL)) AS sessoes_finalizadas,
    round(avg(duration_seconds)) AS duracao_media_seg,
    round((avg(duration_seconds) / 60.0), 1) AS duracao_media_min,
    count(DISTINCT COALESCE(email_normalized, operator_id)) AS usuarios,
    environment AS ambiente
   FROM operator_sessions
  GROUP BY (date(started_at)), environment
  ORDER BY (date(started_at)) DESC;

CREATE OR REPLACE VIEW public.vw_operator_ranking WITH (security_invoker = true) AS SELECT email_normalized AS email,
    min(operator_id) AS operator_id_canonico,
    count(*) AS total_eventos,
    count(DISTINCT session_id) AS total_sessoes,
    count(DISTINCT date(created_at)) AS dias_ativos,
    (min(created_at))::date AS primeiro_acesso,
    (max(created_at))::date AS ultimo_acesso,
    count(*) FILTER (WHERE (event_name = 'dossier_started'::text)) AS pesquisas_iniciadas,
    count(*) FILTER (WHERE (event_name = 'dossier_completed'::text)) AS pesquisas_concluidas,
    count(*) FILTER (WHERE (event_name = 'dossier_shared'::text)) AS compartilhamentos
   FROM operator_events
  WHERE ((email_normalized IS NOT NULL) AND (email_normalized !~~ 'bruno.%'::text) AND (email_normalized !~~ 'e2e.%'::text) AND (email_normalized !~~ 'dev@%'::text) AND (email_normalized !~~ 'test@%'::text) AND (email_normalized !~~ 'teste@%'::text))
  GROUP BY email_normalized
  ORDER BY (count(*)) DESC;

CREATE OR REPLACE VIEW public.vw_metrics_summary WITH (security_invoker = true) AS SELECT ( SELECT count(*) AS count
           FROM vw_operator_ranking) AS total_usuarios,
    ( SELECT count(DISTINCT operator_events.email_normalized) AS count
           FROM operator_events
          WHERE ((date(operator_events.created_at) = CURRENT_DATE) AND (operator_events.email_normalized IS NOT NULL))) AS ativos_hoje,
    ( SELECT count(*) AS count
           FROM operator_events
          WHERE ((operator_events.event_name = 'dossier_started'::text) AND (date(operator_events.created_at) = CURRENT_DATE))) AS pesquisas_hoje,
    ( SELECT count(*) AS count
           FROM operator_events
          WHERE (operator_events.event_name = 'dossier_started'::text)) AS pesquisas_total,
    ( SELECT round((((count(*) FILTER (WHERE (operator_events.event_name = 'dossier_completed'::text)))::numeric * 100.0) / (NULLIF(count(*) FILTER (WHERE (operator_events.event_name = 'dossier_started'::text)), 0))::numeric), 1) AS round
           FROM operator_events) AS taxa_conclusao_pct;

CREATE OR REPLACE VIEW public.llm_model_daily_report WITH (security_invoker = true) AS SELECT date(created_at) AS report_date,
    experiment_id,
    selected_model,
    count(*) FILTER (WHERE (status <> ALL (ARRAY['excluded'::text, 'running'::text]))) AS runs_valid,
    count(*) FILTER (WHERE (status = 'success'::text)) AS runs_success,
    count(*) FILTER (WHERE (status = 'quality_failure'::text)) AS runs_quality_failure,
    count(*) FILTER (WHERE (status = 'failed'::text)) AS runs_failed,
    count(*) FILTER (WHERE (fallback_used = true)) AS runs_fallback,
    round(avg(total_cost_usd), 6) AS avg_cost_per_dossier,
    sum(total_cost_usd) AS total_cost,
    round(avg(input_tokens)) AS avg_input_tokens,
    round(avg(output_tokens)) AS avg_output_tokens,
    round(avg(total_latency_ms)) AS avg_latency_ms,
    percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((total_latency_ms)::double precision)) AS p50_latency_ms,
    percentile_cont((0.95)::double precision) WITHIN GROUP (ORDER BY ((total_latency_ms)::double precision)) AS p95_latency_ms,
    round(avg(report_chars)) AS avg_report_chars,
    round(avg(valid_sources_count)) AS avg_valid_sources,
    round(avg(structural_score), 2) AS avg_structural_score,
    round(((100.0 * (count(*) FILTER (WHERE (porta_markers_valid = true)))::numeric) / (NULLIF(count(*) FILTER (WHERE (status <> ALL (ARRAY['excluded'::text, 'running'::text]))), 0))::numeric), 2) AS pct_porta_valid
   FROM llm_experiment_runs r
  GROUP BY (date(created_at)), experiment_id, selected_model
  ORDER BY (date(created_at)) DESC, selected_model;

-- ---------------------------------------------------------------------
-- 6. TRIGGERS
-- ---------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------
-- 7. POLÍTICAS DE RLS (32 POLÍTICAS CANÔNICAS DE PRODUÇÃO)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "operator_own_user_context" ON public.user_context;
CREATE POLICY "operator_own_user_context" ON public.user_context FOR ALL TO {anon} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "operator_own_radar_alerts" ON public.radar_alerts;
CREATE POLICY "operator_own_radar_alerts" ON public.radar_alerts FOR ALL TO {anon} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "operator_own_radar_configs" ON public.radar_configs;
CREATE POLICY "operator_own_radar_configs" ON public.radar_configs FOR ALL TO {anon} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "operator_own_extract_cache" ON public.extract_cache;
CREATE POLICY "operator_own_extract_cache" ON public.extract_cache FOR ALL TO {anon} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "operator_own_audit_log" ON public.audit_log;
CREATE POLICY "operator_own_audit_log" ON public.audit_log FOR ALL TO {anon} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "operator_own_favorites" ON public.favorites;
CREATE POLICY "operator_own_favorites" ON public.favorites FOR ALL TO {anon} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "operator_own_shared_dossiers" ON public.shared_dossiers;
CREATE POLICY "operator_own_shared_dossiers" ON public.shared_dossiers FOR ALL TO {anon} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "shared_dossiers_access_token" ON public.shared_dossiers;
CREATE POLICY "shared_dossiers_access_token" ON public.shared_dossiers FOR SELECT TO {anon} USING (((access_token IS NOT NULL) AND (expires_at > now())));

DROP POLICY IF EXISTS "operator_own_feedback_events" ON public.feedback_events;
CREATE POLICY "operator_own_feedback_events" ON public.feedback_events FOR ALL TO {anon} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "operator_own_sessions" ON public.operator_sessions;
CREATE POLICY "operator_own_sessions" ON public.operator_sessions FOR ALL TO {public} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "operator_own_events" ON public.operator_events;
CREATE POLICY "operator_own_events" ON public.operator_events FOR ALL TO {public} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "operadores_leem_crm" ON public.crm_clientes;
CREATE POLICY "operadores_leem_crm" ON public.crm_clientes FOR SELECT TO {public} USING (true);

DROP POLICY IF EXISTS "service_role_gerencia_crm" ON public.crm_clientes;
CREATE POLICY "service_role_gerencia_crm" ON public.crm_clientes FOR ALL TO {public} USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir insert anonimo em waterfall_logs" ON public.waterfall_logs;
CREATE POLICY "Permitir insert anonimo em waterfall_logs" ON public.waterfall_logs FOR INSERT TO {anon} WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir select pelo operador dono" ON public.waterfall_logs;
CREATE POLICY "Permitir select pelo operador dono" ON public.waterfall_logs FOR SELECT TO {authenticated} USING ((operator_id = ( SELECT (auth.uid())::text AS uid)));

DROP POLICY IF EXISTS "Usuário lê próprio perfil" ON public.profiles;
CREATE POLICY "Usuário lê próprio perfil" ON public.profiles FOR SELECT TO {authenticated} USING ((id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.profiles;
CREATE POLICY "Usuário atualiza próprio perfil" ON public.profiles FOR UPDATE TO {authenticated} USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "service_role le todos os perfis" ON public.profiles;
CREATE POLICY "service_role le todos os perfis" ON public.profiles FOR SELECT TO {service_role} USING (true);

DROP POLICY IF EXISTS "authenticated_select_own_user_context" ON public.user_context;
CREATE POLICY "authenticated_select_own_user_context" ON public.user_context FOR SELECT TO {authenticated} USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.operator_id = user_context.operator_id) OR ((user_context.email_normalized IS NOT NULL) AND (user_context.email_normalized = lower(p.email)))))))));

DROP POLICY IF EXISTS "authenticated_insert_own_user_context" ON public.user_context;
CREATE POLICY "authenticated_insert_own_user_context" ON public.user_context FOR INSERT TO {authenticated} WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = user_context.operator_id))))));

DROP POLICY IF EXISTS "authenticated_update_own_user_context" ON public.user_context;
CREATE POLICY "authenticated_update_own_user_context" ON public.user_context FOR UPDATE TO {authenticated} USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = user_context.operator_id)))))) WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = user_context.operator_id))))));

DROP POLICY IF EXISTS "authenticated_select_own_radar_alerts" ON public.radar_alerts;
CREATE POLICY "authenticated_select_own_radar_alerts" ON public.radar_alerts FOR SELECT TO {authenticated} USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = radar_alerts.operator_id))))));

DROP POLICY IF EXISTS "authenticated_insert_own_radar_alerts" ON public.radar_alerts;
CREATE POLICY "authenticated_insert_own_radar_alerts" ON public.radar_alerts FOR INSERT TO {authenticated} WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = radar_alerts.operator_id))))));

DROP POLICY IF EXISTS "authenticated_update_own_radar_alerts" ON public.radar_alerts;
CREATE POLICY "authenticated_update_own_radar_alerts" ON public.radar_alerts FOR UPDATE TO {authenticated} USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = radar_alerts.operator_id)))))) WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = radar_alerts.operator_id))))));

DROP POLICY IF EXISTS "authenticated_select_own_radar_configs" ON public.radar_configs;
CREATE POLICY "authenticated_select_own_radar_configs" ON public.radar_configs FOR SELECT TO {authenticated} USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = radar_configs.operator_id))))));

DROP POLICY IF EXISTS "authenticated_insert_own_radar_configs" ON public.radar_configs;
CREATE POLICY "authenticated_insert_own_radar_configs" ON public.radar_configs FOR INSERT TO {authenticated} WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = radar_configs.operator_id))))));

DROP POLICY IF EXISTS "authenticated_update_own_radar_configs" ON public.radar_configs;
CREATE POLICY "authenticated_update_own_radar_configs" ON public.radar_configs FOR UPDATE TO {authenticated} USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = radar_configs.operator_id)))))) WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.operator_id = radar_configs.operator_id))))));

DROP POLICY IF EXISTS "operator_own_dossies" ON public.dossies;
CREATE POLICY "operator_own_dossies" ON public.dossies FOR ALL TO {anon,authenticated} USING ((operator_id IS NOT NULL)) WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "deny_anon_all_llm_experiment_runs" ON public.llm_experiment_runs;
CREATE POLICY "deny_anon_all_llm_experiment_runs" ON public.llm_experiment_runs FOR ALL TO {anon} USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "operator_insert_dossier_accesses" ON public.dossier_accesses;
CREATE POLICY "operator_insert_dossier_accesses" ON public.dossier_accesses FOR INSERT TO {anon,authenticated} WITH CHECK ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "operator_select_dossier_accesses" ON public.dossier_accesses;
CREATE POLICY "operator_select_dossier_accesses" ON public.dossier_accesses FOR SELECT TO {anon,authenticated} USING ((operator_id IS NOT NULL));

DROP POLICY IF EXISTS "authenticated_read_own_dossier_runs" ON public.dossier_runs;
CREATE POLICY "authenticated_read_own_dossier_runs" ON public.dossier_runs FOR SELECT TO {authenticated} USING ((owner_id = ( SELECT auth.uid() AS uid)));

REVOKE ALL ON TABLE public.dossier_runs FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.dossier_runs TO authenticated;
