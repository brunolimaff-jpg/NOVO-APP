-- Migration: Sprint 3 — Consolidação de operator_ids fragmentados
-- ATENÇÃO: Executar em staging primeiro. Validar antes de produção.
-- Script idempotente — pode ser re-executado com segurança.
-- Toda a migração é atômica (BEGIN/COMMIT explícito).

BEGIN;

-- ============================================================================
-- PASSO 0: Setup — tabela temporária de mapeamento
-- ============================================================================

DROP TABLE IF EXISTS _migration_canonical;
CREATE TEMP TABLE _migration_canonical (
  email_normalized TEXT PRIMARY KEY,
  canonical_operator_id TEXT NOT NULL,
  auth_user_id UUID
);

-- ============================================================================
-- PASSO 1: Mapear emails para operator_id canônico
-- Prefere operator_id do profiles (vinculado ao auth), senão o mais antigo
-- LOWER() no JOIN resolve case-sensitive entre profiles.email e email_normalized
-- ============================================================================

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
LEFT JOIN profiles p ON LOWER(p.email) = first_op.email_normalized;

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
-- Estratégia: JOIN direto user_context → canonical
-- ============================================================================

-- 3a. Tabelas SEM restrição UNIQUE em operator_id (update direto)
UPDATE dossies d
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE d.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

UPDATE operator_sessions os
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE os.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

UPDATE operator_events oe
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE oe.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

UPDATE extract_cache ec
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE ec.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

UPDATE audit_log al
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE al.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

UPDATE feedback_events fe
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE fe.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

UPDATE dossier_accesses da
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE da.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

UPDATE shared_dossiers sd2
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE sd2.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

-- 3b. favorites: UNIQUE(operator_id, cnpj). Remove duplicados antes de atualizar.
-- Mantém o mais recente por cnpj, deleta os demais.
DELETE FROM favorites
WHERE id IN (
  SELECT f.id
  FROM favorites f
  JOIN user_context uc ON f.operator_id = uc.operator_id
  JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
  WHERE uc.operator_id != mc.canonical_operator_id
    AND f.id NOT IN (
      -- Mantém só o mais recente por (canonical_operator_id, cnpj)
      SELECT DISTINCT ON (mc2.canonical_operator_id, f2.cnpj) f2.id
      FROM favorites f2
      JOIN user_context uc2 ON f2.operator_id = uc2.operator_id
      JOIN _migration_canonical mc2 ON uc2.email_normalized = mc2.email_normalized
      ORDER BY mc2.canonical_operator_id, f2.cnpj, f2.created_at DESC
    )
);

UPDATE favorites f
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE f.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

-- 3c. radar_alerts: UNIQUE(operator_id). Deleta o registro canônico original,
-- preserva o não-canônico mais recente, atualiza para canonical.
DELETE FROM radar_alerts
WHERE id IN (
  -- Deleta o registro canônico original (será substituído pelo melhor não-canônico)
  SELECT ra.id
  FROM radar_alerts ra
  JOIN _migration_canonical mc ON ra.operator_id = mc.canonical_operator_id
  WHERE EXISTS (
    SELECT 1 FROM user_context uc
    WHERE uc.email_normalized = mc.email_normalized
      AND uc.operator_id != mc.canonical_operator_id
  )
  UNION ALL
  -- Deleta não-canônicos que NÃO são o melhor (o melhor sobrevive para ser atualizado)
  SELECT ra2.id
  FROM radar_alerts ra2
  JOIN user_context uc2 ON ra2.operator_id = uc2.operator_id
  JOIN _migration_canonical mc2 ON uc2.email_normalized = mc2.email_normalized
  WHERE uc2.operator_id != mc2.canonical_operator_id
    AND ra2.id NOT IN (
      SELECT DISTINCT ON (mc3.canonical_operator_id) ra3.id
      FROM radar_alerts ra3
      JOIN user_context uc3 ON ra3.operator_id = uc3.operator_id
      JOIN _migration_canonical mc3 ON uc3.email_normalized = mc3.email_normalized
      WHERE uc3.operator_id != mc3.canonical_operator_id
      ORDER BY mc3.canonical_operator_id, ra3.last_scan DESC NULLS LAST
    )
);

UPDATE radar_alerts ra
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE ra.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

