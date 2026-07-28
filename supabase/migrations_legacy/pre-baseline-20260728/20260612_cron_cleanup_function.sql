-- Funcao RPC para o cron de limpeza de contas nao confirmadas
-- Usada por api/cron-email-confirmation.ts

CREATE OR REPLACE FUNCTION public.get_expired_unconfirmed_users(
  older_than TIMESTAMPTZ,
  max_results INT DEFAULT 50
)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id
  FROM auth.users u
  WHERE u.created_at < older_than
    AND u.last_sign_in_at IS NULL
    AND u.deleted_at IS NULL
  LIMIT max_results;
END;
$$;

-- Revoga execucao publica — apenas service_role pode chamar
REVOKE EXECUTE ON FUNCTION public.get_expired_unconfirmed_users FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_expired_unconfirmed_users FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_expired_unconfirmed_users FROM anon;

-- Concede execucao para service_role (usada pelo cron Vercel com service_role key)
GRANT EXECUTE ON FUNCTION public.get_expired_unconfirmed_users TO service_role;
