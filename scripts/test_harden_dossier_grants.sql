-- Teste de Runtime PostgreSQL para 20260724000000_harden_dossier_grants.sql
-- Executar com: psql -d postgres -v ON_ERROR_STOP=1 -f scripts/test_harden_dossier_grants.sql

BEGIN;

-- 1. Setup de roles de teste (se nao existirem)
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
  END IF;
END $$;

-- 2. Setup de schema auth minimo se necessario para FK references
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- 3. Fixtures minimas das tabelas
CREATE TABLE IF NOT EXISTS public.dossier_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id),
  operator_id TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  idempotency_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.dossies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj TEXT NOT NULL,
  company_name TEXT
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- 4. Simular estado de grants excessivos iniciais (estado pre-migration)
GRANT ALL ON TABLE public.dossier_runs TO PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.dossies TO PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.profiles TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role, PUBLIC, anon, authenticated;

-- 5. Primeira Aplicacao da Migration
\i supabase/migrations/20260724000000_harden_dossier_grants.sql

-- 6. Segunda Aplicacao da Migration (Provar Idempotencia)
\i supabase/migrations/20260724000000_harden_dossier_grants.sql

-- 7. Asserts Obrigatorios

DO $$
DECLARE
  v_errcode text;
  v_public_grants integer;
  v_profile_id uuid := gen_random_uuid();
BEGIN
  -- A. Assert: anon em todas as tabelas (zero grants)
  IF has_table_privilege('anon', 'public.dossier_runs', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') OR
     has_table_privilege('anon', 'public.dossies', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') OR
     has_table_privilege('anon', 'public.profiles', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
    RAISE EXCEPTION 'FALHA: anon possui privilégios residuais em tabelas';
  END IF;

  -- B. Assert: PUBLIC em todas as tabelas (zero grants)
  SELECT COUNT(*) INTO v_public_grants
  FROM information_schema.role_table_grants
  WHERE grantee = 'PUBLIC' AND table_schema = 'public' AND table_name IN ('dossier_runs', 'dossies', 'profiles');

  IF v_public_grants > 0 THEN
    RAISE EXCEPTION 'FALHA: PUBLIC possui % privilégios residuais em tabelas', v_public_grants;
  END IF;

  -- C. Assert: authenticated em dossier_runs (somente SELECT)
  IF NOT has_table_privilege('authenticated', 'public.dossier_runs', 'SELECT') THEN
    RAISE EXCEPTION 'FALHA: authenticated deveria ter SELECT em dossier_runs';
  END IF;
  IF has_table_privilege('authenticated', 'public.dossier_runs', 'INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER') THEN
    RAISE EXCEPTION 'FALHA: authenticated possui privilégios de escrita indevidos em dossier_runs';
  END IF;

  -- D. Assert: authenticated tem REFERENCES em dossier_runs -> NÃO
  IF has_table_privilege('authenticated', 'public.dossier_runs', 'REFERENCES') THEN
    RAISE EXCEPTION 'FALHA: authenticated possui REFERENCES em dossier_runs';
  END IF;

  -- E. Assert: authenticated em dossies (SELECT, INSERT, UPDATE)
  IF NOT (has_table_privilege('authenticated', 'public.dossies', 'SELECT') AND
          has_table_privilege('authenticated', 'public.dossies', 'INSERT') AND
          has_table_privilege('authenticated', 'public.dossies', 'UPDATE')) THEN
    RAISE EXCEPTION 'FALHA: authenticated deveria ter SELECT, INSERT, UPDATE em dossies';
  END IF;
  IF has_table_privilege('authenticated', 'public.dossies', 'DELETE, TRUNCATE, TRIGGER, REFERENCES') THEN
    RAISE EXCEPTION 'FALHA: authenticated possui privilégios indevidos em dossies';
  END IF;

  -- F. Assert: authenticated em profiles (SELECT + UPDATE apenas de name)
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'FALHA: authenticated deveria ter SELECT em profiles';
  END IF;
  -- Verifica que UPDATE geral na tabela NAO foi concedido
  IF has_table_privilege('authenticated', 'public.profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'FALHA: authenticated possui UPDATE geral na tabela profiles (deveria ser apenas na coluna name)';
  END IF;
  -- Verifica permissao por coluna
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'name', 'UPDATE') THEN
    RAISE EXCEPTION 'FALHA: authenticated deveria ter UPDATE na coluna name de profiles';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'operator_id', 'UPDATE') THEN
    RAISE EXCEPTION 'FALHA: authenticated NAO deveria ter UPDATE na coluna operator_id de profiles';
  END IF;

  -- G. Testes de Execucao Real como role `authenticated`
  SET LOCAL ROLE authenticated;

  -- G1. UPDATE direto de profiles.name (deve ser permitido)
  RESET ROLE;
  INSERT INTO public.profiles (id, operator_id, email, name) VALUES (v_profile_id, 'op_123', 'test@example.com', 'Nome Antigo');
  SET LOCAL ROLE authenticated;

  UPDATE public.profiles SET name = 'Nome Novo' WHERE id = v_profile_id;

  -- G2. UPDATE direto de profiles.operator_id (deve ser bloqueado com SQLSTATE 42501)
  BEGIN
    UPDATE public.profiles SET operator_id = 'op_hacked' WHERE id = v_profile_id;
    RAISE EXCEPTION 'FALHA: UPDATE em operator_id deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 ao tentar UPDATE em operator_id, obtido: %', v_errcode;
    END IF;
  END;

  -- G3. Executar handle_new_user() como authenticated (deve ser bloqueado com SQLSTATE 42501)
  IF has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: authenticated NAO deveria ter EXECUTE em handle_new_user()';
  END IF;
  BEGIN
    PERFORM public.handle_new_user();
    RAISE EXCEPTION 'FALHA: Execução de handle_new_user como authenticated deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 ao executar handle_new_user como authenticated, obtido: %', v_errcode;
    END IF;
  END;

  -- G4. Executar handle_new_user() como anon (deve ser bloqueado com SQLSTATE 42501)
  SET LOCAL ROLE anon;
  IF has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: anon NAO deveria ter EXECUTE em handle_new_user()';
  END IF;
  BEGIN
    PERFORM public.handle_new_user();
    RAISE EXCEPTION 'FALHA: Execução de handle_new_user como anon deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 ao executar handle_new_user como anon, obtido: %', v_errcode;
    END IF;
  END;

  -- G5. Confirmar service_role preservado
  RESET ROLE;
  IF NOT has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: service_role deveria ter EXECUTE em handle_new_user()';
  END IF;

  RAISE NOTICE 'TODOS OS ASSERTS DE RUNTIME PASSARAM COM SUCESSO!';
END $$;

ROLLBACK;
