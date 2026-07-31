-- =====================================================================
-- test_rls_v2.sql
-- Teste reproduzível dos cenários de RLS hardening v2.
-- Execução sugerida:
--   psql -v ON_ERROR_STOP=1 -f scripts/test_rls_v2.sql
--   (num Docker/PostgreSQL isolado — NÃO rodar em Preview/Produção)
--
-- Princípios de design (corrigidos vs versão anterior):
--   1. TRANSACTIONAL: todo o script roda dentro de uma única transação.
--      Qualquer erro aborta (ON_ERROR_STOP=1) e ROLLBACK desfaz tudo.
--      Nenhuma tabela, role, função ou fixture persiste após a execução.
--   2. SEM EXCEPTION WHEN others THEN NULL: asserts que engolem o próprio
--      RAISE EXCEPTION mascareariam vulnerabilidades. Cada cenário usa
--      padrão "espera-se que falhe" com `assert_expected_failure()` que
--      valida explicitamente a SQLCODE do erro, ou valida ROW_COUNT
--      da operação sob identidade capaz de enxergar o resultado.
--   3. service_role reproduz o Supabase: a role criada tem BYPASSRLS,
--      espelhando o comportamento real do service_role do Supabase.
--   4. TEST 5 não enumera nomes canônicos: enumera apenas policies
--      FOR ALL/DELETE/UPDATE em feedback_events e FOR DELETE/ALL nas
--      demais tabelas — qualquer policy residual proibida.
--   5. Validação de PUBLIC: testa que PUBLIC não tem grants nas tabelas.
--
-- Resultado esperado: todos os testes PASSAM e nada persiste.
-- =====================================================================

\echo '=================================================='
\echo 'RLS v2 Hardening — Bateria de testes (transacional)'
\echo '=================================================='

-- BEGIN outer: tudo é transacional. Erro -> ROLLBACK total.
BEGIN;

-- ===================================================================
-- SETUP: schema de teste isolado
-- ===================================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- auth.uid() mock: lê de current_setting (GUC) para simular sessão.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_role', true), ''), 'authenticated');
$$ LANGUAGE sql SECURITY DEFINER;

