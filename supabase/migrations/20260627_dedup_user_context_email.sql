-- Migration: Dedup user_context por email_normalized + unique constraint
-- Fase 7.3: Resolve 288 duplicadas que forçavam workaround em userContext.ts
-- Idempotente: cada passo usa IF NOT EXISTS / DO blocks. Seguro re-executar.
-- CUIDADO: DELETE irreversível. Backup do Supabase recomendado antes de aplicar.

-- ============================================================================
-- PASSO 1: Tabela de mapeamento (REAL, não TEMP — execute_sql é stateless)
-- ============================================================================
DROP TABLE IF EXISTS _migration_dedup_canonical;
CREATE TABLE _migration_dedup_canonical (
  email_normalized TEXT PRIMARY KEY,
  canonical_operator_id TEXT NOT NULL,
  canonical_ctid TID NOT NULL
);

-- ============================================================================
-- PASSO 2: Para cada email, identificar a linha canônica (mais antiga)
-- ============================================================================
INSERT INTO _migration_dedup_canonical (email_normalized, canonical_operator_id, canonical_ctid)
SELECT
  email_normalized,
  (array_agg(operator_id ORDER BY created_at ASC, ctid ASC))[1] AS canonical_operator_id,
  MIN(ctid) AS canonical_ctid
FROM public.user_context
WHERE email_normalized IS NOT NULL AND email_normalized != ''
GROUP BY email_normalized;

-- ============================================================================
-- PASSO 3: Verificar duplicatas antes de deletar (log de diagnóstico)
-- ============================================================================
DO $$ DECLARE
  total_dups INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_dups
  FROM public.user_context uc
  WHERE uc.ctid NOT IN (SELECT canonical_ctid FROM _migration_dedup_canonical)
    AND uc.email_normalized IS NOT NULL
    AND uc.email_normalized != '';
  RAISE NOTICE 'Linhas duplicadas a deletar: %', total_dups;
END $$;

-- ============================================================================
-- PASSO 4: Deletar duplicadas (mantém só a canônica)
-- ============================================================================
DELETE FROM public.user_context
WHERE ctid NOT IN (SELECT canonical_ctid FROM _migration_dedup_canonical)
  AND email_normalized IS NOT NULL
  AND email_normalized != '';

-- ============================================================================
-- PASSO 5: Adicionar unique constraint em email_normalized
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_context_email_normalized_key'
  ) THEN
    ALTER TABLE public.user_context
      ADD CONSTRAINT user_context_email_normalized_key
      UNIQUE (email_normalized);
  END IF;
END $$;

-- ============================================================================
-- PASSO 6: Cleanup tabela de mapeamento
-- ============================================================================
DROP TABLE IF EXISTS _migration_dedup_canonical;
