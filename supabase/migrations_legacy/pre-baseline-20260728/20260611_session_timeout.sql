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
      ended_at        = last_seen_at,
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
  'Fecha sessoes sem atividade ha 30+ minutos. ended_at = last_seen_at. Uso: SELECT auto_close_stale_sessions()';

-- ===================================================================
-- 2. Indice para acelerar a busca de sessoes expiradas
-- ===================================================================

CREATE INDEX IF NOT EXISTS idx_operator_sessions_stale
  ON operator_sessions(last_seen_at)
  WHERE ended_at IS NULL;

-- ===================================================================
-- 3. Estrategia futura: deduplicacao de user_context
-- ===================================================================
--
-- O banco real tem duplicados por email_normalized (pior caso: 288 linhas
-- para o mesmo email). Esta migration NAO aplica deduplicacao destrutiva.
--
-- Plano de saneamento futuro (executar em migration separada):
--   1. Auditar: SELECT email_normalized, COUNT(*) FROM user_context
--      GROUP BY email_normalized HAVING COUNT(*) > 1;
--   2. Para cada email, escolher canonical operator_id (mais antigo
--      por created_at com mais eventos/sessoes)
--   3. Remapear operator_sessions.operator_id e operator_events.operator_id
--      para o canonical
--   4. Remover/arquivar registros duplicados de user_context
--   5. Criar unique parcial:
--      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_context_email
--        ON user_context(email_normalized)
--        WHERE email_normalized IS NOT NULL;
--
-- Enquanto houver duplicados, findUserByEmail (client-side) usa
-- .limit(1).order(created_at) para pegar o registro mais antigo.