-- ===================================================================
-- SETUP: tabelas base (mesma forma que Supabase cria)
-- ===================================================================

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  operator_id text NOT NULL,
  name text,
  email text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.dossies (
  id uuid PRIMARY KEY,
  operator_id text NOT NULL,
  title text,
  content jsonb,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.extract_cache (
  id uuid PRIMARY KEY,
  operator_id text NOT NULL,
  url text,
  content text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.feedback_events (
  id uuid PRIMARY KEY,
  operator_id text NOT NULL,
  dossier_id uuid,
  feedback_type text,
  ai_content text,
  created_at timestamptz DEFAULT now()
);

-- ===================================================================
-- SETUP: roles do Supabase
-- ===================================================================

-- anon e authenticated são roles comuns (sem BYPASSRLS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  -- service_role reproduz o Supabase real: BYPASSRLS habilitado.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  ELSE
    ALTER ROLE service_role BYPASSRLS;
  END IF;
END $$;

-- ===================================================================
-- HELPERS DE TESTE
-- ===================================================================

-- assert(cond, msg): falha com EXCEPTION explícita. NUNCA capturar com
-- `WHEN others THEN NULL` — isso mascararia a falha do próprio assert.
CREATE OR REPLACE FUNCTION assert(condition boolean, message text) RETURNS void AS $$
BEGIN
  IF NOT condition THEN
    RAISE EXCEPTION 'ASSERT FAILED: %', message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- set_current_user: muda identidade simulada (GUC + ROLE).
-- Nota: dentro de SECURITY INVOKER + plpgsql, SET LOCAL ROLE respeita
-- o escopo da transação.
CREATE OR REPLACE FUNCTION set_current_user(p_user_id uuid, p_role text) RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_user_id', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('app.current_role', p_role, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END;
$$ LANGUAGE plpgsql;

-- assert_expected_failure: executa SQL e verifica que ela falha com a
-- SQLCODE esperada (insufficient_privilege ou check_violation).
-- NÃO usa `WHEN others THEN NULL` — captura apenas a categoria esperada
-- e re-raise em caso contrário, evitando false-positivos.
CREATE OR REPLACE FUNCTION assert_expected_failure(p_sql text, p_expected_sqlstate text DEFAULT '42501') RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    -- Se chegou aqui, a SQL NÃO falhou — é exatamente o que queríamos evitar.
    RAISE EXCEPTION 'EXPECTED_FAILURE_NOT_RAISED: operação deveria falhar mas sucedeu';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR others THEN
      -- Aceita insufficient_privilege (42501) ou check_violation (23514).
      -- Para qualquer outro erro, re-raise para não mascarar.
      IF SQLSTATE NOT IN ('42501', '23514') THEN
        RAISE EXCEPTION 'UNEXPECTED_FAILURE: SQLSTATE=%, MESSAGE=%', SQLSTATE, SQLERRM;
      END IF;
  END;
END;
$$ LANGUAGE plpgsql;

-- ===================================================================
-- FIXTURES: Alice e Bob
-- ===================================================================

INSERT INTO public.profiles (id, operator_id, name, email)
VALUES
  ('00000000-0000-0000-0000-00000000000a'::uuid, 'op_alice_123', 'Alice', 'alice@test.com'),
  ('00000000-0000-0000-0000-00000000000b'::uuid, 'op_bob_456', 'Bob', 'bob@test.com');

INSERT INTO public.dossies (id, operator_id, title) VALUES
  ('11111111-1111-1111-1111-11111111111a'::uuid, 'op_alice_123', 'Dossiê Alice'),
  ('11111111-1111-1111-1111-11111111111b'::uuid, 'op_bob_456', 'Dossiê Bob');

-- Garantia de grants base para que os testes não dependam do estado
-- externo. Após a migration, estes grants serão re-criados seletivamente.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
-- service_role reproduz Supabase (BYPASSRLS) — damos SELECT nas tabelas
-- para que os testes de validação cross-operator (read-side) funcionem.
GRANT SELECT ON public.dossies, public.extract_cache, public.feedback_events TO service_role;

-- ===================================================================
-- APLICAR MIGRATION (1a execução)
-- ===================================================================

\echo ''
\echo '--- Aplicando migration v2 (1a execução) ---'
\set ON_ERROR_STOP on
\i supabase/migrations/20260731150000_rls_sensitive_tables_hardening_v3.sql

-- ===================================================================
-- TEST 1: migration aplicada sem erro e RLS habilitado
-- ===================================================================

\echo ''
\echo 'TEST 1: migration aplicada com RLS habilitado nas 3 tabelas'
DO $$
DECLARE v_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class
   WHERE relname = 'dossies' AND relnamespace = 'public'::regnamespace;
  PERFORM assert(v_rls, 'dossies RLS not enabled');

  SELECT relrowsecurity INTO v_rls FROM pg_class
   WHERE relname = 'extract_cache' AND relnamespace = 'public'::regnamespace;
  PERFORM assert(v_rls, 'extract_cache RLS not enabled');

  SELECT relrowsecurity INTO v_rls FROM pg_class
   WHERE relname = 'feedback_events' AND relnamespace = 'public'::regnamespace;
  PERFORM assert(v_rls, 'feedback_events RLS not enabled');

  RAISE NOTICE 'TEST 1: PASS';
END $$;

-- ===================================================================
-- TEST 2: idempotência (2a execução)
-- ===================================================================

\echo ''
\echo 'TEST 2: idempotência (reaplicando migration)'
\i supabase/migrations/20260731150000_rls_sensitive_tables_hardening_v3.sql
DO $$ BEGIN RAISE NOTICE 'TEST 2: PASS'; END $$;

-- ===================================================================
-- TEST 3: anon sem grants nas 3 tabelas
-- ===================================================================

\echo ''
\echo 'TEST 3: anon sem grants em dossies/extract_cache/feedback_events'
DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.role_table_grants
   WHERE grantee = 'anon'
     AND table_name IN ('dossies', 'extract_cache', 'feedback_events');
  PERFORM assert(v_count = 0, format('anon tem %s grants residuais', v_count));
  RAISE NOTICE 'TEST 3: PASS';
END $$;

-- ===================================================================
-- TEST 4: PUBLIC sem grants nas 3 tabelas (NOVO — correção hardening)
-- ===================================================================

\echo ''
\echo 'TEST 4: PUBLIC sem grants em nenhuma tabela sensível'
DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.role_table_grants
   WHERE grantee = 'PUBLIC'
     AND table_name IN ('dossies', 'extract_cache', 'feedback_events');
  PERFORM assert(v_count = 0, format('PUBLIC tem %s grants residuais', v_count));
  RAISE NOTICE 'TEST 4: PASS';
END $$;

-- ===================================================================
-- TEST 5: nenhuma policy residual proibida
--         (não enumera nomes canônicos — apenas cláusulas proibidas)
-- ===================================================================

\echo ''
\echo 'TEST 5: nenhuma policy FOR DELETE/FOR ALL em tabelas sensíveis'
DO $$
DECLARE v_count bigint;
BEGIN
  -- Nenhuma policy pode ter FOR DELETE ou FOR ALL nas tabelas sensíveis.
  -- Nenhuma policy pode ter FOR DELETE ou FOR ALL nas tabelas sensíveis.
  -- pg_policies.cmd expõe o polcmd do catálogo (SELECT/INSERT/UPDATE/DELETE/ALL).
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('dossies', 'extract_cache', 'feedback_events')
     AND cmd IN ('DELETE', 'ALL');
  PERFORM assert(v_count = 0, format('Encontradas %s policies DELETE/ALL', v_count));

  -- feedback_events também não pode ter FOR UPDATE (write-once).
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'feedback_events'
     AND cmd = 'UPDATE';
  PERFORM assert(v_count = 0, format('feedback_events tem %s policies UPDATE', v_count));
  RAISE NOTICE 'TEST 5: PASS';
END $$;

-- ===================================================================
-- TEST 6: Alice lê apenas próprio dossiê
-- ===================================================================

\echo ''
\echo 'TEST 6: Alice lê próprio dossiê, não vê Bob'
DO $$
DECLARE v_rows bigint;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  SELECT count(*) INTO v_rows FROM public.dossies;
  PERFORM assert(v_rows = 1, format('Alice viu %s linhas (esperado 1)', v_rows));
  SELECT count(*) INTO v_rows FROM public.dossies WHERE id = '11111111-1111-1111-1111-11111111111b'::uuid;
  PERFORM assert(v_rows = 0, 'Alice viu dossiê do Bob');
  RAISE NOTICE 'TEST 6: PASS';
END $$;

-- ===================================================================
-- TEST 7: Alice não UPDATE dossiê do Bob
--         (valida ROW_COUNT — sem EXCEPTION engolindo assert)
-- ===================================================================

\echo ''
\echo 'TEST 7: Alice não altera dossiê do Bob'
DO $$
DECLARE v_rows integer; v_check bigint;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  UPDATE public.dossies SET title = 'HACKED' WHERE id = '11111111-1111-1111-1111-11111111111b'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM assert(v_rows = 0, format('Alice alterou %s linhas do Bob', v_rows));

  -- Confirmação read-side sob service_role (capaz de enxergar tudo):
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_check FROM public.dossies
   WHERE id = '11111111-1111-1111-1111-11111111111b'::uuid AND title = 'HACKED';
  PERFORM assert(v_check = 0, 'Título do Bob foi efetivamente alterado');
  SET LOCAL ROLE none;
  RAISE NOTICE 'TEST 7: PASS';
END $$;

-- ===================================================================
-- TEST 8: INSERT com operator_id divergente é bloqueado
-- ===================================================================

\echo ''
\echo 'TEST 8: INSERT divergente bloqueado (com validação read-side)'
DO $$
DECLARE v_check bigint;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  PERFORM assert_expected_failure($fail$
    INSERT INTO public.dossies (id, operator_id, title)
    VALUES ('99999999-9999-9999-9999-999999999999'::uuid, 'op_bob_456', 'Hack')
  $fail$);

  -- Confirma sob service_role que a linha NÃO foi inserida.
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_check FROM public.dossies
   WHERE id = '99999999-9999-9999-9999-999999999999'::uuid;
  PERFORM assert(v_check = 0, 'Linha divergente foi inserida');
  SET LOCAL ROLE none;
  RAISE NOTICE 'TEST 8: PASS';
END $$;

-- ===================================================================
-- TEST 9: UPDATE reatribuindo operator_id é bloqueado
-- ===================================================================

\echo ''
\echo 'TEST 9: UPDATE reatribuindo operator_id bloqueado (read-side)'
DO $$
DECLARE v_check bigint;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  PERFORM assert_expected_failure($fail$
    UPDATE public.dossies SET operator_id = 'op_bob_456'
     WHERE id = '11111111-1111-1111-1111-11111111111a'::uuid
  $fail$);

  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_check FROM public.dossies
   WHERE id = '11111111-1111-1111-1111-11111111111a'::uuid AND operator_id = 'op_bob_456';
  PERFORM assert(v_check = 0, 'operator_id do dossiê da Alice foi reatribuído');
  SET LOCAL ROLE none;
  RAISE NOTICE 'TEST 9: PASS';
END $$;

-- ===================================================================
-- TEST 10: anon não lê nem escreve (assert_expected_failure)
-- ===================================================================

\echo ''
\echo 'TEST 10: anon sem SELECT/INSERT em dossies'
DO $$
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'anon');
  SET LOCAL ROLE anon;
  PERFORM assert_expected_failure($fail$ SELECT count(*) FROM public.dossies $fail$);
  PERFORM assert_expected_failure($fail$
    INSERT INTO public.dossies (id, operator_id, title)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'x', 'x')
  $fail$);
  SET LOCAL ROLE none;
  RAISE NOTICE 'TEST 10: PASS';
END $$;

-- ===================================================================
-- TEST 11: service_role com BYPASSRLS lê tudo (reproduz Supabase)
-- ===================================================================

\echo ''
\echo 'TEST 11: service_role (BYPASSRLS) vê todas as linhas'
DO $$
DECLARE v_count bigint;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM public.dossies;
  PERFORM assert(v_count >= 2, format('service_role viu apenas %s linhas', v_count));
  SET LOCAL ROLE none;
  RAISE NOTICE 'TEST 11: PASS';
END $$;

-- ===================================================================
-- TEST 12: feedback_events write-once (sem UPDATE)
-- ===================================================================

\echo ''
\echo 'TEST 12: feedback_events sem UPDATE mesmo para owner'
DO $$
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  INSERT INTO public.feedback_events (id, operator_id, feedback_type)
  VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 'op_alice_123', 'up');
  PERFORM assert_expected_failure($fail$
    UPDATE public.feedback_events SET feedback_type = 'down'
     WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
  $fail$);
  RAISE NOTICE 'TEST 12: PASS';
