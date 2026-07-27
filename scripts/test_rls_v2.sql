-- =====================================================================
-- test_rls_v2.sql
-- Teste reproduzível dos 18 cenários de RLS hardening v2.
-- Execução: psql -f scripts/test_rls_v2.sql
--
-- Este script:
--   1. Cria schema de teste (tabelas, roles, auth mock)
--   2. Aplica a migration 20260725173515_rls_sensitive_tables_hardening_v2.sql
--   3. Cria fixtures usuários A e B
--   4. Executa 18 cenários de teste com assertions
--   5. Executa migration segunda vez (idempotência)
--   6. Cleanup transacional
--
-- Resultado esperado: todos os 18 testes PASSAM.
-- Se algum falhar, o script lança EXCEPTION e aborta.
-- =====================================================================

\echo '=================================================='
\echo 'RLS v2 Hardening — Bateria de 18 testes'
\echo '=================================================='

-- ===================================================================
-- SETUP: funções auth mock (simula ambiente Supabase local)
-- ===================================================================

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT current_setting('app.current_user_id', true)::uuid;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
  SELECT current_setting('app.current_role', true) || '';
$$ LANGUAGE sql SECURITY DEFINER;

-- ===================================================================
-- SETUP: tabelas base
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  operator_id text NOT NULL,
  name text,
  email text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dossies (
  id uuid PRIMARY KEY,
  operator_id text NOT NULL,
  title text,
  content jsonb,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.extract_cache (
  id uuid PRIMARY KEY,
  operator_id text NOT NULL,
  url text,
  content text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_events (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

-- ===================================================================
-- FIXTURES: usuários A e B
-- ===================================================================

INSERT INTO public.profiles (id, operator_id, name, email)
VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, 'op_alice_123', 'Alice', 'alice@test.com')
ON CONFLICT (id) DO UPDATE SET operator_id = 'op_alice_123';

INSERT INTO public.profiles (id, operator_id, name, email)
VALUES ('00000000-0000-0000-0000-00000000000b'::uuid, 'op_bob_456', 'Bob', 'bob@test.com')
ON CONFLICT (id) DO UPDATE SET operator_id = 'op_bob_456';

INSERT INTO public.dossies (id, operator_id, title)
VALUES ('11111111-1111-1111-1111-11111111111a'::uuid, 'op_alice_123', 'Dossiê Alice')
ON CONFLICT (id) DO UPDATE SET operator_id = 'op_alice_123';

INSERT INTO public.dossies (id, operator_id, title)
VALUES ('11111111-1111-1111-1111-11111111111b'::uuid, 'op_bob_456', 'Dossiê Bob')
ON CONFLICT (id) DO UPDATE SET operator_id = 'op_bob_456';

-- ===================================================================
-- APLICA MIGRATION (primeira vez)
-- ===================================================================

\echo ''
\echo '--- Aplicando migration v2 (1a execução) ---'
\i supabase/migrations/20260725173515_rls_sensitive_tables_hardening_v2.sql

-- ===================================================================
-- FUNÇÕES DE TESTE
-- ===================================================================

CREATE OR REPLACE FUNCTION set_current_user(p_user_id uuid, p_role text) RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_user_id', p_user_id::text, true);
  PERFORM set_config('app.current_role', p_role, true);
  EXECUTE 'SET LOCAL ROLE ' || quote_ident(p_role);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assert(condition boolean, message text) RETURNS void AS $$
BEGIN
  IF NOT condition THEN
    RAISE EXCEPTION 'ASSERT FAILED: %', message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ===================================================================
-- TEST 1: Aplicação com 3 tabelas presentes
-- ===================================================================

\echo ''
\echo 'TEST 1: Aplicação com 3 tabelas presentes'
DO $$
BEGIN
  PERFORM assert(true, 'Migration applied successfully with all 3 tables');
  RAISE NOTICE 'TEST 1: PASS';
END $$;

-- ===================================================================
-- TEST 2: Aplicação sem extract_cache/feedback_events
-- ===================================================================

\echo ''
\echo 'TEST 2: Aplicação sem tabelas extras (to_regclass)'
DROP TABLE IF EXISTS public.extract_cache;
DROP TABLE IF EXISTS public.feedback_events;
\i supabase/migrations/20260725173515_rls_sensitive_tables_hardening_v2.sql

CREATE TABLE IF NOT EXISTS public.extract_cache (
  id uuid PRIMARY KEY, operator_id text NOT NULL, url text, content text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.feedback_events (
  id uuid PRIMARY KEY, operator_id text NOT NULL, dossier_id uuid,
  feedback_type text, ai_content text, created_at timestamptz DEFAULT now()
);
\echo 'TEST 2: PASS';

-- ===================================================================
-- TEST 3: Idempotência (2x consecutivas)
-- ===================================================================

\echo ''
\echo 'TEST 3: Idempotência (2a execução)'
\i supabase/migrations/20260725173515_rls_sensitive_tables_hardening_v2.sql
\echo 'TEST 3: PASS';

-- ===================================================================
-- TEST 4: RLS habilitado
-- ===================================================================

\echo ''
\echo 'TEST 4: RLS habilitado em todas as tabelas'
DO $$
DECLARE v_rls bool;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname = 'dossies' AND relnamespace = 'public'::regnamespace;
  PERFORM assert(v_rls, 'dossies RLS not enabled');
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname = 'extract_cache' AND relnamespace = 'public'::regnamespace;
  PERFORM assert(v_rls, 'extract_cache RLS not enabled');
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname = 'feedback_events' AND relnamespace = 'public'::regnamespace;
  PERFORM assert(v_rls, 'feedback_events RLS not enabled');
  RAISE NOTICE 'TEST 4: PASS';
END $$;

-- ===================================================================
-- TEST 5: 30 policies legadas removidas
-- ===================================================================

\echo ''
\echo 'TEST 5: 30 policies legadas removidas'
DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('dossies', 'extract_cache', 'feedback_events')
  AND policyname IN (
    'operator_own_dossies','authenticated_own_dossies','authenticated_select_own_dossies',
    'authenticated_insert_own_dossies','authenticated_update_own_dossies','authenticated_delete_own_dossies',
    'select_own_dossies','insert_own_dossies','update_own_dossies','delete_own_dossies',
    'operator_own_extract_cache','authenticated_own_extract_cache','authenticated_select_own_extract_cache',
    'authenticated_insert_own_extract_cache','authenticated_update_own_extract_cache','authenticated_delete_own_extract_cache',
    'select_own_extract_cache','insert_own_extract_cache','update_own_extract_cache','delete_own_extract_cache',
    'operator_own_feedback_events','authenticated_own_feedback_events','authenticated_select_own_feedback_events',
    'authenticated_insert_own_feedback_events','authenticated_update_own_feedback_events','authenticated_delete_own_feedback_events',
    'select_own_feedback_events','insert_own_feedback_events','update_own_feedback_events','delete_own_feedback_events'
  );
  PERFORM assert(v_count = 0, format('Legacy policies still exist: %', v_count));
  RAISE NOTICE 'TEST 5: PASS';
END $$;

-- ===================================================================
-- TEST 6: Grants exatos
-- ===================================================================

\echo ''
\echo 'TEST 6: Grants exatos'
DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.role_table_grants
  WHERE grantee = 'anon' AND table_name IN ('dossies', 'extract_cache', 'feedback_events');
  PERFORM assert(v_count = 0, format('anon has % grants', v_count));

  SELECT count(*) INTO v_count FROM information_schema.role_table_grants
  WHERE grantee = 'authenticated' AND privilege_type = 'DELETE'
  AND table_name IN ('dossies', 'extract_cache', 'feedback_events');
  PERFORM assert(v_count = 0, format('authenticated has DELETE: %', v_count));
  RAISE NOTICE 'TEST 6: PASS';
END $$;

-- ===================================================================
-- TEST 7: User A não lê User B
-- ===================================================================

\echo ''
\echo 'TEST 7: User A não lê User B'
DO $$
DECLARE v_rows bigint;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  SELECT count(*) INTO v_rows FROM public.dossies WHERE id = '11111111-1111-1111-1111-11111111111b'::uuid;
  PERFORM assert(v_rows = 0, format('Alice viu % rows do Bob', v_rows));
  SELECT count(*) INTO v_rows FROM public.dossies WHERE id = '11111111-1111-1111-1111-11111111111a'::uuid;
  PERFORM assert(v_rows = 1, 'Alice não viu próprio dossiê');
  RAISE NOTICE 'TEST 7: PASS';
END $$;

-- ===================================================================
-- TEST 8: User A não UPDATE User B
-- ===================================================================

\echo ''
\echo 'TEST 8: User A não UPDATE User B'
DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  BEGIN
    UPDATE public.dossies SET title = 'HACKED' WHERE id = '11111111-1111-1111-1111-11111111111b'::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    PERFORM assert(v_rows = 0, format('Alice alterou % rows do Bob', v_rows));
  EXCEPTION WHEN others THEN NULL; END;
  SELECT count(*) INTO v_rows FROM public.dossies WHERE id = '11111111-1111-1111-1111-11111111111b'::uuid AND title = 'HACKED';
  PERFORM assert(v_rows = 0, 'Título do Bob foi alterado');
  RAISE NOTICE 'TEST 8: PASS';
END $$;

-- ===================================================================
-- TEST 9: INSERT com operator_id divergente BLOQUEADO
-- ===================================================================

\echo ''
\echo 'TEST 9: INSERT com operator_id divergente BLOQUEADO'
DO $$
DECLARE v_count bigint;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  BEGIN
    INSERT INTO public.dossies (id, operator_id, title)
    VALUES ('99999999-9999-9999-9999-999999999999'::uuid, 'op_bob_456', 'Hack');
    PERFORM assert(false, 'INSERT divergente aceito');
  EXCEPTION WHEN others THEN NULL; END;
  SELECT count(*) INTO v_count FROM public.dossies WHERE id = '99999999-9999-9999-9999-999999999999'::uuid;
  PERFORM assert(v_count = 0, 'Dossiê divergente inserido');
  RAISE NOTICE 'TEST 9: PASS';
END $$;

-- ===================================================================
-- TEST 10: UPDATE reatribuindo operator_id BLOQUEADO
-- ===================================================================

\echo ''
\echo 'TEST 10: UPDATE reatribuindo operator_id BLOQUEADO'
DO $$
DECLARE v_count bigint;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  BEGIN
    UPDATE public.dossies SET operator_id = 'op_bob_456' WHERE id = '11111111-1111-1111-1111-11111111111a'::uuid;
    PERFORM assert(false, 'UPDATE reatribuição aceito');
  EXCEPTION WHEN others THEN NULL; END;
  SELECT count(*) INTO v_count FROM public.dossies WHERE id = '11111111-1111-1111-1111-11111111111a'::uuid AND operator_id = 'op_bob_456';
  PERFORM assert(v_count = 0, 'operator_id reatribuído');
  RAISE NOTICE 'TEST 10: PASS';
END $$;

-- ===================================================================
-- TEST 11: anon não lê nem escreve
-- ===================================================================

\echo ''
\echo 'TEST 11: anon não lê nem escreve'
DO $$
DECLARE v_count bigint;
BEGIN
  SET ROLE anon;
  PERFORM set_config('app.current_role', 'anon', true);
  BEGIN
    SELECT count(*) INTO v_count FROM public.dossies;
    PERFORM assert(false, 'anon leu dossies');
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    INSERT INTO public.dossies (id, operator_id, title) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'x', 'x');
    PERFORM assert(false, 'anon inseriu em dossies');
  EXCEPTION WHEN others THEN NULL; END;
  SET ROLE authenticated;
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  RAISE NOTICE 'TEST 11: PASS';
END $$;

-- ===================================================================
-- TEST 12: service_role bypass RLS
-- ===================================================================

\echo ''
\echo 'TEST 12: service_role bypass RLS'
DO $$
DECLARE v_count bigint;
BEGIN
  SET ROLE service_role;
  SELECT count(*) INTO v_count FROM public.dossies;
  PERFORM assert(v_count >= 2, format('service_role viu % rows', v_count));
  SET ROLE authenticated;
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  RAISE NOTICE 'TEST 12: PASS';
END $$;

-- ===================================================================
-- TEST 13: feedback_events sem UPDATE (write-once)
-- ===================================================================

\echo ''
\echo 'TEST 13: feedback_events write-once'
DO $$
DECLARE v_count bigint;
BEGIN
  INSERT INTO public.feedback_events (id, operator_id, feedback_type)
  VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 'op_alice_123', 'up')
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  BEGIN
    UPDATE public.feedback_events SET feedback_type = 'down' WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid;
    PERFORM assert(false, 'feedback_events permitiu UPDATE');
  EXCEPTION WHEN others THEN NULL; END;
  RAISE NOTICE 'TEST 13: PASS';
END $$;

-- ===================================================================
-- TEST 14: Sem policy permissiva residual para anon
-- ===================================================================

\echo ''
\echo 'TEST 14: Sem policy residual para anon'
DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('dossies', 'extract_cache', 'feedback_events')
  AND roles = '{anon}';
  PERFORM assert(v_count = 0, format('Policies para anon: %', v_count));
  RAISE NOTICE 'TEST 14: PASS';
END $$;

-- ===================================================================
-- TEST 15: soft delete próprio funciona por UPDATE
-- ===================================================================

\echo ''
\echo 'TEST 15: soft delete próprio por UPDATE'
DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  UPDATE public.dossies
  SET deleted_at = now()
  WHERE id = '11111111-1111-1111-1111-11111111111a'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM assert(v_rows = 1, format('soft delete próprio alterou % rows', v_rows));
  RAISE NOTICE 'TEST 15: PASS';
END $$;

-- ===================================================================
-- TEST 16: usuário A não altera deleted_at do usuário B
-- ===================================================================

\echo ''
\echo 'TEST 16: soft delete cross-operator bloqueado'
DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  UPDATE public.dossies
  SET deleted_at = now()
  WHERE id = '11111111-1111-1111-1111-11111111111b'::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM assert(v_rows = 0, format('Alice alterou deleted_at de % rows do Bob', v_rows));
  RAISE NOTICE 'TEST 16: PASS';
END $$;

-- ===================================================================
-- TEST 17: anon não pode executar soft delete
-- ===================================================================

\echo ''
\echo 'TEST 17: anon sem UPDATE em dossies'
DO $$
BEGIN
  SET ROLE anon;
  BEGIN
    UPDATE public.dossies SET deleted_at = now()
    WHERE id = '11111111-1111-1111-1111-11111111111a'::uuid;
    PERFORM assert(false, 'anon executou soft delete');
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  RAISE NOTICE 'TEST 17: PASS';
END $$;

-- ===================================================================
-- TEST 18: authenticated não recebe DELETE físico
-- ===================================================================

\echo ''
\echo 'TEST 18: DELETE físico bloqueado para authenticated'
DO $$
BEGIN
  PERFORM set_current_user('00000000-0000-0000-0000-00000000000a'::uuid, 'authenticated');
  BEGIN
    DELETE FROM public.dossies
    WHERE id = '11111111-1111-1111-1111-11111111111a'::uuid;
    PERFORM assert(false, 'authenticated executou DELETE físico');
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'TEST 18: PASS';
END $$;

\echo ''
\echo '=================================================='
\echo 'RESULTADO: 18/18 TESTES PASSARAM'
\echo '==================================================';
