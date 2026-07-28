-- Migration: Operator Tracking
-- Objetivo: Base de evidencias de uso do Scout (sessoes + eventos)
--
-- Tabelas criadas:
--   operator_sessions — sessoes do operador (abertura/fechamento do app)
--   operator_events   — eventos de uso (dossie iniciado, concluido, etc.)
--
-- Coluna adicionada:
--   user_context.email_normalized — email em lowercase para deduplicacao

-- ===================================================================
-- 1. user_context: email_normalized
-- ===================================================================

-- Adiciona coluna sem NOT NULL (backfill primeiro)
ALTER TABLE IF EXISTS user_context
  ADD COLUMN IF NOT EXISTS email_normalized TEXT;

-- Backfill: normaliza emails existentes
UPDATE user_context
   SET email_normalized = LOWER(TRIM(email))
 WHERE email_normalized IS NULL
   AND email IS NOT NULL
   AND TRIM(email) <> '';

-- TODO: Antes de criar unique index, executar deduplicacao dos registros
-- com mesmo email_normalized. Query de diagnostico:
--
--   SELECT email_normalized, COUNT(*) AS dups
--     FROM user_context
--    WHERE email_normalized IS NOT NULL
--    GROUP BY email_normalized
--   HAVING COUNT(*) > 1;
--
-- Apos deduplicar, criar indice:
--   CREATE UNIQUE INDEX IF NOT EXISTS idx_user_context_email_normalized
--     ON user_context(email_normalized)
--    WHERE email_normalized IS NOT NULL;

-- Indice nao-unique por enquanto (permite duplicados ate deduplicacao)
CREATE INDEX IF NOT EXISTS idx_user_context_email_normalized
  ON user_context(email_normalized);

-- ===================================================================
-- 2. operator_sessions
-- ===================================================================

CREATE TABLE IF NOT EXISTS operator_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id       TEXT NOT NULL,
  email_normalized  TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ,
  last_seen_at      TIMESTAMPTZ,
  duration_seconds  INTEGER,
  ended_reason      TEXT,  -- pagehide | visibility_hidden | manual | timeout
  environment       TEXT,  -- production | preview | development
  app_version       TEXT,
  user_agent        TEXT
);

CREATE INDEX IF NOT EXISTS idx_operator_sessions_operator
  ON operator_sessions(operator_id, started_at DESC);

-- ===================================================================
-- 3. operator_events
-- ===================================================================

CREATE TABLE IF NOT EXISTS operator_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id       TEXT NOT NULL,
  email_normalized  TEXT,
  session_id        UUID REFERENCES operator_sessions(id) ON DELETE SET NULL,
  event_name        TEXT NOT NULL,
  entity_type       TEXT,   -- session | dossier | shared_dossier
  entity_id         TEXT,   -- UUID da sessao/dossie
  company_cnpj      TEXT,
  company_name      TEXT,
  environment       TEXT,   -- production | preview | development
  route             TEXT,   -- rota atual no momento do evento
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_events_operator
  ON operator_events(operator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operator_events_name
  ON operator_events(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operator_events_session
  ON operator_events(session_id, created_at DESC);

-- ===================================================================
-- 4. RLS — tabelas expostas usam operador local (nao auth.uid)
-- ===================================================================

ALTER TABLE operator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_events   ENABLE ROW LEVEL SECURITY;

-- Politicas minimas para role anon (operador sem auth Supabase).
-- O client-side usa a chave anon/public e precisa apenas de INSERT + UPDATE.
-- SELECT e DELETE sao negados — a leitura e feita server-side (service_role).
-- Nao ha auth.uid() disponivel, mas o escopo e o minimo funcional.

-- operator_sessions: INSERT para criar, UPDATE para upsert/touch/end
CREATE POLICY "anon_insert_operator_sessions"
  ON operator_sessions FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_operator_sessions"
  ON operator_sessions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- operator_events: apenas INSERT (eventos sao imutaveis, nunca atualizados)
CREATE POLICY "anon_insert_operator_events"
  ON operator_events FOR INSERT
  TO anon
  WITH CHECK (true);