END $$;

-- ===================================================================
-- TEST 13: sem policy residual para anon
-- ===================================================================

\echo ''
\echo 'TEST 13: nenhuma policy declarada exclusivamente para anon'
DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('dossies', 'extract_cache', 'feedback_events')
     AND roles = '{anon}';
  PERFORM assert(v_count = 0, format('anon tem %s policies dedicadas', v_count));
  RAISE NOTICE 'TEST 13: PASS';
END $$;

-- ===================================================================
-- TEST 14: soft delete próprio por UPDATE funciona
-- ===================================================================

\echo ''
\echo 'TEST 14: soft delete próprio por UPDATE funciona'
DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  UPDATE public.dossies SET deleted_at = now()
   WHERE id = '11111111-1111-1111-1111-11111111111a'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM assert(v_rows = 1, format('soft delete alterou %s linhas', v_rows));
  RAISE NOTICE 'TEST 14: PASS';
END $$;

-- ===================================================================
-- TEST 15: Alice não altera deleted_at do Bob
-- ===================================================================

\echo ''
\echo 'TEST 15: soft delete cross-operator bloqueado (read-side)'
DO $$
DECLARE v_rows integer; v_check bigint;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  UPDATE public.dossies SET deleted_at = now()
   WHERE id = '11111111-1111-1111-1111-11111111111b'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM assert(v_rows = 0, format('Alice alterou %s linhas do Bob', v_rows));

  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_check FROM public.dossies
   WHERE id = '11111111-1111-1111-1111-11111111111b'::uuid AND deleted_at IS NOT NULL;
  PERFORM assert(v_check = 0, 'deleted_at do Bob foi alterado');
  SET LOCAL ROLE none;
  RAISE NOTICE 'TEST 15: PASS';
