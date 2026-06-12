-- Migration: Sprint 3 — Consolidação de operator_ids fragmentados
-- ATENÇÃO: Executar em staging primeiro. Validar antes de produção.
-- Script idempotente — pode ser re-executado com segurança.

-- ============================================================================
-- PASSO 1: Mapear emails para operator_id canônico (profiles ou mais antigo)
-- ============================================================================

-- Tabela temporária de mapeamento: email → canonical operator_id
CREATE TEMP TABLE IF NOT EXISTS _migration_canonical (
  email_normalized TEXT PRIMARY KEY,
  canonical_operator_id TEXT NOT NULL,
  auth_user_id UUID
) ON COMMIT DROP;

-- Popula: prefere operator_id do profiles (vinculado ao auth), senão o mais antigo
INSERT INTO _migration_canonical (email_normalized, canonical_operator_id, auth_user_id)
SELECT
  uc.email_normalized,
  COALESCE(p.operator_id, first_op.operator_id) as canonical_operator_id,
  p.id as auth_user_id
FROM (
  SELECT email_normalized, MIN(created_at) as min_created
  FROM user_context
  WHERE email_normalized IS NOT NULL AND email_normalized != ''
  GROUP BY email_normalized
) first_time
JOIN user_context first_op
  ON first_op.email_normalized = first_time.email_normalized
  AND first_op.created_at = first_time.min_created
LEFT JOIN profiles p ON p.email = first_op.email_normalized
ON CONFLICT (email_normalized) DO NOTHING;

-- ============================================================================
-- PASSO 2: Atualizar supabase_auth_id no user_context canônico
-- ============================================================================

UPDATE user_context uc
SET supabase_auth_id = mc.auth_user_id
FROM _migration_canonical mc
WHERE uc.email_normalized = mc.email_normalized
  AND uc.operator_id = mc.canonical_operator_id
  AND mc.auth_user_id IS NOT NULL;

-- ============================================================================
-- PASSO 3: Remapear operator_id em TODAS as tabelas filhas
-- Estratégia: JOIN direto com user_context (evita subquery correlacionada)
-- ============================================================================

-- 3a. dossies
UPDATE dossies d
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE d.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

-- 3b. operator_sessions
UPDATE operator_sessions os
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE os.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

-- 3c. operator_events
UPDATE operator_events oe
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE oe.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

-- 3d. radar_alerts (TEM UNIQUE em operator_id)
-- Remove duplicados que conflitariam, mantendo o mais recente por last_scan
DELETE FROM radar_alerts
WHERE id IN (
  SELECT ra.id
  FROM radar_alerts ra
  JOIN user_context uc ON ra.operator_id = uc.operator_id
  JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
  WHERE uc.operator_id != mc.canonical_operator_id
    AND ra.id NOT IN (
      -- Mantém só o mais recente de cada grupo que vai para o mesmo canonical
      SELECT DISTINCT ON (mc2.canonical_operator_id) ra2.id
      FROM radar_alerts ra2
      JOIN user_context uc2 ON ra2.operator_id = uc2.operator_id
      JOIN _migration_canonical mc2 ON uc2.email_normalized = mc2.email_normalized
      ORDER BY mc2.canonical_operator_id, ra2.last_scan DESC NULLS LAST
    )
);
-- Atualiza os sobreviventes
UPDATE radar_alerts ra
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE ra.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

-- 3e. radar_configs (TEM UNIQUE em operator_id — mesma estratégia)
DELETE FROM radar_configs
WHERE id IN (
  SELECT rc.id
  FROM radar_configs rc
  JOIN user_context uc ON rc.operator_id = uc.operator_id
  JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
  WHERE uc.operator_id != mc.canonical_operator_id
    AND rc.id NOT IN (
      SELECT DISTINCT ON (mc2.canonical_operator_id) rc2.id
      FROM radar_configs rc2
      JOIN user_context uc2 ON rc2.operator_id = uc2.operator_id
      JOIN _migration_canonical mc2 ON uc2.email_normalized = mc2.email_normalized
      ORDER BY mc2.canonical_operator_id, rc2.updated_at DESC NULLS LAST
    )
);
UPDATE radar_configs rc
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE rc.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

-- 3f. scout_diagnostics (45k+ registros — batch para evitar lock longo)
DO $$
DECLARE
  batch_size INT := 5000;
  total_updated INT := 0;
  batch_updated INT;
BEGIN
  LOOP
    UPDATE scout_diagnostics sd
    SET operator_id = mc.canonical_operator_id
    FROM user_context uc
    JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
    WHERE sd.operator_id = uc.operator_id
      AND uc.operator_id != mc.canonical_operator_id
      AND sd.id IN (
        SELECT sd2.id FROM scout_diagnostics sd2
        JOIN user_context uc2 ON sd2.operator_id = uc2.operator_id
        JOIN _migration_canonical mc2 ON uc2.email_normalized = mc2.email_normalized
        WHERE uc2.operator_id != mc2.canonical_operator_id
        LIMIT batch_size
      );

    GET DIAGNOSTICS batch_updated = ROW_COUNT;
    total_updated := total_updated + batch_updated;
    EXIT WHEN batch_updated = 0;
  END LOOP;

  RAISE NOTICE '[migration] scout_diagnostics: % registros atualizados', total_updated;
END;
$$;

-- ============================================================================
-- PASSO 4: Remover user_context duplicados (mantém só o canônico)
-- ============================================================================

DELETE FROM user_context uc
WHERE email_normalized IN (SELECT email_normalized FROM _migration_canonical)
  AND operator_id NOT IN (SELECT canonical_operator_id FROM _migration_canonical);

-- ============================================================================
-- PASSO 5: Atualizar user_context canônico com dados consolidados
-- ============================================================================

UPDATE user_context uc
SET
  last_seen = now(),
  display_name = COALESCE(p.name, uc.display_name)
FROM _migration_canonical mc
LEFT JOIN profiles p ON p.id = mc.auth_user_id
WHERE uc.email_normalized = mc.email_normalized
  AND uc.operator_id = mc.canonical_operator_id;

-- ============================================================================
-- VERIFICAÇÃO: Contar registros consolidados
-- ============================================================================

DO $$
DECLARE
  remaining_ops INT;
  unique_emails INT;
  total_dossies INT;
  total_sessions INT;
  total_events INT;
BEGIN
  SELECT COUNT(*) INTO remaining_ops FROM user_context;
  SELECT COUNT(DISTINCT email_normalized) INTO unique_emails FROM user_context WHERE email_normalized IS NOT NULL;
  SELECT COUNT(*) INTO total_dossies FROM dossies;
  SELECT COUNT(*) INTO total_sessions FROM operator_sessions;
  SELECT COUNT(*) INTO total_events FROM operator_events;

  RAISE NOTICE '[migration] Resultado: % operator_ids (% emails unicos), % dossies, % sessoes, % eventos',
    remaining_ops, unique_emails, total_dossies, total_sessions, total_events;
END;
$$;