-- 3d. radar_configs: UNIQUE(operator_id). Mesma estratégia do radar_alerts.
DELETE FROM radar_configs
WHERE id IN (
  SELECT rc.id
  FROM radar_configs rc
  JOIN _migration_canonical mc ON rc.operator_id = mc.canonical_operator_id
  WHERE EXISTS (
    SELECT 1 FROM user_context uc
    WHERE uc.email_normalized = mc.email_normalized
      AND uc.operator_id != mc.canonical_operator_id
  )
  UNION ALL
  SELECT rc2.id
  FROM radar_configs rc2
  JOIN user_context uc2 ON rc2.operator_id = uc2.operator_id
  JOIN _migration_canonical mc2 ON uc2.email_normalized = mc2.email_normalized
  WHERE uc2.operator_id != mc2.canonical_operator_id
    AND rc2.id NOT IN (
      SELECT DISTINCT ON (mc3.canonical_operator_id) rc3.id
      FROM radar_configs rc3
      JOIN user_context uc3 ON rc3.operator_id = uc3.operator_id
      JOIN _migration_canonical mc3 ON uc3.email_normalized = mc3.email_normalized
      WHERE uc3.operator_id != mc3.canonical_operator_id
      ORDER BY mc3.canonical_operator_id, rc3.updated_at DESC NULLS LAST
    )
);

UPDATE radar_configs rc
SET operator_id = mc.canonical_operator_id
FROM user_context uc
JOIN _migration_canonical mc ON uc.email_normalized = mc.email_normalized
WHERE rc.operator_id = uc.operator_id
  AND uc.operator_id != mc.canonical_operator_id;

-- 3e. scout_diagnostics (45k+ registros — batch com ORDER BY determinístico)
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
        ORDER BY sd2.id
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
-- PASSO 6: Verificação de integridade
-- ============================================================================

DO $$
DECLARE
  v_remaining_ops INT;
  v_unique_emails INT;
  v_orphan_alerts INT;
  v_conflict_alerts INT;
  v_orphan_configs INT;
  v_conflict_configs INT;
  v_total_dossies INT;
  v_total_sessions INT;
  v_total_events INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining_ops FROM user_context;
  SELECT COUNT(DISTINCT email_normalized) INTO v_unique_emails
    FROM user_context WHERE email_normalized IS NOT NULL;
  SELECT COUNT(*) INTO v_total_dossies FROM dossies;
  SELECT COUNT(*) INTO v_total_sessions FROM operator_sessions;
  SELECT COUNT(*) INTO v_total_events FROM operator_events;

  -- Radar orphan check: operator_ids que não existem mais no user_context
  SELECT COUNT(*) INTO v_orphan_alerts
  FROM radar_alerts WHERE operator_id NOT IN (SELECT operator_id FROM user_context);
  SELECT COUNT(*) INTO v_orphan_configs
  FROM radar_configs WHERE operator_id NOT IN (SELECT operator_id FROM user_context);

  -- Radar conflict check: operator_ids duplicados
  SELECT COUNT(*) INTO v_conflict_alerts
  FROM (SELECT operator_id, COUNT(*) as c FROM radar_alerts GROUP BY operator_id HAVING COUNT(*) > 1) sub;
  SELECT COUNT(*) INTO v_conflict_configs
  FROM (SELECT operator_id, COUNT(*) as c FROM radar_configs GROUP BY operator_id HAVING COUNT(*) > 1) sub;

  RAISE NOTICE '[migration] Resultado:';
  RAISE NOTICE '  operator_ids: % (eram 430)', v_remaining_ops;
  RAISE NOTICE '  emails unicos: %', v_unique_emails;
  RAISE NOTICE '  dossies: % / sessoes: % / eventos: %', v_total_dossies, v_total_sessions, v_total_events;
  RAISE NOTICE '  radar_alerts orfaos: % / conflitos: %', v_orphan_alerts, v_conflict_alerts;
  RAISE NOTICE '  radar_configs orfaos: % / conflitos: %', v_orphan_configs, v_conflict_configs;

  IF v_orphan_alerts > 0 OR v_orphan_configs > 0 THEN
    RAISE WARNING '[migration] ALERTA: registros orfaos em radar — investigar';
  END IF;
  IF v_conflict_alerts > 0 OR v_conflict_configs > 0 THEN
    RAISE EXCEPTION '[migration] ERRO: conflitos de UNIQUE em radar — rollback';
  END IF;
END;
$$;

-- Limpeza
DROP TABLE IF EXISTS _migration_canonical;

COMMIT;
