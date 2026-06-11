-- Migration: Session Timeout Function
-- Cria funcao auto_close_stale_sessions() para fechar sessoes sem heartbeat
-- por mais de 30 minutos. Deve ser chamada por pg_cron ou script externo.
--
-- Uso:
--   SELECT auto_close_stale_sessions(); -- retorna numero de sessoes fechadas

-- ===================================================================
-- 1. Funcao de limpeza de sessoes expiradas
-- ===================================================================

CREATE OR REPLACE FUNCTION auto_close_stale_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  closed_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE operator_sessions
    SET
      ended_at        = last_seen_at + INTERVAL '30 minutes',
      ended_reason    = 'timeout',
      duration_seconds = EXTRACT(EPOCH FROM (last_seen_at - started_at))::INTEGER
    WHERE ended_at IS NULL
      AND last_seen_at IS NOT NULL
      AND last_seen_at < NOW() - INTERVAL '30 minutes'
    RETURNING 1
  )
  SELECT COUNT(*) INTO closed_count FROM updated;

  RETURN closed_count;
END;
$$;

COMMENT ON FUNCTION auto_close_stale_sessions() IS
  'Fecha sessoes sem atividade ha 30+ minutos. ended_at = last_seen_at + 30min. Uso: SELECT auto_close_stale_sessions()';

-- ===================================================================
-- 2. Indice para acelerar a busca de sessoes expiradas
-- ===================================================================

CREATE INDEX IF NOT EXISTS idx_operator_sessions_stale
  ON operator_sessions(last_seen_at)
  WHERE ended_at IS NULL;
