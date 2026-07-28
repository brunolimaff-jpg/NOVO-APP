-- Migration: Dossier Accesses
-- Registro de quem acessou cada dossie e quando.
-- Tabela separada de operator_events para queries simples de
-- "quem viu o que" sem poluir o schema de analytics.

CREATE TABLE IF NOT EXISTS dossier_accesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id  UUID REFERENCES dossies(id) ON DELETE SET NULL,
  operator_id TEXT NOT NULL,
  cnpj        TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indice para: "quem acessou este dossie?"
CREATE INDEX IF NOT EXISTS idx_dossier_accesses_dossier
  ON dossier_accesses(dossier_id, accessed_at DESC);

-- Indice para: "quais dossies este operador acessou?"
CREATE INDEX IF NOT EXISTS idx_dossier_accesses_operator
  ON dossier_accesses(operator_id, accessed_at DESC);

-- Indice para: "quantas vezes este CNPJ foi consultado?"
CREATE INDEX IF NOT EXISTS idx_dossier_accesses_cnpj
  ON dossier_accesses(cnpj, accessed_at DESC)
  WHERE cnpj IS NOT NULL;

-- Indice para busca cross-operator por CNPJ em dossies
-- (sem prefixo operator_id no WHERE, o indice composto nao e usado)
CREATE INDEX IF NOT EXISTS idx_dossies_cnpj_created
  ON dossies(cnpj, created_at DESC)
  WHERE deleted_at IS NULL;

-- RLS: espelha operator_events (20260528_operator_tracking.sql).
-- anon pode apenas INSERT; SELECT negado no client.
-- Leituras (historico/contagem) via service_role quando a UI precisar.
ALTER TABLE dossier_accesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_insert_dossier_accesses
  ON dossier_accesses FOR INSERT
  TO anon
  WITH CHECK (true);
