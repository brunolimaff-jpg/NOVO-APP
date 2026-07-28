-- Teste de Runtime PostgreSQL para 20260728180000_harden_legacy_operator_linking.sql
-- Executar com: psql -X -v ON_ERROR_STOP=1 --single-transaction -f scripts/test_harden_identity.sql

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

-- 2. Setup de schema auth mínimo
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT
);

-- 3. Setup de tabelas mínimas public
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  operator_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,
  email_normalized TEXT NOT NULL
);

-- Habilitar RLS em profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Grants de profiles (somente UPDATE em name para authenticated)
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (name) ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

-- 4. Aplicar migration de hardening de link_legacy_operator
\i supabase/migrations/20260728180000_harden_legacy_operator_linking.sql

-- 5. Execução dos Asserts
DO $$
DECLARE
  v_user1_id UUID := gen_random_uuid();
  v_user2_id UUID := gen_random_uuid();
  v_errcode TEXT;
  v_errmsg TEXT;
  v_updated_op TEXT;
  v_updated_name TEXT;
BEGIN
  -- Truncate test tables
  TRUNCATE TABLE auth.users CASCADE;
  TRUNCATE TABLE public.profiles CASCADE;
  TRUNCATE TABLE public.user_context CASCADE;

  -- Fixtures
  INSERT INTO auth.users (id, email) VALUES (v_user1_id, 'user1@example.com');
  INSERT INTO auth.users (id, email) VALUES (v_user2_id, 'user2@example.com');

  INSERT INTO public.profiles (id, operator_id, email, name) VALUES (v_user1_id, 'op_old_1', 'user1@example.com', 'User 1 Old')
  ON CONFLICT (id) DO UPDATE SET operator_id = EXCLUDED.operator_id, email = EXCLUDED.email, name = EXCLUDED.name;

  INSERT INTO public.profiles (id, operator_id, email, name) VALUES (v_user2_id, 'op_old_2', 'user2@example.com', 'User 2 Old')
  ON CONFLICT (id) DO UPDATE SET operator_id = EXCLUDED.operator_id, email = EXCLUDED.email, name = EXCLUDED.name;

  INSERT INTO public.user_context (operator_id, email_normalized) VALUES ('op_valid_1', 'user1@example.com');
  INSERT INTO public.user_context (operator_id, email_normalized) VALUES ('op_other_email', 'other@example.com');

  -- Teste 1: anon não executa a RPC (SQLSTATE 42501)
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.link_legacy_operator(v_user1_id, 'op_valid_1', 'user1@example.com', 'User 1 New');
    RAISE EXCEPTION 'FALHA: anon conseguiu executar link_legacy_operator';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 para anon, obtido %', v_errcode;
    END IF;
  END;

  -- Teste 2: service_role não executa a RPC (SQLSTATE 42501)
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.link_legacy_operator(v_user1_id, 'op_valid_1', 'user1@example.com', 'User 1 New');
    RAISE EXCEPTION 'FALHA: service_role conseguiu executar link_legacy_operator';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 para service_role, obtido %', v_errcode;
    END IF;
  END;

  -- Simula contexto de auth.uid()
  RESET ROLE;
  EXECUTE format('CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS %L', 'SELECT ' || quote_literal(v_user1_id) || '::uuid');

  -- Teste 3: Usuário autenticado tenta alterar outro auth_user_id (falha)
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.link_legacy_operator(v_user2_id, 'op_valid_1', 'user1@example.com', 'Hacked Name');
    RAISE EXCEPTION 'FALHA: Usuário 1 conseguiu alterar auth_user_id do Usuário 2';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg NOT LIKE '%You can only link your own account%' THEN
      RAISE EXCEPTION 'FALHA: Mensagem de erro inesperada para ownership: %', v_errmsg;
    END IF;
  END;

  -- Teste 4: e-mail NULL falha
  BEGIN
    PERFORM public.link_legacy_operator(v_user1_id, 'op_valid_1', NULL, 'User 1');
    RAISE EXCEPTION 'FALHA: e-mail NULL foi aceito';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg NOT LIKE '%Email is required%' THEN
      RAISE EXCEPTION 'FALHA: Mensagem inesperada para e-mail NULL: %', v_errmsg;
    END IF;
  END;

  -- Teste 5: e-mail vazio falha
  BEGIN
    PERFORM public.link_legacy_operator(v_user1_id, 'op_valid_1', '   ', 'User 1');
    RAISE EXCEPTION 'FALHA: e-mail vazio foi aceito';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg NOT LIKE '%Email is required%' THEN
      RAISE EXCEPTION 'FALHA: Mensagem inesperada para e-mail vazio: %', v_errmsg;
    END IF;
  END;

  -- Teste 6: e-mail diferente do profile falha
  BEGIN
    PERFORM public.link_legacy_operator(v_user1_id, 'op_valid_1', 'user2@example.com', 'User 1');
    RAISE EXCEPTION 'FALHA: e-mail diferente do profile foi aceito';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg NOT LIKE '%Email does not match authenticated profile%' THEN
      RAISE EXCEPTION 'FALHA: Mensagem inesperada para mismatch de profile email: %', v_errmsg;
    END IF;
  END;

  -- Teste 7: operator_id ligado a outro e-mail falha
  BEGIN
    PERFORM public.link_legacy_operator(v_user1_id, 'op_other_email', 'user1@example.com', 'User 1');
    RAISE EXCEPTION 'FALHA: operator_id de outro email foi aceito';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errmsg = MESSAGE_TEXT;
    IF v_errmsg NOT LIKE '%Operator ID does not match authenticated email%' THEN
      RAISE EXCEPTION 'FALHA: Mensagem inesperada para operator email mismatch: %', v_errmsg;
    END IF;
  END;

  -- Testes 8, 9, 10: Chamada autenticada válida funciona, operator_id e name são atualizados
  PERFORM public.link_legacy_operator(v_user1_id, 'op_valid_1', 'user1@example.com', 'User 1 Valid');

  RESET ROLE;
  SELECT operator_id, name INTO v_updated_op, v_updated_name FROM public.profiles WHERE id = v_user1_id;
  IF v_updated_op != 'op_valid_1' OR v_updated_name != 'User 1 Valid' THEN
    RAISE EXCEPTION 'FALHA: operator_id ou name não foram atualizados corretamente: op=%, name=%', v_updated_op, v_updated_name;
  END IF;

  -- Teste 11: UPDATE direto de operator_id continua negado
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.profiles SET operator_id = 'op_hacked_direct' WHERE id = v_user1_id;
    RAISE EXCEPTION 'FALHA: UPDATE direto de operator_id deveria ter sido negado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
    IF v_errcode != '42501' THEN
      RAISE EXCEPTION 'FALHA: Esperado SQLSTATE 42501 para UPDATE direto de operator_id, obtido %', v_errcode;
    END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'TODOS OS 11 ASSERTS DE HARDENING DE LINK LEGADO PASSARAM COM SUCESSO!';
END $$;

ROLLBACK;
