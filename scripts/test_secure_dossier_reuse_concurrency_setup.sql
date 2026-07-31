-- Fixture committed for the two-session concurrency check.
-- Execute only in the disposable database novoapp_dossier_reuse_concurrency_test.

DO $$
BEGIN
  IF current_database() <> 'novoapp_dossier_reuse_concurrency_test' THEN
    RAISE EXCEPTION 'FALHA: banco incorreto para o teste de concorrência';
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
  email text NOT NULL,
  email_confirmed_at timestamptz
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  operator_id text UNIQUE NOT NULL,
  email text NOT NULL
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
  source_dossier_id uuid,
  source_operator_id text,
  reused_at timestamptz,
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
  USING (operator_id = (SELECT p.operator_id FROM public.profiles AS p WHERE p.id = auth.uid()));

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.dossies TO authenticated;
GRANT SELECT, INSERT ON public.dossier_accesses TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;

\i supabase/migrations/20260730193000_secure_cross_operator_dossier_reuse.sql

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'a@senior.com.br', now()),
  ('22222222-2222-4222-8222-222222222222', 'b@senior.com.br', now());

INSERT INTO public.profiles (id, operator_id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'operator-a', 'a@senior.com.br'),
  ('22222222-2222-4222-8222-222222222222', 'operator-b', 'b@senior.com.br');

INSERT INTO public.dossies (
  id, operator_id, operator_email, title, empresa_alvo, cnpj, modo_principal,
  score_oportunidade, resumo_dossie, content
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'operator-a',
  'a@senior.com.br',
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
    'messages', jsonb_build_array(jsonb_build_object(
      'id', 'source-report-1',
      'sender', 'bot',
      'text', 'RELATORIO_CANONICO_CONCORRENCIA',
      'timestamp', '2026-07-01T10:05:00.000Z',
      'scorePorta', jsonb_build_object('score', 81)
    ))
  )
);
