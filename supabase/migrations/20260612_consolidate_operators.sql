-- Migration: Consolidação de operator_ids fragmentados
-- Sprint 3: Executada via execute_sql passo a passo (MCP não mantém sessão).
-- Cada passo é idempotente — seguro re-executar.
--
-- LIÇÕES APRENDIDAS:
-- 1. execute_sql é stateless: cada chamada = nova sessão. Temp tables não sobrevivem.
-- 2. Usar tabela real (não TEMP) para estado entre chamadas.
-- 3. Verificar cada passo antes de prosseguir.
-- 4. Manter plano B: restaurar canônicos via profiles se DELETE for agressivo.

-- ============================================================================
-- PASSO 0: Tabela de mapeamento (REAL, não TEMP — execute_sql é stateless)
-- RLS exception: _migration_canonical é tabela operacional criada e dropada
-- no mesmo script. Executada uma vez e descartada — RLS seria ruido.
-- O test contract aceita tabelas com prefixo _migration_ como excecao.
-- ============================================================================
DROP TABLE IF EXISTS _migration_canonical;
CREATE TABLE _migration_canonical (
  email_normalized TEXT PRIMARY KEY,
  canonical_operator_id TEXT NOT NULL,
  auth_user_id UUID
);

-- ============================================================================
-- PASSO 1: Mapear emails → canonical operator_id
-- Prefere profiles (vinculado ao auth), fallback para o user_context mais antigo
-- ============================================================================
INSERT INTO _migration_canonical (email_normalized, canonical_operator_id, auth_user_id)
SELECT
  first_time.email_normalized,
  COALESCE(p.operator_id, first_op.operator_id) AS canonical_operator_id,
  p.id AS auth_user_id
FROM (
  SELECT email_normalized, MIN(created_at) AS min_created
  FROM user_context
  WHERE email_normalized IS NOT NULL AND email_normalized != ''
  GROUP BY email_normalized
) first_time
JOIN user_context first_op
  ON first_op.email_normalized = first_time.email_normalized
  AND first_op.created_at = first_time.min_created
LEFT JOIN profiles p ON LOWER(p.email) = first_op.email_normalized;

-- ============================================================================
-- PASSO 2: Atualizar supabase_auth_id nos canônicos
-- ============================================================================
UPDATE user_context uc
SET supabase_auth_id = mc.auth_user_id
FROM _migration_canonical mc
WHERE uc.email_normalized = mc.email_normalized
  AND uc.operator_id = mc.canonical_operator_id
  AND mc.auth_user_id IS NOT NULL;

-- ============================================================================
-- PASSO 3: Remapear tabelas COM email (dossiês, sessions, events)
-- ============================================================================
UPDATE dossies d
SET operator_id = mc.canonical_operator_id
FROM _migration_canonical mc
WHERE LOWER(COALESCE(d.operator_email, '')) = mc.email_normalized
  AND d.operator_id != mc.canonical_operator_id;

UPDATE operator_sessions os
SET operator_id = mc.canonical_operator_id
FROM _migration_canonical mc
WHERE os.email_normalized = mc.email_normalized
  AND os.operator_id != mc.canonical_operator_id;

UPDATE operator_events oe
SET operator_id = mc.canonical_operator_id
FROM _migration_canonical mc
WHERE oe.email_normalized = mc.email_normalized
  AND oe.operator_id != mc.canonical_operator_id;

-- Tabelas internas (extract_cache, audit_log, feedback_events, dossier_accesses, shared_dossiers)
UPDATE extract_cache ec
SET operator_id = mc.canonical_operator_id
FROM _migration_canonical mc
WHERE ec.operator_id IN (
  SELECT uc.operator_id FROM user_context uc
  WHERE uc.email_normalized = mc.email_normalized
    AND uc.operator_id != mc.canonical_operator_id
);

UPDATE audit_log al
SET operator_id = mc.canonical_operator_id
FROM _migration_canonical mc
WHERE al.operator_id IN (
  SELECT uc.operator_id FROM user_context uc
  WHERE uc.email_normalized = mc.email_normalized
    AND uc.operator_id != mc.canonical_operator_id
);

