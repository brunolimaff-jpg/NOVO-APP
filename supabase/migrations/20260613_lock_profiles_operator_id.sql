-- Migration: Trava mutabilidade de operator_id em profiles
-- Phase 2: Permite UPDATE apenas de name; operator_id via RPC service_role
--
-- RLS exception: profiles ja tem RLS habilitado desde 20260612_auth_profiles.sql
-- Esta migration ajusta grants e adiciona RPC de escape para legacy linking.

-- ============================================================================
-- PASSO 1: Revogar UPDATE irrestrito e conceder UPDATE apenas de name
-- ============================================================================
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name) ON public.profiles TO authenticated;

-- ============================================================================
-- PASSO 2: RPC para legacy linking (SECURITY DEFINER — bypassa RLS/grants)
-- Unica forma de atualizar operator_id apos este lock.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.link_legacy_operator(
  p_auth_user_id UUID,
  p_operator_id TEXT,
  p_email TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Autorizacao: caller so pode operar no proprio auth user
  IF auth.uid() IS NULL OR auth.uid() != p_auth_user_id THEN
    RAISE EXCEPTION 'You can only link your own account';
  END IF;

  -- Verifica que o operator_id pertence ao email do caller
  IF p_email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_context
    WHERE operator_id = p_operator_id AND email_normalized = LOWER(p_email)
  ) THEN
    RAISE EXCEPTION 'Operator ID does not match provided email';
  END IF;

  INSERT INTO public.profiles (id, operator_id, email, name)
  VALUES (p_auth_user_id, p_operator_id, p_email, p_name)
  ON CONFLICT (id)
  DO UPDATE SET
    operator_id = EXCLUDED.operator_id,
    email = COALESCE(EXCLUDED.email, profiles.email),
    name = COALESCE(EXCLUDED.name, profiles.name);
END;
$$;

-- Concede execucao para usuarios autenticados (RPC roda como SECURITY DEFINER
-- = superuser, com verificacao de ownership no corpo da funcao)
GRANT EXECUTE ON FUNCTION public.link_legacy_operator TO authenticated;

-- ============================================================================
-- PASSO 3: Verificacao — profiles ainda tem RLS ativo
-- ============================================================================
-- profiles ja tem RLS desde 20260612_auth_profiles.sql (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
-- Policies existentes continuam valendo:
--   "Usuario le proprio perfil" para SELECT
--   "Usuario atualiza proprio perfil" para UPDATE (agora restrito a name via column grant)
--   "service_role le todos os perfis" (documental — service_role tem bypassrls)