END $$;

-- ===================================================================
-- TEST 16: DELETE físico bloqueado para authenticated
-- ===================================================================

\echo ''
\echo 'TEST 16: DELETE físico bloqueado para authenticated'
DO $$
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  PERFORM assert_expected_failure($fail$
    DELETE FROM public.dossies WHERE id = '11111111-1111-1111-1111-11111111111a'::uuid
  $fail$);
  RAISE NOTICE 'TEST 16: PASS';
END $$;

-- ===================================================================
-- TEST 17: grants canônicos presentes para authenticated
-- ===================================================================

\echo ''
\echo 'TEST 17: authenticated tem apenas grants canônicos (SELECT/INSERT[/UPDATE])'
DO $$
DECLARE v_dossiers_grants text; v_extract_grants text; v_feedback_grants text;
BEGIN
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
    INTO v_dossiers_grants
    FROM information_schema.role_table_grants
   WHERE grantee = 'authenticated' AND table_name = 'dossies';
  PERFORM assert(v_dossiers_grants = 'INSERT,SELECT,UPDATE',
    format('dossies grants inesperados: %s', v_dossiers_grants));

  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
    INTO v_extract_grants
    FROM information_schema.role_table_grants
   WHERE grantee = 'authenticated' AND table_name = 'extract_cache';
  PERFORM assert(v_extract_grants = 'INSERT,SELECT,UPDATE',
    format('extract_cache grants inesperados: %s', v_extract_grants));

  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
    INTO v_feedback_grants
    FROM information_schema.role_table_grants
   WHERE grantee = 'authenticated' AND table_name = 'feedback_events';
  PERFORM assert(v_feedback_grants = 'INSERT,SELECT',
    format('feedback_events grants inesperados: %s', v_feedback_grants));
  RAISE NOTICE 'TEST 17: PASS';
END $$;

-- ===================================================================
-- TEST 18: service_role permanece intacto (não tocado pela migration)
-- ===================================================================

\echo ''
\echo 'TEST 18: service_role mantém BYPASSRLS e acesso às tabelas'
DO $$
DECLARE v_count bigint;
BEGIN
  PERFORM assert(
    (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'),
    'service_role perdeu BYPASSRLS'
  );
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM public.dossies;
  PERFORM assert(v_count >= 2, format('service_role viu apenas %s dossiês', v_count));
  SELECT count(*) INTO v_count FROM public.extract_cache;
  SELECT count(*) INTO v_count FROM public.feedback_events;
  SET LOCAL ROLE none;
  RAISE NOTICE 'TEST 18: PASS';
END $$;

-- ===================================================================
-- CLEANUP: ROLLBACK desfaz tudo (tabelas, roles, funções, fixtures)
-- ===================================================================

ROLLBACK;

\echo ''
\echo '=================================================='
\echo 'ROLLBACK executado — nada persiste.'
\echo 'Todos os testes PASSARAM.'
\echo '=================================================='
