-- Migration: Dedup user_context por email_normalized + unique index
-- Fase 7.3: Resolve duplicadas que forçavam workaround em userContext.ts
-- Padrão: 20260612_consolidate_operators.sql (DISTINCT ON + remapeamento + DELETE)
-- Idempotente: seguro re-executar.
-- CUIDADO: DELETE irreversível. Backup do Supabase antes de aplicar.

-- ============================================================================
-- PASSO 1: Tabela de mapeamento (REAL, não TEMP — execute_sql é stateless)
-- ============================================================================
DROP TABLE IF EXISTS _migration_dedup_canonical;
CREATE TABLE _migration_dedup_canonical (
  email_normalized TEXT PRIMARY KEY,
  canonical_operator_id TEXT NOT NULL
);

-- ============================================================================
-- PASSO 2: Para cada email, linha canônica = mais antiga por created_at
-- DISTINCT ON garante que operator_id e ctid vêm da MESMA linha
-- ============================================================================
INSERT INTO _migration_dedup_canonical (email_normalized, canonical_operator_id)
SELECT DISTINCT ON (email_normalized)
  email_normalized,
  operator_id
FROM public.user_context
WHERE email_normalized IS NOT NULL AND email_normalized != ''
ORDER BY email_normalized, created_at ASC, ctid ASC;

-- ============================================================================
-- PASSO 3: Remapear tabelas dependentes antes do DELETE
-- (mesmo padrão de 20260612_consolidate_operators.sql)
-- ============================================================================
UPDATE dossies d
SET operator_id = mc.canonical_operator_id
FROM _migration_dedup_canonical mc
WHERE d.operator_id IN (
  SELECT uc.operator_id FROM user_context uc
  WHERE uc.email_normalized = mc.email_normalized
    AND uc.operator_id != mc.canonical_operator_id
);

UPDATE operator_sessions os
SET operator_id = mc.canonical_operator_id
FROM _migration_dedup_canonical mc
WHERE os.operator_id IN (
  SELECT uc.operator_id FROM user_context uc
  WHERE uc.email_normalized = mc.email_normalized
    AND uc.operator_id != mc.canonical_operator_id
);

UPDATE operator_events oe
SET operator_id = mc.canonical_operator_id
FROM _migration_dedup_canonical mc
WHERE oe.operator_id IN (
  SELECT uc.operator_id FROM user_context uc
  WHERE uc.email_normalized = mc.email_normalized
    AND uc.operator_id != mc.canonical_operator_id
);

-- ============================================================================
-- PASSO 4: Verificar duplicatas antes de deletar (log de diagnóstico)
-- ============================================================================
DO $$ DECLARE
  total_dups INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_dups
  FROM public.user_context uc
  WHERE uc.operator_id NOT IN (SELECT canonical_operator_id FROM _migration_dedup_canonical)
    AND uc.email_normalized IS NOT NULL
    AND uc.email_normalized != '';
  RAISE NOTICE 'Linhas duplicadas a deletar: %', total_dups;
END $$;

-- ============================================================================
-- PASSO 5: Deletar duplicadas (mantém só a canônica)
-- ============================================================================
DELETE FROM public.user_context
WHERE operator_id NOT IN (SELECT canonical_operator_id FROM _migration_dedup_canonical)
  AND email_normalized IS NOT NULL
  AND email_normalized != '';

-- ============================================================================
-- PASSO 6: Partial unique index — ignora NULLs e strings vazias
-- (compatível com saveUserContext que usa '' para emails ausentes)
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS user_context_email_normalized_unique_idx
  ON public.user_context (email_normalized)
  WHERE email_normalized IS NOT NULL AND email_normalized != '';

-- ============================================================================
-- PASSO 7: Verificação pós-dedup
-- ============================================================================
SELECT
  'user_context' AS tabela, COUNT(*) AS total, COUNT(DISTINCT email_normalized) AS emails
FROM user_context
UNION ALL SELECT 'dossies', COUNT(*), NULL FROM dossies
UNION ALL SELECT 'sessions', COUNT(*), NULL FROM operator_sessions
UNION ALL SELECT 'events', COUNT(*), NULL FROM operator_events;

-- ============================================================================
-- PASSO 8: Cleanup
-- ============================================================================
DROP TABLE IF EXISTS _migration_dedup_canonical;
