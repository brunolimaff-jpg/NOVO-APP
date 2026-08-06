-- Teste de Runtime PostgreSQL para P0-SUPABASE-SECURITY-CONTAINMENT
-- Executar com: psql -v ON_ERROR_STOP=1 -f scripts/test_p0_security_containment.sql
-- Ambiente: banco descartável (NUNCA Produção)
-- Identidades: anon, authenticated (operador A), authenticated (operador B), service_role

BEGIN;

-- 1. Setup de roles de teste
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  ELSE
    ALTER ROLE service_role WITH BYPASSRLS;
  END IF;
END $$;

-- 2. Schema auth mínimo (função uid() usada pelas policies)
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid());

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid
$$;

-- Supabase concede USAGE no schema auth + EXECUTE em auth.uid() por padrão;
-- replicamos aqui para a simulação de roles funcionar.
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- 3. Tabelas base (fixtures mínimas)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  operator_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dossies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,
  cnpj TEXT,
  title TEXT,
  empresa_alvo TEXT,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.dossies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.operator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT,
  event_type TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.operator_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.operator_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);
ALTER TABLE public.operator_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT,
  email TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.extract_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT,
  payload JSONB DEFAULT '{}'::jsonb
);
ALTER TABLE public.extract_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shared_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT,
  dossier_id UUID
);
ALTER TABLE public.shared_dossiers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.crm_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj TEXT,
  razao_social TEXT
);
ALTER TABLE public.crm_clientes ENABLE ROW LEVEL SECURITY;

-- Tabelas adicionais citadas na migration 2 (least privilege anon)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT
);
ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.radar_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT
);
ALTER TABLE public.radar_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.radar_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT
);
ALTER TABLE public.radar_configs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.llm_experiment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT
);
ALTER TABLE public.llm_experiment_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.scout_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT
);
ALTER TABLE public.scout_diagnostics ENABLE ROW LEVEL SECURITY;
CREATE SEQUENCE IF NOT EXISTS public.scout_diagnostics_id_seq;

-- Views de métricas (citadas na migration 2)
CREATE OR REPLACE VIEW public.vw_company_ranking AS SELECT operator_id, count(*) AS total FROM public.operator_events GROUP BY operator_id;
CREATE OR REPLACE VIEW public.vw_daily_usage AS SELECT operator_id, count(*) AS total FROM public.operator_events GROUP BY operator_id;
CREATE OR REPLACE VIEW public.vw_event_funnel AS SELECT operator_id, count(*) AS total FROM public.operator_events GROUP BY operator_id;
CREATE OR REPLACE VIEW public.vw_session_stats AS SELECT operator_id, count(*) AS total FROM public.operator_sessions GROUP BY operator_id;
CREATE OR REPLACE VIEW public.vw_operator_ranking AS SELECT operator_id, count(*) AS total FROM public.operator_events GROUP BY operator_id;
CREATE OR REPLACE VIEW public.vw_metrics_summary AS SELECT operator_id, count(*) AS total FROM public.operator_events GROUP BY operator_id;

-- Função SECURITY DEFINER de teste (análoga à auto_close_stale_sessions)
CREATE OR REPLACE FUNCTION public.auto_close_stale_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN 0;
END;
$$;

-- 4. Grants iniciais (estado pré-contenção: permissivo)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.dossies, public.operator_events, public.operator_sessions,
  public.user_context, public.extract_cache, public.shared_dossiers, public.crm_clientes,
  public.audit_log, public.favorites, public.feedback_events, public.radar_alerts,
  public.radar_configs, public.llm_experiment_runs, public.scout_diagnostics
  TO anon, authenticated, service_role;
-- profiles: SELECT para authenticated (necessário para a subquery das policies)
GRANT SELECT ON TABLE public.profiles TO authenticated, service_role;
GRANT ALL ON SEQUENCE public.scout_diagnostics_id_seq TO anon;
GRANT ALL ON TABLE public.vw_company_ranking, public.vw_daily_usage, public.vw_event_funnel,
  public.vw_session_stats, public.vw_operator_ranking, public.vw_metrics_summary TO anon;
