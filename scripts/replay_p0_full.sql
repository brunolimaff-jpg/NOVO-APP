-- ============================================================================
-- P0 — REPLAY INTEGRAL DAS MIGRATIONS EM BANCO DESCARTAVEL (PostgreSQL 17)
-- Task: P0-SUPABASE-SECURITY-CONTAINMENT-CODE-ONLY-2026-08-06
-- Uso: psql -d <banco_descartavel> -v ON_ERROR_STOP=1 -f scripts/replay_p0_full.sql
-- NUNCA executar em Produção.
-- ============================================================================

-- 0. check_function_bodies: garante que CREATE FUNCTION valida corpos (default
--    do runner Supabase). O replay DEVE registrar on.
SHOW check_function_bodies;

-- 1. Ambiente base (equivalente ao provisionamento Supabase)
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- 2. Roles (padrão Supabase)
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

-- 3. auth.uid() — função usada pelas policies (simulação Supabase)
-- auth.users replicado com as colunas usadas pelo baseline (trigger handle_new_user)
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- 4. Aplicar TODAS as migrations em ordem (24 originais + 3 P0)
\i supabase/migrations/20260501000000_production_schema_baseline.sql
\i supabase/migrations/20260528182644_create_scout_diagnostics_table.sql
\i supabase/migrations/20260529001658_operator_tracking.sql
\i supabase/migrations/20260529135622_fix_operator_grants.sql
\i supabase/migrations/20260529140759_fix_operator_sessions_events_rls.sql
\i supabase/migrations/20260529145221_create_crm_clientes.sql
\i supabase/migrations/20260529203804_create_waterfall_logs.sql
\i supabase/migrations/20260531054225_drop_operator_events_fk.sql
\i supabase/migrations/20260603143742_blank_panel_observability.sql
\i supabase/migrations/20260611145229_usage_metrics_views.sql
\i supabase/migrations/20260611223446_20260611_dossier_accesses.sql
\i supabase/migrations/20260613171053_20260613_user_context_schema.sql
\i supabase/migrations/20260613171101_20260613_lock_profiles_operator_id.sql
\i supabase/migrations/20260613180619_auth_storage_rls_policies.sql
\i supabase/migrations/20260615194839_fix_dossies_rls_authenticated.sql
\i supabase/migrations/20260620010452_20260620_llm_experiment.sql
\i supabase/migrations/20260620152104_secure_llm_report_view.sql
\i supabase/migrations/20260622133908_fix_dossier_accesses_rls_authenticated.sql
\i supabase/migrations/20260727224304_dossier_runs_lifecycle.sql
\i supabase/migrations/20260728173731_harden_dossier_grants.sql
\i supabase/migrations/20260728180000_harden_legacy_operator_linking.sql
\i supabase/migrations/20260730090000_scout_diagnostics_opportunistic_retention.sql
\i supabase/migrations/20260730090100_remove_duplicate_scout_diagnostics_indexes.sql
\i supabase/migrations/20260805160000_close_stale_dossier_runs.sql
\i supabase/migrations/20260806220000_p0_isolate_dossies.sql
\i supabase/migrations/20260806220100_p0_isolate_events_sessions_and_anon.sql
\i supabase/migrations/20260806220200_p0_secure_duplicate_discovery.sql

