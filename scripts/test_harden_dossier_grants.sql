-- Teste de Runtime PostgreSQL para 20260724000000_harden_dossier_grants.sql
-- Executar com: psql -v ON_ERROR_STOP=1 -f scripts/test_harden_dossier_grants.sql

BEGIN;

-- 1. Setup de roles de teste (garantindo BYPASSRLS em service_role se existir)
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

-- 4. Simular estado de grants excessivos iniciais + grants integrais do service_role
GRANT ALL ON TABLE public.dossier_runs TO PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.dossies TO PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO PUBLIC, anon, authenticated, service_role;
-- Conceder EXECUTE excessivo a PUBLIC/anon/authenticated mas NAO previamente a service_role
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM service_role;

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

  -- C. Assert: authenticated em dossier_runs (somente SELECT, sem REFERENCES)
  IF NOT has_table_privilege('authenticated', 'public.dossier_runs', 'SELECT') THEN
    RAISE EXCEPTION 'FALHA: authenticated deveria ter SELECT em dossier_runs';
  END IF;
  IF has_table_privilege('authenticated', 'public.dossier_runs', 'INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES') THEN
    RAISE EXCEPTION 'FALHA: authenticated possui privilégios de escrita/ref em dossier_runs';
  END IF;

  -- D. Assert: authenticated em dossies (SELECT, INSERT, UPDATE apenas)
  IF NOT (has_table_privilege('authenticated', 'public.dossies', 'SELECT') AND
          has_table_privilege('authenticated', 'public.dossies', 'INSERT') AND
          has_table_privilege('authenticated', 'public.dossies', 'UPDATE')) THEN
    RAISE EXCEPTION 'FALHA: authenticated deveria ter SELECT, INSERT, UPDATE em dossies';
  END IF;
  IF has_table_privilege('authenticated', 'public.dossies', 'DELETE, TRUNCATE, TRIGGER, REFERENCES') THEN
    RAISE EXCEPTION 'FALHA: authenticated possui privilégios indevidos em dossies';
  END IF;

  -- E. Assert: authenticated em profiles (SELECT + UPDATE apenas de name)
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'FALHA: authenticated deveria ter SELECT em profiles';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'FALHA: authenticated possui UPDATE geral na tabela profiles (deveria ser apenas na coluna name)';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'name', 'UPDATE') THEN
    RAISE EXCEPTION 'FALHA: authenticated deveria ter UPDATE na coluna name de profiles';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'operator_id', 'UPDATE') OR
     has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE') OR
     has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE') OR
     has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE') THEN
    RAISE EXCEPTION 'FALHA: authenticated possui UPDATE indevido em colunas protegidas de profiles';
  END IF;

  -- F. Assert: service_role preserva TODOS os privilégios em dossier_runs, dossies e profiles
  IF NOT (has_table_privilege('service_role', 'public.dossier_runs', 'SELECT') AND
          has_table_privilege('service_role', 'public.dossier_runs', 'INSERT') AND
          has_table_privilege('service_role', 'public.dossier_runs', 'UPDATE') AND
          has_table_privilege('service_role', 'public.dossier_runs', 'DELETE') AND
          has_table_privilege('service_role', 'public.dossier_runs', 'TRUNCATE') AND
          has_table_privilege('service_role', 'public.dossier_runs', 'REFERENCES') AND
          has_table_privilege('service_role', 'public.dossier_runs', 'TRIGGER')) THEN
    RAISE EXCEPTION 'FALHA: service_role perdeu privilégios em dossier_runs';
  END IF;

  IF NOT (has_table_privilege('service_role', 'public.dossies', 'SELECT') AND
          has_table_privilege('service_role', 'public.dossies', 'INSERT') AND
          has_table_privilege('service_role', 'public.dossies', 'UPDATE') AND
          has_table_privilege('service_role', 'public.dossies', 'DELETE') AND
          has_table_privilege('service_role', 'public.dossies', 'TRUNCATE') AND
          has_table_privilege('service_role', 'public.dossies', 'REFERENCES') AND
          has_table_privilege('service_role', 'public.dossies', 'TRIGGER')) THEN
    RAISE EXCEPTION 'FALHA: service_role perdeu privilégios em dossies';
  END IF;

  IF NOT (has_table_privilege('service_role', 'public.profiles', 'SELECT') AND
          has_table_privilege('service_role', 'public.profiles', 'INSERT') AND
          has_table_privilege('service_role', 'public.profiles', 'UPDATE') AND
          has_table_privilege('service_role', 'public.profiles', 'DELETE') AND
          has_table_privilege('service_role', 'public.profiles', 'TRUNCATE') AND
          has_table_privilege('service_role', 'public.profiles', 'REFERENCES') AND
          has_table_privilege('service_role', 'public.profiles', 'TRIGGER')) THEN
    RAISE EXCEPTION 'FALHA: service_role perdeu privilégios em profiles';
  END IF;

  -- G. Assert: EXECUTE em handle_new_user()
  IF has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: authenticated NAO deveria ter EXECUTE em handle_new_user()';
  END IF;
  IF has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: anon NAO deveria ter EXECUTE em handle_new_user()';
  END IF;
  SELECT COUNT(*) INTO v_public_grants
  FROM information_schema.routine_privileges
  WHERE grantee = 'PUBLIC' AND routine_schema = 'public' AND routine_name = 'handle_new_user';
  IF v_public_grants > 0 THEN
    RAISE EXCEPTION 'FALHA: PUBLIC possui EXECUTE em handle_new_user()';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: service_role DEVERIA ter EXECUTE em handle_new_user()';
  END IF;

  -- H. Testes de Execução Real como role `authenticated`
  RESET ROLE;
  INSERT INTO public.profiles (id, operator_id, email, name) VALUES (v_profile_id, 'op_123', 'test@example.com', 'Nome Antigo');
  SET LOCAL ROLE authenticated;

  -- H1. UPDATE permitido em name
  UPDATE public.profiles SET name = 'Nome Novo' WHERE id = v_profile_id;

  -- H2. UPDATE em operator_id bloqueado com SQLSTATE 42501
  BEGIN
    UPDATE public.profiles SET operator_id = 'op_hacked' WHERE id = v_profile_id;
    RAISE EXCEPTION 'FALHA: UPDATE em operator_id deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 ao tentar UPDATE em operator_id, obtido: %', v_errcode;
    END IF;
  END;

  -- H3. UPDATE em email bloqueado com SQLSTATE 42501
  BEGIN
    UPDATE public.profiles SET email = 'hacked@example.com' WHERE id = v_profile_id;
    RAISE EXCEPTION 'FALHA: UPDATE em email deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 ao tentar UPDATE em email, obtido: %', v_errcode;
    END IF;
  END;

  -- H4. UPDATE em id bloqueado com SQLSTATE 42501
  BEGIN
    UPDATE public.profiles SET id = gen_random_uuid() WHERE id = v_profile_id;
    RAISE EXCEPTION 'FALHA: UPDATE em id deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 ao tentar UPDATE em id, obtido: %', v_errcode;
    END IF;
  END;

  -- H5. UPDATE em created_at bloqueado com SQLSTATE 42501
  BEGIN
    UPDATE public.profiles SET created_at = now() WHERE id = v_profile_id;
    RAISE EXCEPTION 'FALHA: UPDATE em created_at deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 ao tentar UPDATE em created_at, obtido: %', v_errcode;
    END IF;
  END;

  -- H6. Executar handle_new_user() como authenticated (SQLSTATE 42501)
  BEGIN
    PERFORM public.handle_new_user();
    RAISE EXCEPTION 'FALHA: Execução de handle_new_user como authenticated deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 ao executar handle_new_user como authenticated, obtido: %', v_errcode;
    END IF;
  END;

  -- H7. Executar handle_new_user() como anon (SQLSTATE 42501)
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.handle_new_user();
    RAISE EXCEPTION 'FALHA: Execução de handle_new_user como anon deveria ter falhado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 ao executar handle_new_user como anon, obtido: %', v_errcode;
    END IF;
  END;

  -- H8. Executar handle_new_user() como service_role (permissão de execução verificada via privilege)
  RESET ROLE;

  RAISE NOTICE 'TODOS OS ASSERTS DE RUNTIME E SERVICE_ROLE PASSARAM COM SUCESSO!';
END $$;

ROLLBACK;