GRANT EXECUTE ON FUNCTION public.auto_close_stale_sessions() TO anon, authenticated, service_role;

-- Policies permissivas pré-existentes (estado da Produção)
CREATE POLICY "operator_own_dossies" ON public.dossies
  TO authenticated, anon USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);
CREATE POLICY "operator_own_events" ON public.operator_events
  USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);
CREATE POLICY "operator_own_sessions" ON public.operator_sessions
  USING (operator_id IS NOT NULL) WITH CHECK (operator_id IS NOT NULL);
-- Policy real de profiles (igual à Produção): usuário lê o próprio perfil.
-- Necessária para as subqueries das policies P0 (auth.uid() → profiles.operator_id).
CREATE POLICY "Usuário lê próprio perfil" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

-- 5. Fixtures: dois operadores autenticados (A e B) + dados
INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
INSERT INTO public.profiles (id, operator_id, email, name)
  VALUES ('00000000-0000-0000-0000-00000000000a', 'op_a', 'a@teste.com', 'Operador A'),
         ('00000000-0000-0000-0000-00000000000b', 'op_b', 'b@teste.com', 'Operador B');
INSERT INTO public.dossies (id, operator_id, cnpj, title, content)
  VALUES ('11111111-1111-1111-1111-111111111111', 'op_a', '11111111111111', 'Dossie A', '{"a":1}'::jsonb),
         ('22222222-2222-2222-2222-222222222222', 'op_b', '22222222222222', 'Dossie B', '{"b":2}'::jsonb);
INSERT INTO public.operator_events (operator_id, event_type) VALUES ('op_a', 'a'), ('op_b', 'b');
INSERT INTO public.operator_sessions (id, operator_id) VALUES ('33333333-3333-3333-3333-333333333333', 'op_a');
INSERT INTO public.user_context (operator_id, email) VALUES ('op_a', 'a@teste.com');
INSERT INTO public.extract_cache (operator_id, payload) VALUES ('op_a', '{}'::jsonb);
INSERT INTO public.crm_clientes (cnpj, razao_social) VALUES ('99999999999999', 'Cliente X');

-- 6. Aplicar as migrations (2x para provar idempotência)
\i supabase/migrations/20260806220000_p0_isolate_dossies.sql
\i supabase/migrations/20260806220100_p0_isolate_events_sessions_and_anon.sql
\i supabase/migrations/20260806220000_p0_isolate_dossies.sql
\i supabase/migrations/20260806220100_p0_isolate_events_sessions_and_anon.sql

-- 7. Asserts
DO $$
DECLARE
  v_count integer;
  v_uid_a uuid := '00000000-0000-0000-0000-00000000000a';
  v_uid_b uuid := '00000000-0000-0000-0000-00000000000b';
  v_priv text;
