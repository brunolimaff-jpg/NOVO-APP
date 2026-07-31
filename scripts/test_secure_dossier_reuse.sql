-- Teste PostgreSQL versionado para autorização, privacidade e copy-on-access.
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

-- Raiz A: conversa privada completa, exatamente um relatório canônico.
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
  jsonb_build_object(
    'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'title', 'Dossiê Fonte',
    'empresaAlvo', 'Empresa Fonte',
    'cnpj', '12345678000199',
    'modoPrincipal', 'default',
    'scoreOportunidade', 81,
    'resumoDossie', 'Resumo original',
    'createdAt', '2026-07-01T10:00:00.000Z',
    'updatedAt', '2026-07-01T10:00:00.000Z',
    'companyContext', jsonb_build_object('private', 'COMPANY_CONTEXT_PRIVADO'),
    'unknownSessionKey', 'NAO_COPIAR_SESSAO',
    'messages', jsonb_build_array(
      jsonb_build_object(
        'id', 'source-user-1', 'sender', 'user', 'text', 'Pedido inicial privado',
        'timestamp', '2026-07-01T10:00:00.000Z'
      ),
      jsonb_build_object(
        'id', 'source-report-1',
        'sender', 'bot',
        'text', 'RELATORIO_CANONICO_SENTINELA: análise comercial completa e segura.',
        'timestamp', '2026-07-01T10:05:00.000Z',
        'scorePorta', jsonb_build_object('score', 81, 'dimensions', jsonb_build_array('P', 'O', 'R', 'T', 'A')),
        'groundingSources', jsonb_build_array(jsonb_build_object('url', 'https://example.com/fonte')),
        'statuses', jsonb_build_object('fiscal', 'ok'),
        'suggestions', jsonb_build_array('Próximo passo'),
        'clienteSeniorData', jsonb_build_object('isCliente', false),
        'groundingUsed', true,
        'webVerificationStatus', 'verified',
        'feedback', jsonb_build_object('private', 'FEEDBACK_PRIVADO'),
        'sectionFeedback', jsonb_build_object('private', 'SECTION_FEEDBACK_PRIVADO'),
        'errorDetails', 'ERROR_DETAILS_PRIVADO',
        'isSourcesOpen', true,
        'unknownReportKey', 'NAO_COPIAR_RELATORIO'
      ),
      jsonb_build_object(
        'id', 'source-user-private', 'sender', 'user',
        'text', 'PERGUNTA_PRIVADA_SENTINELA', 'timestamp', '2026-07-01T10:06:00.000Z'
      ),
      jsonb_build_object(
        'id', 'source-bot-followup', 'sender', 'bot',
        'text', 'RESPOSTA_POSTERIOR_SENTINELA', 'timestamp', '2026-07-01T10:07:00.000Z'
      )
    )
  ),
  '2026-07-01T10:00:00Z',
  '2026-07-01T10:00:00Z'
);

-- Raízes estrangeiras sem marcador e ambígua; registro próprio incompleto de B.
INSERT INTO public.dossies (id, operator_id, title, empresa_alvo, cnpj, content, created_at) VALUES
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'operator-a', 'Sem marcador', 'Empresa Sem Marcador',
    '11111111000111',
    '{"id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","messages":[{"id":"e1","sender":"bot","text":"Relatório sem scorePorta"}]}'::jsonb,
    '2026-07-02T10:00:00Z'
  ),
  (
    'ffffffff-ffff-4fff-8fff-ffffffffffff', 'operator-a', 'Ambígua', 'Empresa Ambígua',
    '22222222000122',
    '{"id":"ffffffff-ffff-4fff-8fff-ffffffffffff","messages":[{"id":"f1","sender":"bot","text":"Primeiro","scorePorta":{}},{"id":"f2","sender":"bot","text":"Segundo","scorePorta":{}}]}'::jsonb,
    '2026-07-03T10:00:00Z'
  ),
  (
    'bbbbbbbb-0000-4000-8000-000000000000', 'operator-b', 'Meu incompleto', 'Empresa Própria Incompleta',
    '33333333000133',
    '{"id":"bbbbbbbb-0000-4000-8000-000000000000","privateOwnerContent":"CONTEUDO_COMPLETO_DO_PROPRIETARIO","messages":[]}'::jsonb,
    '2026-07-04T10:00:00Z'
  );

