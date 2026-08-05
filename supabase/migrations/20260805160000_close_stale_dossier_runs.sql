-- Migration: Cleanup de stale runs (medida G do RCA de lease lifecycle)
-- Fecha runs de dossiê presos em RUNNING com lease expirado, que nenhum
-- cliente consegue finalizar (fail/complete exigem lease_owner vivo).
--
-- Fonte canônica: docs/bugs/rca-lease-lifecycle-2026-08-04.md — cenário D3
-- (runs órfãos sem cleanup) e medida G: "Cleanup de stale runs
-- (cron/edge: RUNNING + lease expirado > X)".
--
-- Decisões registradas (parecer do Planejador, CHANGES_REQUIRED_IN_DRAFT):
-- - Janela padrão de 3.600s (1h), alinhada ao teste original do RCA
--   (T3: "RUNNING com lease expirado há > 1h"). Como o lifecycle permite
--   readquirir uma lease expirada de um run ainda RUNNING, a janela também
--   define por quanto tempo uma retomada continua possível.
-- - Lote limitado (p_batch_limit default 50, teto 1.000) com seleção prévia
--   FOR UPDATE SKIP LOCKED: evita bloqueio de outro cleaner, transação
--   extensa em backlog e locks sem teto. Núcleo idempotente.
--
-- Uso (service_role):
--   SELECT close_stale_dossier_runs();                    -- 1h, lote 50
--   SELECT close_stale_dossier_runs(3600, 50, TRUE);      -- dry run (conta)
--
-- Comportamento: marca FAILED com error_code=STALE_RUN_LEASE_EXPIRED,
-- error_stage=stale_cleanup e libera o lease (lease_owner/lease_expires_at
-- NULL), espelhando a semântica de fail_dossier_run sem exigir owner vivo.

-- ===================================================================
-- 1. Funcao de limpeza de runs obsoletos
-- ===================================================================

CREATE OR REPLACE FUNCTION public.close_stale_dossier_runs(
  p_stale_after_seconds INT DEFAULT 3600,
  p_batch_limit INT DEFAULT 50,
  p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result_count INTEGER := 0;
  stale_cutoff TIMESTAMPTZ;
  v_run_id UUID;
BEGIN
  IF p_stale_after_seconds <= 0 THEN
    RAISE EXCEPTION 'p_stale_after_seconds must be positive';
  END IF;
  IF p_batch_limit <= 0 OR p_batch_limit > 1000 THEN
    RAISE EXCEPTION 'p_batch_limit must be between 1 and 1000';
  END IF;

  stale_cutoff := now() - make_interval(secs => p_stale_after_seconds);

  IF p_dry_run THEN
    SELECT COUNT(*) INTO result_count
    FROM public.dossier_runs
    WHERE status = 'RUNNING'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at < stale_cutoff;
    RETURN result_count;
  END IF;

  FOR v_run_id IN
    SELECT run_id
    FROM public.dossier_runs
    WHERE status = 'RUNNING'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at < stale_cutoff
    ORDER BY lease_expires_at ASC
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.dossier_runs
    SET status = 'FAILED',
        failed_at = coalesce(failed_at, now()),
        error_code = 'STALE_RUN_LEASE_EXPIRED',
        error_stage = 'stale_cleanup',
        lease_owner = NULL,
        lease_expires_at = NULL
    WHERE run_id = v_run_id;
    result_count := result_count + 1;
  END LOOP;

  RETURN result_count;
END;
$$;

COMMENT ON FUNCTION public.close_stale_dossier_runs(INT, INT, BOOLEAN) IS
  'Finaliza runs de dossie RUNNING com lease expirado ha mais de p_stale_after_seconds (default 3600s = 1h), em lotes de ate p_batch_limit (default 50, teto 1000) com FOR UPDATE SKIP LOCKED. p_dry_run apenas conta candidatos. Requer service_role.';

-- ===================================================================
-- 2. Indice parcial para acelerar a busca de runs obsoletos
-- ===================================================================

CREATE INDEX IF NOT EXISTS idx_dossier_runs_stale
  ON public.dossier_runs(lease_expires_at)
  WHERE status = 'RUNNING';

-- ===================================================================
-- 3. Permissoes: apenas service_role (padrao get_expired_unconfirmed_users)
-- ===================================================================

REVOKE EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, INT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, INT, BOOLEAN) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, INT, BOOLEAN) FROM anon;

GRANT EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, INT, BOOLEAN) TO service_role;
