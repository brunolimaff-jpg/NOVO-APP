-- Teste PostgreSQL versionado para autorização corporativa e copy-on-access.
-- Executar somente no banco descartável com o nome exato:
--   psql -v ON_ERROR_STOP=1 -d novoapp_dossier_reuse_test \
--     -f scripts/test_secure_dossier_reuse.sql

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'novoapp_dossier_reuse_test' THEN
    RAISE EXCEPTION 'FALHA: execute somente no banco descartável novoapp_dossier_reuse_test';
  END IF;
END $$;

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

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

DROP TABLE IF EXISTS public.dossier_accesses CASCADE;
DROP TABLE IF EXISTS public.dossies CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS auth.users CASCADE;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  operator_id text UNIQUE,
  email text,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dossies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL,
  operator_email text,
  title text,
  empresa_alvo text,
  cnpj text,
  modo_principal text,
  score_oportunidade integer,
  resumo_dossie text,
  content jsonb NOT NULL,
  synced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.dossier_accesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossies(id) ON DELETE CASCADE,
  operator_id text NOT NULL,
  cnpj text,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dossies ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_owner_only_dossies ON public.dossies
  FOR SELECT TO authenticated
  USING (operator_id = (
    SELECT p.operator_id FROM public.profiles AS p WHERE p.id = auth.uid()
  ));

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.dossies TO authenticated;
GRANT SELECT, INSERT ON public.dossier_accesses TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;

\i supabase/migrations/20260730193000_secure_cross_operator_dossier_reuse.sql

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'a@senior.com.br', now()),
  ('22222222-2222-4222-8222-222222222222', 'b@senior.com.br', now()),
  ('33333333-3333-4333-8333-333333333333', 'c@senior.com.br', now()),
  ('44444444-4444-4444-8444-444444444444', 'x@external.example', now()),
  ('55555555-5555-4555-8555-555555555555', 'u@senior.com.br', NULL),
  ('66666666-6666-4666-8666-666666666666', 'm-auth@senior.com.br', now());

INSERT INTO public.profiles (id, operator_id, email, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'operator-a', 'a@senior.com.br', 'Operador A'),
  ('22222222-2222-4222-8222-222222222222', 'operator-b', 'b@senior.com.br', 'Operador B'),
  ('33333333-3333-4333-8333-333333333333', 'operator-c', 'c@senior.com.br', 'Operador C'),
  ('44444444-4444-4444-8444-444444444444', 'operator-x', 'x@external.example', 'Externo X'),
  ('55555555-5555-4555-8555-555555555555', 'operator-u', 'u@senior.com.br', 'Não confirmado U'),
  ('66666666-6666-4666-8666-666666666666', 'operator-m', 'm-profile@senior.com.br', 'Divergente M');

INSERT INTO public.dossies (
  id, operator_id, title, empresa_alvo, cnpj, modo_principal,
  score_oportunidade, resumo_dossie, content, created_at, updated_at
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'operator-a',
  'Dossiê Fonte',
  'Empresa Fonte',
  '12.345.678/0001-99',
  'default',
  81,
  'Resumo original',
  '{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","title":"Dossiê Fonte","empresaAlvo":"Empresa Fonte","cnpj":"12345678000199","modoPrincipal":"default","scoreOportunidade":81,"resumoDossie":"Resumo original","createdAt":"2026-07-01T10:00:00.000Z","updatedAt":"2026-07-01T10:00:00.000Z","messages":[{"id":"m1","sender":"bot","text":"conteúdo original"}]}'::jsonb,
  '2026-07-01T10:00:00Z',
  '2026-07-01T10:00:00Z'
);

CREATE TEMP TABLE source_before AS
SELECT to_jsonb(d) AS snapshot
FROM public.dossies AS d
WHERE d.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

CREATE TEMP TABLE runtime_results (key text PRIMARY KEY, value jsonb NOT NULL);
GRANT ALL ON runtime_results TO authenticated;