CREATE TEMP TABLE source_before AS
SELECT to_jsonb(d) AS snapshot
FROM public.dossies AS d
WHERE d.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

CREATE TEMP TABLE runtime_results (key text, value jsonb);
GRANT ALL ON runtime_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.assert_runtime_captures()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_key text;
  v_count integer;
  v_nonnull integer;
BEGIN
  FOREACH v_key IN ARRAY ARRAY[
    'direct_rows_b',
    'discovery_b_before',
    'reuse_b_first',
    'reuse_b_second',
    'discovery_b_after',
    'discovery_c_before',
    'reuse_c_from_b',
    'reuse_c_from_root',
    'reuse_a'
  ] LOOP
    SELECT count(*), count(value)
      INTO v_count, v_nonnull
      FROM runtime_results
     WHERE key = v_key;
    IF v_count <> 1 OR v_nonnull <> 1 THEN
      RAISE EXCEPTION 'capture inválida: % (rows=%, nonnull=%)', v_key, v_count, v_nonnull;
    END IF;
  END LOOP;
END;
$$;

-- B não lê conteúdo de A diretamente, descobre a raiz e cria snapshot próprio.
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
INSERT INTO runtime_results
SELECT 'owner_incomplete_discovery', to_jsonb(r)
FROM public.find_reusable_dossier('33333333000133', 'Nome ignorado') AS r;
INSERT INTO runtime_results
SELECT 'owner_incomplete_reuse', to_jsonb(r)
FROM public.reuse_dossier_for_current_operator('bbbbbbbb-0000-4000-8000-000000000000') AS r;
INSERT INTO runtime_results VALUES (
  'unmarked_discovery_count',
  to_jsonb((SELECT count(*) FROM public.find_reusable_dossier('11111111000111', 'Empresa Sem Marcador')))
);
INSERT INTO runtime_results VALUES (
  'ambiguous_discovery_count',
  to_jsonb((SELECT count(*) FROM public.find_reusable_dossier('22222222000122', 'Empresa Ambígua')))
);
RESET ROLE;

-- C descobre apenas a raiz e canonicaliza até quando recebe o ID da cópia de B.
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

-- A abre seu próprio conteúdo completo, sem exigir marcador nem clone.
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SET LOCAL ROLE authenticated;
INSERT INTO runtime_results
SELECT 'reuse_a', to_jsonb(r)
FROM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS r;
RESET ROLE;

-- Guarda positiva e negativa das nove capturas obrigatórias.
SELECT pg_temp.assert_runtime_captures();
DO $$
DECLARE
  v_guard_failed boolean := false;
BEGIN
  BEGIN
    DELETE FROM runtime_results WHERE key = 'reuse_a';
    PERFORM pg_temp.assert_runtime_captures();
  EXCEPTION WHEN OTHERS THEN
    v_guard_failed := true;
  END;
  IF NOT v_guard_failed THEN
    RAISE EXCEPTION 'FALHA: guarda aceitou captura ausente';
  END IF;
  PERFORM pg_temp.assert_runtime_captures();
END $$;

-- Bloqueios corporativos: handler captura só o erro da RPC; bypass falha fora dele.
DO $$
DECLARE
  v_user_id uuid;
  v_error_code text;
  v_error_message text;
  v_returned boolean;