UPDATE feedback_events fe
SET operator_id = mc.canonical_operator_id
FROM _migration_canonical mc
WHERE fe.operator_id IN (
  SELECT uc.operator_id FROM user_context uc
  WHERE uc.email_normalized = mc.email_normalized
    AND uc.operator_id != mc.canonical_operator_id
);

UPDATE dossier_accesses da
SET operator_id = mc.canonical_operator_id
FROM _migration_canonical mc
WHERE da.operator_id IN (
  SELECT uc.operator_id FROM user_context uc
  WHERE uc.email_normalized = mc.email_normalized
    AND uc.operator_id != mc.canonical_operator_id
);

UPDATE shared_dossiers sd2
SET operator_id = mc.canonical_operator_id
FROM _migration_canonical mc
WHERE sd2.operator_id IN (
  SELECT uc.operator_id FROM user_context uc
  WHERE uc.email_normalized = mc.email_normalized
    AND uc.operator_id != mc.canonical_operator_id
);

-- Radar alerts e configs: NÃO remapeamos — serão resetados no relink
-- Decisao: "Radar pode resetar (nao precisa preservar radar_alerts/radar_configs no relink)"
-- Se o operador for relinkado, os registros antigos ficam orfaos e sao
-- substituidos por novos scans na proxima execucao do radar.

-- ============================================================================
-- PASSO 4: Remover user_context duplicados
-- ============================================================================
DELETE FROM user_context
WHERE email_normalized IN (SELECT email_normalized FROM _migration_canonical)
  AND operator_id NOT IN (SELECT canonical_operator_id FROM _migration_canonical);

-- ============================================================================
-- PASSO 5: Restaurar canônicos via profiles (se o DELETE removeu demais)
-- ============================================================================
INSERT INTO user_context (operator_id, email, email_normalized, display_name, supabase_auth_id, auth_provider)
SELECT
  mc.canonical_operator_id,
  mc.email_normalized,
  mc.email_normalized,
  p.name,
  p.id,
  'supabase'
FROM _migration_canonical mc
JOIN profiles p ON p.id = mc.auth_user_id
WHERE mc.auth_user_id IS NOT NULL
ON CONFLICT (operator_id)
DO UPDATE SET
  supabase_auth_id = EXCLUDED.supabase_auth_id,
  display_name = COALESCE(EXCLUDED.display_name, user_context.display_name),
  last_seen = now();

-- ============================================================================
-- PASSO 6: Verificação
-- ============================================================================
SELECT
  'user_context' AS tabela, COUNT(*) AS total, COUNT(DISTINCT email_normalized) AS emails
FROM user_context
UNION ALL SELECT 'dossies', COUNT(*), NULL FROM dossies
UNION ALL SELECT 'sessions', COUNT(*), NULL FROM operator_sessions
UNION ALL SELECT 'events', COUNT(*), NULL FROM operator_events
UNION ALL SELECT 'radar_alerts', COUNT(*), NULL FROM radar_alerts
UNION ALL SELECT 'radar_configs', COUNT(*), NULL FROM radar_configs;

-- Órfãos (operator_ids que não existem mais no user_context)
-- NOTA: radar_alerts e radar_configs excluidos da checagem de orfaos:
-- serao resetados no relink (decisao DI-2026-06-12-05).
SELECT 'dossies' AS t, COUNT(*) AS orfaos FROM dossies WHERE operator_id NOT IN (SELECT operator_id FROM user_context)
UNION ALL SELECT 'sessions', COUNT(*) FROM operator_sessions WHERE operator_id NOT IN (SELECT operator_id FROM user_context)
UNION ALL SELECT 'events', COUNT(*) FROM operator_events WHERE operator_id NOT IN (SELECT operator_id FROM user_context);

-- Limpeza
DROP TABLE IF EXISTS _migration_canonical;
