-- Migration: Tabela profiles — vincula auth.uid ao operator_id do Scout 360
-- Sprint 1/4: Infraestrutura de autenticacao Supabase Auth

-- Tabela que mapeia usuario autenticado (Supabase Auth) ao operador do Scout 360
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_id TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: cria perfil automaticamente ao cadastrar no Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  new_operator_id TEXT;
BEGIN
  new_operator_id := 'op_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.profiles (id, operator_id, email, name)
  VALUES (NEW.id, new_operator_id, NEW.email, NEW.raw_user_meta_data->>'name');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS: ativar
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Grants para Data API
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- Politica: usuario le o proprio perfil
CREATE POLICY "Usuario le proprio perfil"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

-- Politica: usuario atualiza o proprio perfil
CREATE POLICY "Usuario atualiza proprio perfil"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Politica: service_role le todos os perfis (funcoes serverless)
-- NOTA: service_role tem bypassrls por padrao — esta policy e documental
CREATE POLICY "service_role le todos os perfis"
  ON public.profiles FOR SELECT
  TO service_role
  USING (true);
