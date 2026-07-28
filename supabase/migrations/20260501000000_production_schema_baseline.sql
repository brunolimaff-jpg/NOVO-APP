-- =====================================================================
-- Production Schema Baseline (Canônico)
-- Timestamp: 20260501000000 (Anterior a todas as migrations remotas de Produção)
-- Representa a estrutura completa dos objetos do schema public em Produção.
-- =====================================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schema Auth Mínimo para referências de FK e auth.uid() em ambiente de desenvolvimento/teste
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

-- ---------------------------------------------------------------------
-- 1. TABELAS DE USUÁRIO E PERFIL
-- ---------------------------------------------------------------------

-- Tabela: user_context
CREATE TABLE IF NOT EXISTS public.user_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  email_normalized TEXT,
  name TEXT,
  operator_id TEXT,
  supabase_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  auth_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_context_email_normalized ON public.user_context(email_normalized);
CREATE INDEX IF NOT EXISTS idx_user_context_supabase_auth_id ON public.user_context(supabase_auth_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_context_email_normalized_unique_idx ON public.user_context(email_normalized) WHERE email_normalized IS NOT NULL;

ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;

-- Tabela: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2. TABELAS E VIEW DE DOSSIÊ E LIFECYCLE
-- ---------------------------------------------------------------------

-- Tabela: dossies
CREATE TABLE IF NOT EXISTS public.dossies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj TEXT NOT NULL,
  company_name TEXT,
  opportunity_score INTEGER,
  content JSONB,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dossies_cnpj_created ON public.dossies(cnpj, created_at DESC);

ALTER TABLE public.dossies ENABLE ROW LEVEL SECURITY;

-- Tabela: dossier_runs (Lifecycle Canônico)
CREATE TABLE IF NOT EXISTS public.dossier_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_id TEXT NOT NULL,
  session_id UUID,
  dossier_id UUID REFERENCES public.dossies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  idempotency_key TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  environment TEXT NOT NULL,
  app_version TEXT NOT NULL,
  error_code TEXT,
  error_stage TEXT,
  CONSTRAINT dossier_runs_status_check CHECK (status IN ('PENDING', 'RUNNING', 'CANCEL_REQUESTED', 'CANCELLED', 'COMPLETED', 'FAILED')),
  CONSTRAINT dossier_runs_owner_idempotency_key_unique UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_dossier_runs_owner_status ON public.dossier_runs(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dossier_runs_expired_lease ON public.dossier_runs(lease_expires_at) WHERE lease_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dossier_runs_session ON public.dossier_runs(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dossier_runs_dossier ON public.dossier_runs(dossier_id) WHERE dossier_id IS NOT NULL;

ALTER TABLE public.dossier_runs ENABLE ROW LEVEL SECURITY;

-- Tabela: dossier_accesses
CREATE TABLE IF NOT EXISTS public.dossier_accesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID REFERENCES public.dossies(id) ON DELETE CASCADE,
  operator_id TEXT,
  cnpj TEXT NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dossier_accesses_dossier ON public.dossier_accesses(dossier_id);
CREATE INDEX IF NOT EXISTS idx_dossier_accesses_operator ON public.dossier_accesses(operator_id);
CREATE INDEX IF NOT EXISTS idx_dossier_accesses_cnpj ON public.dossier_accesses(cnpj);

ALTER TABLE public.dossier_accesses ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3. TABELAS DE OBSERVABILIDADE E SESSÕES
-- ---------------------------------------------------------------------

-- Tabela: operator_sessions
CREATE TABLE IF NOT EXISTS public.operator_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,
  session_token TEXT UNIQUE,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_sessions_operator ON public.operator_sessions(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_sessions_stale ON public.operator_sessions(created_at) WHERE closed_at IS NULL;

-- Tabela: operator_events
CREATE TABLE IF NOT EXISTS public.operator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: scout_diagnostics
CREATE TABLE IF NOT EXISTS public.scout_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  area TEXT,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scout_diagnostics_session_created ON public.scout_diagnostics(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scout_diagnostics_area_event_created ON public.scout_diagnostics(area, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scout_diagnostics_operator_created ON public.scout_diagnostics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scout_diagnostics_blank_panel_created ON public.scout_diagnostics(created_at DESC) WHERE area = 'blank_panel';

-- Tabelas Opcionais de Suporte (extract_cache e feedback_events)
CREATE TABLE IF NOT EXISTS public.extract_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT,
  feedback_type TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- View: llm_model_daily_report
CREATE OR REPLACE VIEW public.llm_model_daily_report WITH (security_invoker = true) AS
  SELECT
    date_trunc('day', created_at) AS report_date,
    count(*) AS total_events
  FROM public.scout_diagnostics
  GROUP BY date_trunc('day', created_at);

-- ---------------------------------------------------------------------
-- 4. FUNÇÕES E RPCs
-- ---------------------------------------------------------------------

-- Trigger Function: handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Function: auto_close_stale_sessions
CREATE OR REPLACE FUNCTION public.auto_close_stale_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.operator_sessions
  SET closed_at = now()
  WHERE closed_at IS NULL AND created_at < now() - INTERVAL '24 hours';
END;
$$;

-- Function: get_expired_unconfirmed_users
CREATE OR REPLACE FUNCTION public.get_expired_unconfirmed_users(days_old int DEFAULT 7)
RETURNS TABLE (id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE u.confirmed_at IS NULL AND u.created_at < now() - (days_old || ' days')::interval;
END;
$$;

-- Function: link_legacy_operator
CREATE OR REPLACE FUNCTION public.link_legacy_operator(p_operator_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET operator_id = p_operator_id
  WHERE id = auth.uid() AND (operator_id IS NULL OR operator_id = p_operator_id);
END;
$$;

-- ---------------------------------------------------------------------
-- RPCs CANÔNICAS DE LIFECYCLE DE DOSSIER_RUNS
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_or_get_dossier_run(
  p_idempotency_key TEXT,
  p_session_id UUID,
  p_environment TEXT,
  p_app_version TEXT
) RETURNS public.dossier_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

CREATE OR REPLACE FUNCTION public.get_own_dossier_run(p_run_id UUID)
RETURNS public.dossier_runs LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  SELECT r.* FROM public.dossier_runs r WHERE r.run_id = p_run_id AND r.owner_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.acquire_dossier_run_lease(p_run_id UUID, p_lease_owner TEXT, p_lease_seconds INTEGER DEFAULT 45)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

CREATE OR REPLACE FUNCTION public.renew_dossier_run_lease(p_run_id UUID, p_lease_owner TEXT, p_lease_seconds INTEGER DEFAULT 45)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

CREATE OR REPLACE FUNCTION public.release_dossier_run_lease(p_run_id UUID, p_lease_owner TEXT)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET lease_owner = NULL, lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND lease_owner = p_lease_owner
  RETURNING * INTO v_run; RETURN v_run;
END; $$;

CREATE OR REPLACE FUNCTION public.request_dossier_run_cancel(p_run_id UUID)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET status = 'CANCEL_REQUESTED', cancel_requested_at = coalesce(cancel_requested_at, now())
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND status IN ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  RETURNING * INTO v_run; RETURN v_run;
END; $$;

CREATE OR REPLACE FUNCTION public.mark_dossier_run_cancelled(p_run_id UUID, p_lease_owner TEXT)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

CREATE OR REPLACE FUNCTION public.complete_dossier_run(p_run_id UUID, p_lease_owner TEXT, p_dossier_id UUID)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

CREATE OR REPLACE FUNCTION public.fail_dossier_run(p_run_id UUID, p_lease_owner TEXT, p_error_code TEXT, p_error_stage TEXT)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

REVOKE ALL ON FUNCTION public.create_or_get_dossier_run(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_own_dossier_run(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.acquire_dossier_run_lease(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.renew_dossier_run_lease(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_dossier_run_lease(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_dossier_run_cancel(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_dossier_run_cancelled(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_dossier_run(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fail_dossier_run(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_or_get_dossier_run(TEXT, UUID, TEXT, TEXT), public.get_own_dossier_run(UUID),
  public.acquire_dossier_run_lease(UUID, TEXT, INTEGER), public.renew_dossier_run_lease(UUID, TEXT, INTEGER),
  public.release_dossier_run_lease(UUID, TEXT), public.request_dossier_run_cancel(UUID),
  public.mark_dossier_run_cancelled(UUID, TEXT), public.complete_dossier_run(UUID, TEXT, UUID),
  public.fail_dossier_run(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. RLS POLICIES CANÔNICAS (Baseline Pre-PR463)
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_read_own_dossier_runs" ON public.dossier_runs;
CREATE POLICY "authenticated_read_own_dossier_runs" ON public.dossier_runs
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "operator_own_dossies" ON public.dossies;
CREATE POLICY "operator_own_dossies" ON public.dossies
  FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select_own_user_context" ON public.user_context;
CREATE POLICY "authenticated_select_own_user_context" ON public.user_context
  FOR SELECT TO authenticated USING (auth.uid() = supabase_auth_id);

DROP POLICY IF EXISTS "authenticated_insert_own_user_context" ON public.user_context;
CREATE POLICY "authenticated_insert_own_user_context" ON public.user_context
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = supabase_auth_id);

DROP POLICY IF EXISTS "authenticated_update_own_user_context" ON public.user_context;
CREATE POLICY "authenticated_update_own_user_context" ON public.user_context
  FOR UPDATE TO authenticated USING (auth.uid() = supabase_auth_id);