-- 5. Fixtures (dados sintéticos — nunca dados reais)
-- NOTA: a trigger handle_new_user (baseline) gera operator_id próprio ao inserir
-- em auth.users. Para alinhar os dossiês com o operator_id REAL dos profiles,
-- capturamos os operator_ids gerados após a inserção e os reutilizamos.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'a@teste.com', '{"name":"Operador A"}'::jsonb),
  ('00000000-0000-0000-0000-00000000000b', 'b@teste.com', '{"name":"Operador B"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_op_a text;
  v_op_b text;
BEGIN
  -- profiles já existem (trigger handle_new_user) com operator_id gerado.
  SELECT operator_id INTO v_op_a FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000000a';
  SELECT operator_id INTO v_op_b FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000000b';
  IF v_op_a IS NULL OR v_op_b IS NULL THEN
    RAISE EXCEPTION 'Fixture: profiles ausentes (trigger não criou operator_id)';
  END IF;

  INSERT INTO public.dossies (id, operator_id, cnpj, title, empresa_alvo, content, created_at, updated_at)
  VALUES
    ('11111111-1111-1111-1111-111111111111', v_op_a, '11111111111111', 'Dossie A', 'Empresa A', '{}'::jsonb, now(), now()),
    ('22222222-2222-2222-2222-222222222222', v_op_b, '08545069000102', 'Dossie B', 'Empresa Estrangeira', '{"b":2}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.operator_events (operator_id, event_name, metadata, created_at)
  VALUES (v_op_a, 'a', '{}'::jsonb, now()), (v_op_b, 'b', '{}'::jsonb, now());

  INSERT INTO public.operator_sessions (id, operator_id, started_at, last_seen_at)
  VALUES ('33333333-3333-3333-3333-333333333333', v_op_a, now(), now());

  INSERT INTO public.user_context (operator_id, email, email_normalized, last_seen)
  VALUES (v_op_a, 'a@teste.com', 'a@teste.com', now());

  INSERT INTO public.extract_cache (id, operator_id, result, expires_at)
  VALUES ('cache-1', v_op_a, '{}'::jsonb, now() + interval '1 day');

  RAISE NOTICE 'Fixture: op_a=%, op_b=%', v_op_a, v_op_b;
END $$;

INSERT INTO public.crm_clientes (razao_social, cnpj)
VALUES ('Cliente X', '99999999999999');

-- 6. Matriz de segurança — 4 identidades
-- SET ROLE no nível da sessão (fora de DO) + asserts herdando o role.

-- Bloco A: anon
SET ROLE anon;
DO $$
DECLARE
  v_count integer;
BEGIN
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
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.operator_sessions;
    RAISE EXCEPTION 'FALHA: anon leu operator_sessions';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FALHA:%' THEN RAISE; END IF;
  END;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.user_context;
    RAISE EXCEPTION 'FALHA: anon leu user_context';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FALHA:%' THEN RAISE; END IF;
  END;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.extract_cache;
    RAISE EXCEPTION 'FALHA: anon leu extract_cache';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FALHA:%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.auto_close_stale_sessions();
    RAISE EXCEPTION 'FALHA: anon executou auto_close_stale_sessions';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FALHA:%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'A PASS: anon bloqueado em tudo';
END $$;
RESET ROLE;

-- Bloco B: Operador A
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL row_security = on;
  SELECT COUNT(*) INTO v_count FROM public.dossies;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B1 FALHA: operador A vê % dossiês (esperado 1)', v_count;
  END IF;
  RAISE NOTICE 'B1 PASS: A vê apenas o próprio dossiê (%)', v_count;

  SELECT COUNT(*) INTO v_count FROM public.dossies
  WHERE operator_id = (SELECT operator_id FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000000b');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'B2 FALHA: A vê dossiê de B';
  END IF;
  RAISE NOTICE 'B2 PASS: A não vê dossiê de B';

  UPDATE public.dossies SET title = 'HACK'
  WHERE operator_id = (SELECT operator_id FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000000b');
  IF FOUND THEN
    RAISE EXCEPTION 'B3 FALHA: UPDATE cross-operator permitido (takeover!)';
  END IF;
  RAISE NOTICE 'B3 PASS: UPDATE cross-operator bloqueado';

  BEGIN
    INSERT INTO public.dossies (operator_id, cnpj, title, content)
    VALUES ((SELECT operator_id FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000000b'), '33333333333333', 'Invasao', '{}'::jsonb);
    RAISE EXCEPTION 'B4 FALHA: INSERT cross-operator permitido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FALHA:%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'B4 PASS: INSERT cross-operator rejeitado';

  SELECT COUNT(*) INTO v_count FROM public.operator_events
  WHERE operator_id = (SELECT operator_id FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000000b');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'B5 FALHA: A vê eventos de B';
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.operator_sessions
  WHERE operator_id = (SELECT operator_id FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000000b');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'B6 FALHA: A vê sessões de B';
  END IF;
  RAISE NOTICE 'B5/B6 PASS: A não vê eventos/sessões de B';

  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.vw_operator_ranking;
    RAISE EXCEPTION 'B7 FALHA: authenticated leu vw_operator_ranking (cross-operator!)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FALHA:%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'B7 PASS: A não lê views de métricas';

  -- B8: RPC — estrangeiro existe → true (CNPJ do dossiê de B)
  IF public.check_existing_dossier_for_cnpj('08545069000102') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B8 FALHA: RPC deveria retornar true para CNPJ com duplicidade estrangeira';
  END IF;
  RAISE NOTICE 'B8 PASS: RPC retorna true para CNPJ com duplicidade ESTRANGEIRA';

  -- B9: RPC — dossiê próprio (CNPJ do dossiê de A) → false
  IF public.check_existing_dossier_for_cnpj('11111111111111') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'B9 FALHA: RPC deveria retornar false para dossiê PRÓPRIO';
  END IF;
  RAISE NOTICE 'B9 PASS: RPC retorna false para dossiê próprio';

  -- B10: RPC — CNPJ inválido (menos de 14 dígitos) → false
  IF public.check_existing_dossier_for_cnpj('123') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'B10 FALHA: RPC deveria retornar false para CNPJ inválido';
  END IF;
  RAISE NOTICE 'B10 PASS: RPC retorna false para CNPJ inválido';

  -- B11: RPC — CNPJ inexistente → false
  IF public.check_existing_dossier_for_cnpj('00000000000000') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'B11 FALHA: RPC deveria retornar false para CNPJ sem dossiê';
  END IF;
  RAISE NOTICE 'B11 PASS: RPC retorna false para CNPJ sem dossiê';
END $$;
RESET ROLE;

-- Bloco B12: RPC — autenticado SEM perfil (uid sem profile) → false ou erro controlado
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999"}', false);
DO $$
BEGIN
  SET LOCAL row_security = on;
  -- Sem perfil para o uid → subquery retorna NULL → comparação NULL → EXISTS false
  IF public.check_existing_dossier_for_cnpj('08545069000102') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'B12 FALHA: RPC deveria retornar false sem perfil autenticado';
  END IF;
  RAISE NOTICE 'B12 PASS: RPC retorna false sem perfil autenticado (fail-closed)';
END $$;
RESET ROLE;

-- Bloco C: Operador B
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL row_security = on;
  SELECT COUNT(*) INTO v_count FROM public.dossies;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'C1 FALHA: B vê % dossiês (esperado 1)', v_count;
  END IF;
  RAISE NOTICE 'C1 PASS: B vê apenas o próprio dossiê';
END $$;
RESET ROLE;

-- Bloco D: service_role
SET ROLE service_role;
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL row_security = on;
  SELECT COUNT(*) INTO v_count FROM public.dossies;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'D1 FALHA: service_role deveria ver 2 dossiês (viu %)', v_count;
  END IF;
  PERFORM public.auto_close_stale_sessions();
  RAISE NOTICE 'D1/D2 PASS: service_role pleno + função executável';

  -- D3: extract_cache — service_role lê (backend socio-search server-side)
  SELECT COUNT(*) INTO v_count FROM public.extract_cache;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'D3 FALHA: service_role deveria ver o cache (viu %)', v_count;
  END IF;
  RAISE NOTICE 'D3 PASS: service_role lê extract_cache (backend)';
  RAISE NOTICE '== MATRIZ P0: TODOS OS ASSERTS PASSARAM ==';
END $$;
RESET ROLE;

-- Bloco E: extract_cache — fluxo autenticado do navegador (storage/extractCache.ts)
-- DECISÃO DOCUMENTADA: o baseline dá policy/grant de extract_cache SOMENTE a anon;
-- authenticated não possui policy nem grant → o upsert do navegador JÁ é
-- não-funcional em Produção (fail-closed pré-existente, não introduzido pelo P0).
-- O caminho real de leitura/escrita é server-side com service_role
-- (services/socio-search/cache.ts usa SERVICE_ROLE_KEY). O P0 mantém esse
-- fail-closed autenticado e apenas remove o acesso anônimo indevido.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL row_security = on;

  -- E1: authenticated NÃO consegue upsert em extract_cache (fail-closed pré-existente)
  BEGIN
    INSERT INTO public.extract_cache (id, operator_id, result, expires_at)
    VALUES ('cache-a2', (SELECT operator_id FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000000a'), '{"x":1}'::jsonb, now() + interval '1 day')
    ON CONFLICT (id) DO UPDATE SET result = '{"x":1}'::jsonb, expires_at = now() + interval '1 day';
    RAISE EXCEPTION 'E1 FALHA: authenticated conseguiu upsert em extract_cache (comportamento não esperado)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%E1 FALHA%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'E1 PASS: authenticated sem upsert em extract_cache (fail-closed pré-existente — fluxo real é service_role)';
END $$;
RESET ROLE;
