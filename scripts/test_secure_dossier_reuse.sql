-- Teste PostgreSQL versionado para copy-on-access entre operadores.
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

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  operator_id text NOT NULL UNIQUE,
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

INSERT INTO public.profiles (id, operator_id, email, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'operator-a', 'a@example.test', 'Operador A'),
  ('22222222-2222-4222-8222-222222222222', 'operator-b', 'b@example.test', 'Operador B');

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

-- Operador B não lê content diretamente com RLS owner-only.
SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
INSERT INTO runtime_results VALUES (
  'direct_rows_b',
  to_jsonb((SELECT count(*) FROM public.dossies WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
);

-- Descoberta retorna somente a assinatura mínima, sem content.
INSERT INTO runtime_results
SELECT 'discovery_b', to_jsonb(r)
FROM public.find_reusable_dossier('12.345.678/0001-99', 'Nome ignorado') AS r;

INSERT INTO runtime_results
SELECT 'reuse_b_first', to_jsonb(r)
FROM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS r;

INSERT INTO runtime_results
SELECT 'reuse_b_second', to_jsonb(r)
FROM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS r;
RESET ROLE;

-- O proprietário recebe o próprio registro, sem clone.
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SET LOCAL ROLE authenticated;
INSERT INTO runtime_results
SELECT 'reuse_a', to_jsonb(r)
FROM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS r;
RESET ROLE;

DO $$
DECLARE
  v_discovery jsonb;
  v_first jsonb;
  v_second jsonb;
  v_owner jsonb;
  v_copy_id uuid;
  v_source_after jsonb;
  v_source_before jsonb;
  v_copy_count integer;
  v_access_count integer;
  v_function_definition text;
  v_hardened_functions integer;
BEGIN
  IF has_function_privilege('anon', 'public.find_reusable_dossier(text,text)', 'EXECUTE') OR
     has_function_privilege('anon', 'public.reuse_dossier_for_current_operator(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: anon possui EXECUTE nas RPCs';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.find_reusable_dossier(text,text)', 'EXECUTE') OR
     NOT has_function_privilege('authenticated', 'public.reuse_dossier_for_current_operator(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: authenticated não possui EXECUTE nas RPCs';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.find_reusable_dossier(text,text)', 'EXECUTE') OR
     NOT has_function_privilege('service_role', 'public.reuse_dossier_for_current_operator(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: service_role não possui EXECUTE nas RPCs';
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
    RAISE EXCEPTION 'FALHA: operador B leu diretamente o dossiê de A';
  END IF;

  SELECT value INTO v_discovery FROM runtime_results WHERE key = 'discovery_b';
  IF v_discovery->>'dossier_id' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR
     (v_discovery->>'is_owner')::boolean OR v_discovery ? 'content' THEN
    RAISE EXCEPTION 'FALHA: descoberta não retornou somente metadados seguros: %', v_discovery;
  END IF;

  SELECT value INTO v_first FROM runtime_results WHERE key = 'reuse_b_first';
  SELECT value INTO v_second FROM runtime_results WHERE key = 'reuse_b_second';
  SELECT value INTO v_owner FROM runtime_results WHERE key = 'reuse_a';
  v_copy_id := (v_first->>'dossier_id')::uuid;

  IF v_copy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR NOT (v_first->>'was_cloned')::boolean THEN
    RAISE EXCEPTION 'FALHA: operador B não recebeu clone com novo UUID';
  END IF;
  IF v_first->'content'->>'id' <> v_copy_id::text THEN
    RAISE EXCEPTION 'FALHA: content.id não foi reescrito para o UUID da cópia';
  END IF;
  IF v_second->>'dossier_id' <> v_copy_id::text THEN
    RAISE EXCEPTION 'FALHA: segundo acesso não reutilizou a mesma cópia ativa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dossies
    WHERE id = v_copy_id
      AND operator_id = 'operator-b'
      AND source_dossier_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND source_operator_id = 'operator-a'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FALHA: proveniência ou ownership da cópia está incorreto';
  END IF;

  SELECT snapshot INTO v_source_before FROM source_before;
  SELECT to_jsonb(d) INTO v_source_after FROM public.dossies AS d
   WHERE d.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF v_source_after IS DISTINCT FROM v_source_before THEN
    RAISE EXCEPTION 'FALHA: dossiê fonte foi alterado';
  END IF;

  IF v_owner->>'dossier_id' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR
     (v_owner->>'was_cloned')::boolean THEN
    RAISE EXCEPTION 'FALHA: proprietário deveria receber o original sem clone';
  END IF;

  SELECT count(*) INTO v_copy_count FROM public.dossies
   WHERE operator_id = 'operator-b'
     AND source_dossier_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     AND deleted_at IS NULL;
  IF v_copy_count <> 1 THEN
    RAISE EXCEPTION 'FALHA: esperado um único clone ativo, encontrados %', v_copy_count;
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
    RAISE EXCEPTION 'FALHA: índice permitiu segunda cópia ativa concorrente';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  SELECT count(*) INTO v_access_count FROM public.dossier_accesses
   WHERE operator_id = 'operator-b' AND dossier_id = v_copy_id;
  IF v_access_count <> 2 THEN
    RAISE EXCEPTION 'FALHA: acessos de B não foram registrados, total %', v_access_count;
  END IF;
END $$;

-- Dossiê excluído não pode ser encontrado nem reutilizado.
UPDATE public.dossies
SET deleted_at = now()
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FALHA: dossiê excluído foi reutilizado';
  EXCEPTION WHEN no_data_found THEN
    NULL;
  END;
  RESET ROLE;
END $$;

ROLLBACK;

\echo 'PASS: secure cross-operator dossier reuse runtime assertions'