-- B não lê o conteúdo de A diretamente, descobre a raiz e cria sua cópia.
SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
INSERT INTO runtime_results VALUES (
  'direct_rows_b',
  to_jsonb((SELECT count(*) FROM public.dossies WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
);
INSERT INTO runtime_results
SELECT 'discovery_b_before', to_jsonb(r)
FROM public.find_reusable_dossier('12.345.678/0001-99', 'Nome ignorado') AS r;
INSERT INTO runtime_results
SELECT 'reuse_b_first', to_jsonb(r)
FROM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS r;
INSERT INTO runtime_results
SELECT 'reuse_b_second', to_jsonb(r)
FROM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS r;
INSERT INTO runtime_results
SELECT 'discovery_b_after', to_jsonb(r)
FROM public.find_reusable_dossier('12.345.678/0001-99', 'Nome ignorado') AS r;
RESET ROLE;

-- C ainda não possui cópia: descobre a raiz, nunca a cópia de B.
SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
SET LOCAL ROLE authenticated;
INSERT INTO runtime_results
SELECT 'discovery_c_before', to_jsonb(r)
FROM public.find_reusable_dossier('12.345.678/0001-99', 'Nome ignorado') AS r;
INSERT INTO runtime_results
SELECT 'reuse_c_from_b', to_jsonb(r)
FROM public.reuse_dossier_for_current_operator(
  (SELECT (value->>'dossier_id')::uuid FROM runtime_results WHERE key = 'reuse_b_first')
) AS r;
INSERT INTO runtime_results
SELECT 'reuse_c_from_root', to_jsonb(r)
FROM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS r;
RESET ROLE;

-- A abre seu próprio dossiê, sem clone.
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SET LOCAL ROLE authenticated;
INSERT INTO runtime_results
SELECT 'reuse_a', to_jsonb(r)
FROM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS r;
RESET ROLE;

-- Autorização corporativa: domínio, confirmação e igualdade de e-mail são obrigatórios.
DO $$
DECLARE
  v_user_id uuid;
  v_error_code text;
  v_error_message text;
BEGIN
  FOREACH v_user_id IN ARRAY ARRAY[
    '44444444-4444-4444-8444-444444444444'::uuid,
    '55555555-5555-4555-8555-555555555555'::uuid,
    '66666666-6666-4666-8666-666666666666'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    BEGIN
      PERFORM public.find_reusable_dossier('12.345.678/0001-99', 'Empresa Fonte');
      RAISE EXCEPTION 'FALHA: usuário não corporativo executou descoberta';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_message = MESSAGE_TEXT;
      IF v_error_code <> '42501' OR v_error_message <> 'access denied' THEN
        RAISE EXCEPTION 'FALHA: descoberta revelou condição interna: state=%, msg=%', v_error_code, v_error_message;
      END IF;
    END;

    BEGIN
      PERFORM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      RAISE EXCEPTION 'FALHA: usuário não corporativo executou reutilização';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_message = MESSAGE_TEXT;
      IF v_error_code <> '42501' OR v_error_message <> 'access denied' THEN
        RAISE EXCEPTION 'FALHA: reutilização revelou condição interna: state=%, msg=%', v_error_code, v_error_message;
      END IF;
    END;

    RESET ROLE;
  END LOOP;
END $$;

-- Fixture deliberadamente inválida: uma cópia apontando para a cópia de B.
INSERT INTO public.dossies (
  id, operator_id, title, empresa_alvo, cnpj, content, source_dossier_id, source_operator_id
)
SELECT
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'operator-invalid', 'Linhagem inválida',
  'Empresa Fonte', '12345678000199', '{}'::jsonb,
  (value->>'dossier_id')::uuid, 'operator-b'
FROM runtime_results WHERE key = 'reuse_b_first';

SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
DO $$
DECLARE
  v_error_message text;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reuse_dossier_for_current_operator('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    RAISE EXCEPTION 'FALHA: cadeia cópia para cópia foi aceita';
  EXCEPTION WHEN no_data_found THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    IF v_error_message <> 'invalid dossier lineage' THEN
      RAISE;
    END IF;
  END;
  RESET ROLE;
END $$;

DO $$
DECLARE
  v_b_first jsonb;
  v_b_second jsonb;
  v_b_discovery jsonb;
  v_c_discovery jsonb;
  v_c_from_b jsonb;
  v_c_from_root jsonb;
  v_owner jsonb;
  v_b_copy_id uuid;
  v_c_copy_id uuid;
  v_source_before jsonb;
  v_source_after jsonb;
  v_function_definition text;
  v_hardened_functions integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('find_reusable_dossier', 'reuse_dossier_for_current_operator')
      AND grantee = 'PUBLIC'
      AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FALHA: PUBLIC possui EXECUTE nas RPCs';
  END IF;
  IF has_function_privilege('anon', 'public.find_reusable_dossier(text,text)', 'EXECUTE') OR
     has_function_privilege('anon', 'public.reuse_dossier_for_current_operator(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: anon possui EXECUTE nas RPCs';
  END IF;
  IF has_function_privilege('service_role', 'public.find_reusable_dossier(text,text)', 'EXECUTE') OR
     has_function_privilege('service_role', 'public.reuse_dossier_for_current_operator(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: service_role possui EXECUTE nas RPCs';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.find_reusable_dossier(text,text)', 'EXECUTE') OR
     NOT has_function_privilege('authenticated', 'public.reuse_dossier_for_current_operator(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: authenticated não possui EXECUTE nas RPCs';
  END IF;

  SELECT count(*) INTO v_hardened_functions
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('find_reusable_dossier', 'reuse_dossier_for_current_operator')
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=""'];
  IF v_hardened_functions <> 2 THEN
    RAISE EXCEPTION 'FALHA: RPCs não estão SECURITY DEFINER com search_path vazio';
  END IF;

  IF (SELECT value FROM runtime_results WHERE key = 'direct_rows_b') <> '0'::jsonb THEN
    RAISE EXCEPTION 'FALHA: B leu diretamente o dossiê de A';
  END IF;

  SELECT value INTO v_b_first FROM runtime_results WHERE key = 'reuse_b_first';
  SELECT value INTO v_b_second FROM runtime_results WHERE key = 'reuse_b_second';
  SELECT value INTO v_b_discovery FROM runtime_results WHERE key = 'discovery_b_after';
  SELECT value INTO v_c_discovery FROM runtime_results WHERE key = 'discovery_c_before';
  SELECT value INTO v_c_from_b FROM runtime_results WHERE key = 'reuse_c_from_b';
  SELECT value INTO v_c_from_root FROM runtime_results WHERE key = 'reuse_c_from_root';
  SELECT value INTO v_owner FROM runtime_results WHERE key = 'reuse_a';
  v_b_copy_id := (v_b_first->>'dossier_id')::uuid;
  v_c_copy_id := (v_c_from_b->>'dossier_id')::uuid;

  IF (SELECT value->>'dossier_id' FROM runtime_results WHERE key = 'discovery_b_before') <>
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' THEN
    RAISE EXCEPTION 'FALHA: B não descobriu a raiz antes de possuir cópia';
  END IF;
  IF v_b_discovery->>'dossier_id' <> v_b_copy_id::text OR
     NOT (v_b_discovery->>'is_owner')::boolean THEN
    RAISE EXCEPTION 'FALHA: descoberta de B não priorizou sua própria cópia';
  END IF;
  IF v_c_discovery->>'dossier_id' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR
     (v_c_discovery->>'is_owner')::boolean THEN
    RAISE EXCEPTION 'FALHA: C descobriu cópia alheia em vez da raiz';
  END IF;

  IF v_b_copy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR
     NOT (v_b_first->>'was_cloned')::boolean OR
     v_b_second->>'dossier_id' <> v_b_copy_id::text THEN
    RAISE EXCEPTION 'FALHA: cópia de B não é nova ou idempotente';
  END IF;
  IF v_c_copy_id = v_b_copy_id OR v_c_copy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR
     v_c_from_root->>'dossier_id' <> v_c_copy_id::text THEN
    RAISE EXCEPTION 'FALHA: canonicalização/idempotência da cópia de C falhou';
  END IF;
  IF v_c_from_b->'content'->>'id' <> v_c_copy_id::text THEN
    RAISE EXCEPTION 'FALHA: content.id da cópia de C está inconsistente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dossies
    WHERE id = v_c_copy_id
      AND operator_id = 'operator-c'
      AND source_dossier_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND source_operator_id = 'operator-a'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FALHA: cópia de C não aponta diretamente para a raiz A';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dossies
    WHERE source_dossier_id = v_b_copy_id
      AND operator_id IN ('operator-b', 'operator-c')
  ) THEN
    RAISE EXCEPTION 'FALHA: clone válido usa a cópia de B como fonte';
  END IF;
  IF (SELECT count(*) FROM public.dossies WHERE operator_id = 'operator-b' AND source_dossier_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND deleted_at IS NULL) <> 1 OR
     (SELECT count(*) FROM public.dossies WHERE operator_id = 'operator-c' AND source_dossier_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'FALHA: B ou C possui mais de uma cópia ativa da raiz';
  END IF;

  SELECT snapshot INTO v_source_before FROM source_before;
  SELECT to_jsonb(d) INTO v_source_after FROM public.dossies AS d
   WHERE d.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF v_source_after IS DISTINCT FROM v_source_before THEN
    RAISE EXCEPTION 'FALHA: dossiê fonte A foi alterado';
  END IF;
  IF v_owner->>'dossier_id' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR
     (v_owner->>'was_cloned')::boolean THEN
    RAISE EXCEPTION 'FALHA: A deveria receber o original sem clone';
  END IF;

  SELECT pg_get_functiondef('public.reuse_dossier_for_current_operator(uuid)'::regprocedure)
    INTO v_function_definition;
  IF position('pg_advisory_xact_lock' IN v_function_definition) = 0 OR
     to_regclass('public.idx_dossies_active_source_copy') IS NULL THEN
    RAISE EXCEPTION 'FALHA: barreiras de concorrência ausentes';
  END IF;

  BEGIN
    INSERT INTO public.dossies (
      operator_id, title, empresa_alvo, content, source_dossier_id, source_operator_id
    ) VALUES (
      'operator-b', 'Clone concorrente', 'Empresa Fonte', '{}'::jsonb,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'operator-a'
    );
    RAISE EXCEPTION 'FALHA: índice permitiu segunda cópia ativa de B';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

-- Raiz excluída não pode ser usada para nova reutilização por ID.
UPDATE public.dossies SET deleted_at = now()
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FALHA: raiz excluída foi reutilizada';
  EXCEPTION WHEN no_data_found THEN
    NULL;
  END;
  RESET ROLE;
END $$;

ROLLBACK;

\echo 'PASS: corporate authorization, root lineage and copy-on-access assertions'
