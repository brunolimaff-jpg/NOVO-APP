-- Migration: Cleanup de stale runs (medida G do RCA de lease lifecycle)
-- Fecha runs de dossiê presos em RUNNING com lease expirado, que nenhum
-- cliente consegue finalizar (fail/complete exigem lease_owner vivo).
--
-- Fonte canônica: docs/bugs/rca-lease-lifecycle-2026-08-04.md — cenário D3
-- (runs órfãos sem cleanup) e medida G: "Cleanup de stale runs
-- (cron/edge: RUNNING + lease expirado > X)".
--
-- Uso (service_role):
--   SELECT close_stale_dossier_runs();                      -- 15 min de atraso
--   SELECT close_stale_dossier_runs(900, TRUE);             -- dry run (conta)
--
-- Comportamento: marca FAILED com error_code=STALE_RUN_LEASE_EXPIRED,
-- error_stage=stale_cleanup e libera o lease (lease_owner/lease_expires_at
-- NULL), espelhando a semântica de fail_dossier_run sem exigir owner vivo.

-- ===================================================================
-- 1. Funcao de limpeza de runs obsoletos
-- ===================================================================

CREATE OR REPLACE FUNCTION public.close_stale_dossier_runs(
  p_stale_after_seconds INT DEFAULT 900,
  p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result_count INTEGER;
  stale_cutoff TIMESTAMPTZ;
BEGIN
  IF p_stale_after_seconds <= 0 THEN
    RAISE EXCEPTION 'p_stale_after_seconds must be positive';
  END IF;

  stale_cutoff := now() - make_interval(secs => p_stale_after_seconds);

  IF p_dry_run THEN
    SELECT COUNT(*) INTO result_count
    FROM public.dossier_runs
    WHERE status = 'RUNNING'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at < stale_cutoff;
  ELSE
    WITH updated AS (
      UPDATE public.dossier_runs
      SET status = 'FAILED',
          failed_at = coalesce(failed_at, now()),
          error_code = 'STALE_RUN_LEASE_EXPIRED',
          error_stage = 'stale_cleanup',
          lease_owner = NULL,
          lease_expires_at = NULL
      WHERE status = 'RUNNING'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at < stale_cutoff
      RETURNING 1
    )
    SELECT COUNT(*) INTO result_count FROM updated;
  END IF;

  RETURN result_count;
END;
$$;

COMMENT ON FUNCTION public.close_stale_dossier_runs(INT, BOOLEAN) IS
  'Finaliza runs de dossie RUNNING com lease expirado ha mais de p_stale_after_seconds (default 900s = 15min). p_dry_run apenas conta candidatos. Requer service_role.';

-- ===================================================================
-- 2. Indice parcial para acelerar a busca de runs obsoletos
-- ===================================================================

CREATE INDEX IF NOT EXISTS idx_dossier_runs_stale
  ON public.dossier_runs(lease_expires_at)
  WHERE status = 'RUNNING';

-- ===================================================================
-- 3. Permissoes: apenas service_role (padrao get_expired_unconfirmed_users)
-- ===================================================================

REVOKE EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, BOOLEAN) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, BOOLEAN) FROM anon;

GRANT EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, BOOLEAN) TO service_role;