BEGIN
  FOREACH v_user_id IN ARRAY ARRAY[
    '44444444-4444-4444-8444-444444444444'::uuid,
    '55555555-5555-4555-8555-555555555555'::uuid,
    '66666666-6666-4666-8666-666666666666'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    v_returned := false;
    BEGIN
      PERFORM public.find_reusable_dossier('12.345.678/0001-99', 'Empresa Fonte');
      v_returned := true;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_message = MESSAGE_TEXT;
      IF v_error_code <> '42501' OR v_error_message <> 'access denied' THEN
        RAISE EXCEPTION 'FALHA: descoberta revelou condição interna: state=%, msg=%', v_error_code, v_error_message;
      END IF;
    END;
    IF v_returned THEN
      RAISE EXCEPTION 'FALHA: usuário não corporativo executou descoberta';
    END IF;

    v_returned := false;
    BEGIN
      PERFORM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      v_returned := true;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_message = MESSAGE_TEXT;
      IF v_error_code <> '42501' OR v_error_message <> 'access denied' THEN
        RAISE EXCEPTION 'FALHA: reutilização revelou condição interna: state=%, msg=%', v_error_code, v_error_message;
      END IF;
    END;
    IF v_returned THEN
      RAISE EXCEPTION 'FALHA: usuário não corporativo executou reutilização';
    END IF;

    RESET ROLE;
  END LOOP;
END $$;

-- Chamadas diretas de raízes estrangeiras sem marcador inequívoco são recusadas.
SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
DO $$
DECLARE
  v_source_id uuid;
  v_error_code text;
  v_error_message text;
  v_returned boolean;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOREACH v_source_id IN ARRAY ARRAY[
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid
  ] LOOP
    v_returned := false;
    BEGIN
      PERFORM public.reuse_dossier_for_current_operator(v_source_id);
      v_returned := true;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_message = MESSAGE_TEXT;
      IF v_error_code <> 'P0002' OR v_error_message <> 'dossier unavailable' THEN
        RAISE EXCEPTION 'FALHA: raiz não compartilhável revelou detalhe: state=%, msg=%', v_error_code, v_error_message;
      END IF;
    END;
    IF v_returned THEN
      RAISE EXCEPTION 'FALHA: raiz não compartilhável foi reutilizada: %', v_source_id;
    END IF;
  END LOOP;
  RESET ROLE;
END $$;

-- Fixture inválida: cópia apontando para a cópia de B.
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
  v_error_code text;
  v_error_message text;
  v_returned boolean := false;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reuse_dossier_for_current_operator('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    v_returned := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_message = MESSAGE_TEXT;
    IF v_error_code <> 'P0002' OR v_error_message <> 'invalid dossier lineage' THEN
      RAISE;
    END IF;
  END;
  IF v_returned THEN
    RAISE EXCEPTION 'FALHA: cadeia cópia para cópia foi aceita';
  END IF;
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
  v_owner_incomplete jsonb;
  v_b_copy_id uuid;
  v_c_copy_id uuid;
  v_b_content jsonb;
  v_c_content jsonb;
  v_source_content jsonb;
  v_source_report jsonb;
  v_b_report jsonb;
  v_source_before jsonb;
  v_source_after jsonb;
  v_function_definition text;
  v_hardened_functions integer;
  v_session_keys text[];
  v_user_message_keys text[];
  v_report_message_keys text[];
BEGIN
  PERFORM pg_temp.assert_runtime_captures();

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

  IF (SELECT value FROM runtime_results WHERE key = 'direct_rows_b') IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION 'FALHA: B leu diretamente o dossiê de A';
  END IF;
  IF (SELECT value FROM runtime_results WHERE key = 'unmarked_discovery_count') IS DISTINCT FROM '0'::jsonb OR
     (SELECT value FROM runtime_results WHERE key = 'ambiguous_discovery_count') IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION 'FALHA: descoberta revelou raiz estrangeira não compartilhável';
  END IF;

  SELECT value INTO STRICT v_b_first FROM runtime_results WHERE key = 'reuse_b_first';
  SELECT value INTO STRICT v_b_second FROM runtime_results WHERE key = 'reuse_b_second';
  SELECT value INTO STRICT v_b_discovery FROM runtime_results WHERE key = 'discovery_b_after';
  SELECT value INTO STRICT v_c_discovery FROM runtime_results WHERE key = 'discovery_c_before';
  SELECT value INTO STRICT v_c_from_b FROM runtime_results WHERE key = 'reuse_c_from_b';
  SELECT value INTO STRICT v_c_from_root FROM runtime_results WHERE key = 'reuse_c_from_root';
  SELECT value INTO STRICT v_owner FROM runtime_results WHERE key = 'reuse_a';
  SELECT value INTO STRICT v_owner_incomplete FROM runtime_results WHERE key = 'owner_incomplete_reuse';
  v_b_copy_id := (v_b_first->>'dossier_id')::uuid;
  v_c_copy_id := (v_c_from_b->>'dossier_id')::uuid;
  v_b_content := v_b_first->'content';
  v_c_content := v_c_from_b->'content';

  IF (SELECT value->>'dossier_id' FROM runtime_results WHERE key = 'discovery_b_before')
       IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' THEN
    RAISE EXCEPTION 'FALHA: B não descobriu a raiz compartilhável';
  END IF;
  IF v_b_discovery->>'dossier_id' IS DISTINCT FROM v_b_copy_id::text OR
     (v_b_discovery->>'is_owner')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHA: descoberta de B não priorizou sua cópia';
  END IF;
  IF v_c_discovery->>'dossier_id' IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR
     (v_c_discovery->>'is_owner')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHA: C descobriu cópia alheia em vez da raiz';
  END IF;
  IF (SELECT value->>'dossier_id' FROM runtime_results WHERE key = 'owner_incomplete_discovery')
       IS DISTINCT FROM 'bbbbbbbb-0000-4000-8000-000000000000' OR
     (SELECT (value->>'is_owner')::boolean FROM runtime_results WHERE key = 'owner_incomplete_discovery')
       IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHA: registro próprio incompleto deixou de ser elegível';
  END IF;
  IF v_owner_incomplete->'content'->>'privateOwnerContent'
       IS DISTINCT FROM 'CONTEUDO_COMPLETO_DO_PROPRIETARIO' OR
     (v_owner_incomplete->>'was_cloned')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHA: proprietário não recebeu conteúdo próprio completo';
  END IF;

  IF v_b_copy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR
     (v_b_first->>'was_cloned')::boolean IS DISTINCT FROM true OR
     v_b_second->>'dossier_id' IS DISTINCT FROM v_b_copy_id::text THEN
    RAISE EXCEPTION 'FALHA: snapshot de B não é novo ou idempotente';
  END IF;
  IF v_c_copy_id = v_b_copy_id OR v_c_copy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR
     v_c_from_root->>'dossier_id' IS DISTINCT FROM v_c_copy_id::text THEN
    RAISE EXCEPTION 'FALHA: canonicalização/idempotência da cópia de C falhou';
  END IF;

  IF jsonb_array_length(v_b_content->'messages') IS DISTINCT FROM 2 OR
     jsonb_array_length(v_c_content->'messages') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHA: snapshot não contém exatamente duas mensagens';
  END IF;
  IF v_b_content->'messages'->0->>'sender' IS DISTINCT FROM 'user' OR
     v_b_content->'messages'->0->>'text' IS DISTINCT FROM '🔍 Investigando Empresa Fonte...' OR
     v_b_content->'messages'->1->>'sender' IS DISTINCT FROM 'bot' OR
     v_b_content->'messages'->1->>'text'
       IS DISTINCT FROM 'RELATORIO_CANONICO_SENTINELA: análise comercial completa e segura.' THEN
    RAISE EXCEPTION 'FALHA: mensagens sintética/canônica incorretas';
  END IF;

  SELECT array_agg(key ORDER BY key) INTO v_session_keys FROM jsonb_object_keys(v_b_content) AS key;
  IF v_session_keys IS DISTINCT FROM ARRAY[
    'cnpj', 'createdAt', 'empresaAlvo', 'id', 'messages', 'modoPrincipal',
    'resumoDossie', 'scoreOportunidade', 'title', 'updatedAt'
  ]::text[] THEN
    RAISE EXCEPTION 'FALHA: allowlist da sessão divergente: %', v_session_keys;
  END IF;
  SELECT array_agg(key ORDER BY key) INTO v_user_message_keys
    FROM jsonb_object_keys(v_b_content->'messages'->0) AS key;
  IF v_user_message_keys IS DISTINCT FROM ARRAY['id', 'sender', 'text', 'timestamp']::text[] THEN
    RAISE EXCEPTION 'FALHA: allowlist da mensagem sintética divergente: %', v_user_message_keys;
  END IF;
  SELECT array_agg(key ORDER BY key) INTO v_report_message_keys
    FROM jsonb_object_keys(v_b_content->'messages'->1) AS key;
  IF v_report_message_keys IS DISTINCT FROM ARRAY[
    'clienteSeniorData', 'groundingSources', 'groundingUsed', 'id', 'scorePorta',
    'sender', 'statuses', 'suggestions', 'text', 'timestamp', 'webVerificationStatus'
  ]::text[] THEN
    RAISE EXCEPTION 'FALHA: allowlist do relatório divergente: %', v_report_message_keys;
  END IF;

  SELECT d.content INTO v_source_content
  FROM public.dossies AS d WHERE d.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  SELECT message INTO v_source_report
  FROM jsonb_array_elements(v_source_content->'messages') AS message
  WHERE message->>'id' = 'source-report-1';
  v_b_report := v_b_content->'messages'->1;

  IF v_b_content->'messages'->0->>'id' IN ('source-user-1', 'source-report-1', 'source-user-private', 'source-bot-followup') OR
     v_b_report->>'id' IN ('source-user-1', 'source-report-1', 'source-user-private', 'source-bot-followup') OR
     v_b_content->'messages'->0->>'id' = v_b_report->>'id' THEN
    RAISE EXCEPTION 'FALHA: IDs das mensagens não são novos e distintos';
  END IF;
  IF v_b_content->'messages'->0->>'timestamp' IS DISTINCT FROM v_b_content->>'createdAt' OR
     v_b_report->>'timestamp' IS DISTINCT FROM v_b_content->>'createdAt' OR
     v_b_report->>'timestamp' = v_source_report->>'timestamp' THEN
    RAISE EXCEPTION 'FALHA: timestamps novos/internamente consistentes não foram usados';
  END IF;
  IF v_b_content->>'id' IS DISTINCT FROM v_b_copy_id::text OR
     v_c_content->>'id' IS DISTINCT FROM v_c_copy_id::text THEN
    RAISE EXCEPTION 'FALHA: content.id não corresponde ao ID da cópia';
  END IF;

  IF v_b_content::text LIKE '%PERGUNTA_PRIVADA_SENTINELA%' OR
     v_b_content::text LIKE '%RESPOSTA_POSTERIOR_SENTINELA%' OR
     v_b_content::text LIKE '%FEEDBACK_PRIVADO%' OR
     v_b_content::text LIKE '%SECTION_FEEDBACK_PRIVADO%' OR
     v_b_content::text LIKE '%ERROR_DETAILS_PRIVADO%' OR
     v_b_content::text LIKE '%COMPANY_CONTEXT_PRIVADO%' OR
     v_b_content::text LIKE '%NAO_COPIAR_%' THEN
    RAISE EXCEPTION 'FALHA: conteúdo privado/desconhecido vazou para o snapshot';
  END IF;

  IF v_b_report->'groundingSources' IS DISTINCT FROM v_source_report->'groundingSources' OR
     v_b_report->'scorePorta' IS DISTINCT FROM v_source_report->'scorePorta' OR
     v_b_report->'statuses' IS DISTINCT FROM v_source_report->'statuses' OR
     v_b_report->'suggestions' IS DISTINCT FROM v_source_report->'suggestions' OR
     v_b_report->'clienteSeniorData' IS DISTINCT FROM v_source_report->'clienteSeniorData' OR
     v_b_report->'groundingUsed' IS DISTINCT FROM v_source_report->'groundingUsed' OR
     v_b_report->'webVerificationStatus' IS DISTINCT FROM v_source_report->'webVerificationStatus' THEN
    RAISE EXCEPTION 'FALHA: campos comerciais aprovados não foram preservados';
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
    RAISE EXCEPTION 'FALHA: clone válido usa cópia de B como fonte';
  END IF;
  IF (SELECT count(*) FROM public.dossies WHERE operator_id = 'operator-b' AND source_dossier_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND deleted_at IS NULL) <> 1 OR
     (SELECT count(*) FROM public.dossies WHERE operator_id = 'operator-c' AND source_dossier_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'FALHA: B ou C possui mais de uma cópia ativa da raiz';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dossier_accesses
    WHERE operator_id = 'operator-b' AND dossier_id = v_b_copy_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.dossier_accesses
    WHERE operator_id = 'operator-c' AND dossier_id = v_c_copy_id
  ) THEN
    RAISE EXCEPTION 'FALHA: dossier_accesses não registrou a cópia efetivamente retornada';
  END IF;

  SELECT snapshot INTO v_source_before FROM source_before;
  SELECT to_jsonb(d) INTO v_source_after FROM public.dossies AS d
   WHERE d.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF v_source_after IS DISTINCT FROM v_source_before THEN
    RAISE EXCEPTION 'FALHA: dossiê fonte A foi alterado';
  END IF;
  IF v_owner->>'dossier_id' IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR
     (v_owner->>'was_cloned')::boolean IS DISTINCT FROM false OR
     v_owner->'content' IS DISTINCT FROM v_source_content THEN
    RAISE EXCEPTION 'FALHA: A deveria receber o original completo sem clone';
  END IF;

  SELECT pg_get_functiondef('public.reuse_dossier_for_current_operator(uuid)'::regprocedure)
    INTO v_function_definition;
  IF position('pg_advisory_xact_lock' IN v_function_definition) = 0 OR
     position('ON CONFLICT (operator_id, source_dossier_id)' IN v_function_definition) = 0 OR
     position('deleted_at IS NULL' IN v_function_definition) = 0 OR
     position('DO NOTHING' IN v_function_definition) = 0 OR
     to_regclass('public.idx_dossies_active_source_copy') IS NULL THEN
    RAISE EXCEPTION 'FALHA: barreiras ou conflito parcial direcionado ausentes';
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

-- Outra constraint UNIQUE deve propagar; o ON CONFLICT parcial não pode mascará-la.
ALTER TABLE public.dossies ADD CONSTRAINT test_operator_title_unique UNIQUE (operator_id, title);
INSERT INTO public.dossies (id, operator_id, title, empresa_alvo, cnpj, content) VALUES
  (
    '99999999-0000-4000-8000-000000000001', 'operator-b', 'Título de conflito',
    'Registro bloqueador', '44444444000144', '{"id":"99999999-0000-4000-8000-000000000001","messages":[]}'::jsonb
  ),
  (
    '99999999-0000-4000-8000-000000000002', 'operator-a', 'Título de conflito',
    'Raiz de conflito', '55555555000155',
    '{"id":"99999999-0000-4000-8000-000000000002","messages":[{"id":"conflict-report","sender":"bot","text":"Relatório conflito","scorePorta":{}}]}'::jsonb
  );

SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
DO $$
DECLARE
  v_unique_propagated boolean := false;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reuse_dossier_for_current_operator('99999999-0000-4000-8000-000000000002');
  EXCEPTION WHEN unique_violation THEN
    v_unique_propagated := true;
  END;
  IF NOT v_unique_propagated THEN
    RAISE EXCEPTION 'FALHA: outra constraint UNIQUE foi mascarada';
  END IF;
  RESET ROLE;
END $$;

ROLLBACK;

\echo 'PASS: privacy snapshot, fail-closed sharing, corporate authorization and root lineage'
\echo 'CONCURRENCY_PROOF_LEVEL: ADVISORY_LOCK + UNIQUE_PARTIAL_INDEX + TARGETED_ON_CONFLICT'
