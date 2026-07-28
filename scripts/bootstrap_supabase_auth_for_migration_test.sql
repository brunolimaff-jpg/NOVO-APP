-- =====================================================================
-- Bootstrap local de teste para ambiente PostgreSQL descartável
-- NÃO ALOCAR EM supabase/migrations/ (Apenas para testes locais)
-- =====================================================================

-- Roles Supabase padrão
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- Schema Auth de desenvolvimento/teste
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID,
  email TEXT,
  encrypted_password TEXT,
  email_confirmed_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ,
  confirmation_token TEXT,
  confirmation_sent_at TIMESTAMPTZ,
  recovery_token TEXT,
  recovery_sent_at TIMESTAMPTZ,
  email_change_token_new TEXT,
  email_change TEXT,
  email_change_sent_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  raw_app_meta_data JSONB,
  raw_user_meta_data JSONB,
  is_super_admin BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  phone TEXT,
  phone_confirmed_at TIMESTAMPTZ,
  phone_change TEXT,
  phone_change_token TEXT,
  phone_change_sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  email_change_token_current TEXT,
  email_change_confirm_status SMALLINT,
  banned_until TIMESTAMPTZ,
  reauthentication_token TEXT,
  reauthentication_sent_at TIMESTAMPTZ,
  is_sso_user BOOLEAN DEFAULT false NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid;
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON TABLE auth.users TO service_role;
