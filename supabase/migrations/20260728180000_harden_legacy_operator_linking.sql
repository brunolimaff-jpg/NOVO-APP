-- Migration: Hardening da função link_legacy_operator (menor privilégio e verificação estrita de identidade)
-- Timestamp: 20260728180000

CREATE OR REPLACE FUNCTION public.link_legacy_operator(
  p_auth_user_id UUID,
  p_operator_id TEXT,
  p_email TEXT DEFAULT NULL::TEXT,
  p_name TEXT DEFAULT NULL::TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_email TEXT;
BEGIN
  -- 1. Ownership & Autenticacao: auth.uid() deve existir e ser igual a p_auth_user_id
  IF auth.uid() IS NULL OR auth.uid() != p_auth_user_id THEN
    RAISE EXCEPTION 'You can only link your own account';
  END IF;

  -- 2. p_email obrigatorio e nao vazio
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'Email is required to link legacy operator';
  END IF;

  -- 3. Valida e-mail do perfil autenticado
  SELECT email INTO caller_email
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_email IS NULL OR LOWER(caller_email) != LOWER(p_email) THEN
    RAISE EXCEPTION 'Email does not match authenticated profile';
  END IF;

  -- 4. Valida se p_operator_id pertence ao mesmo e-mail em user_context
  IF NOT EXISTS (
    SELECT 1 FROM public.user_context
    WHERE operator_id = p_operator_id AND email_normalized = LOWER(caller_email)
  ) THEN
    RAISE EXCEPTION 'Operator ID does not match authenticated email';
  END IF;

  -- 5. Upsert no perfil com operator_id
  INSERT INTO public.profiles (id, operator_id, email, name)
  VALUES (p_auth_user_id, p_operator_id, caller_email, p_name)
  ON CONFLICT (id)
  DO UPDATE SET
    operator_id = EXCLUDED.operator_id,
    email = COALESCE(EXCLUDED.email, profiles.email),
    name = COALESCE(EXCLUDED.name, profiles.name);
END;
$$;

-- ACL Estrita (Least Privilege)
REVOKE ALL ON FUNCTION public.link_legacy_operator(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_legacy_operator(UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.link_legacy_operator(UUID, TEXT, TEXT, TEXT) FROM service_role;
REVOKE ALL ON FUNCTION public.link_legacy_operator(UUID, TEXT, TEXT, TEXT) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.link_legacy_operator(UUID, TEXT, TEXT, TEXT) TO authenticated;