BEGIN
  -- A. Grants: anon sem privilégios em todas as tabelas sensíveis
  IF has_table_privilege('anon', 'public.operator_events', 'SELECT') OR
     has_table_privilege('anon', 'public.operator_sessions', 'SELECT') OR
     has_table_privilege('anon', 'public.user_context', 'SELECT') OR
     has_table_privilege('anon', 'public.extract_cache', 'SELECT') OR
     has_table_privilege('anon', 'public.shared_dossiers', 'SELECT') OR
     has_table_privilege('anon', 'public.crm_clientes', 'SELECT') OR
     has_table_privilege('anon', 'public.dossies', 'SELECT') THEN
    RAISE EXCEPTION 'FALHA: anon possui privilégios residuais';
  END IF;

  -- B. Função: anon/authenticated sem EXECUTE; service_role com EXECUTE
  IF has_function_privilege('anon', 'public.auto_close_stale_sessions()', 'EXECUTE') OR
     has_function_privilege('authenticated', 'public.auto_close_stale_sessions()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: função SECURITY DEFINER executável por anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.auto_close_stale_sessions()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: service_role deveria executar a função';
  END IF;

  -- C. authenticated tem grants corretos em dossies (SELECT/INSERT/UPDATE, sem DELETE)
  IF NOT (has_table_privilege('authenticated', 'public.dossies', 'SELECT') AND
          has_table_privilege('authenticated', 'public.dossies', 'INSERT') AND
          has_table_privilege('authenticated', 'public.dossies', 'UPDATE')) THEN
    RAISE EXCEPTION 'FALHA: authenticated sem grants corretos em dossies';
  END IF;
  IF has_table_privilege('authenticated', 'public.dossies', 'DELETE') THEN
    RAISE EXCEPTION 'FALHA: authenticated com DELETE em dossies';
  END IF;
END $$;

-- D. RLS em ação — 4 identidades (dentro de um único bloco DO)
DO $$
DECLARE
  v_count integer;
BEGIN
  -- D1-D6. Operador A (autenticado como uid_a)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

  -- D1. A vê apenas o próprio dossiê
  SELECT COUNT(*) INTO v_count FROM public.dossies;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FALHA: operador A vê % dossiês (esperado 1)', v_count;
  END IF;

  -- D2. A não vê o dossiê de B
  SELECT COUNT(*) INTO v_count FROM public.dossies WHERE operator_id = 'op_b';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FALHA: operador A vê dossiê de B (isolamento quebrado)';
  END IF;

  -- D3. A não consegue UPDATE no dossiê de B (takeover bloqueado)
  -- RLS filtra a linha estrangeira silenciosamente: UPDATE afeta 0 linhas.
  UPDATE public.dossies SET title = 'HACK' WHERE operator_id = 'op_b';
  IF NOT FOUND THEN
    RAISE NOTICE 'D3 OK: UPDATE cross-operator bloqueado (0 linhas afetadas)';
  ELSE
    RAISE EXCEPTION 'FALHA: UPDATE cross-operator permitido (takeover!)';
  END IF;

  -- D4. A não consegue INSERT com operator_id de B (WITH CHECK rejeita)
  BEGIN
    INSERT INTO public.dossies (operator_id, cnpj, title, content)
    VALUES ('op_b', '33333333333333', 'Invasao', '{}'::jsonb);
    RAISE EXCEPTION 'FALHA: INSERT cross-operator permitido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FALHA:%' THEN RAISE; END IF;
  END;

  -- D5. A não vê eventos de B
  SELECT COUNT(*) INTO v_count FROM public.operator_events WHERE operator_id = 'op_b';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FALHA: operador A vê eventos de B';
  END IF;

  -- D6. A não vê sessões de B
  SELECT COUNT(*) INTO v_count FROM public.operator_sessions WHERE operator_id = 'op_b';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FALHA: operador A vê sessões de B';
  END IF;

  -- E. Operador B (autenticado como uid_b) — simétrico
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
  SELECT COUNT(*) INTO v_count FROM public.dossies;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FALHA: operador B vê % dossiês (esperado 1)', v_count;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.dossies WHERE operator_id = 'op_a';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FALHA: operador B vê dossiê de A';
  END IF;

  -- F. anon — sem acesso a nada
  SET LOCAL ROLE anon;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.dossies;
    RAISE EXCEPTION 'FALHA: anon leu dossies';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FALHA:%' THEN RAISE; END IF;
  END;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.operator_events;
    RAISE EXCEPTION 'FALHA: anon leu operator_events';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FALHA:%' THEN RAISE; END IF;
  END;

  -- G. service_role — acesso administrativo pleno
  SET LOCAL ROLE service_role;
  SELECT COUNT(*) INTO v_count FROM public.dossies;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FALHA: service_role deveria ver todos os dossiês (viu %)', v_count;
  END IF;

  RAISE NOTICE 'P0-SECURITY-CONTAINMENT: TODOS OS ASSERTS PASSARAM';
END $$;

ROLLBACK;
