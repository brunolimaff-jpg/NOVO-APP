-- Migration: LLM Experiment Tracking
-- Objetivo: Persistir runs do experimento LiteLLM (3 modelos reasoning)
--
-- Tabelas criadas:
--   llm_experiment_runs — uma linha por dossiê no experimento
--
-- Views criadas:
--   llm_model_daily_report — agregação diária por modelo
--
-- RLS: deny_anon_all — persistência apenas via service_role (api/llm-experiment.ts)

CREATE TABLE IF NOT EXISTS llm_experiment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id TEXT NOT NULL,
  variant TEXT,
  selected_model TEXT NOT NULL,
  provider TEXT NOT NULL,
  litellm_base_url TEXT,
  environment TEXT NOT NULL DEFAULT 'production',
  run_id TEXT NOT NULL,
  session_id TEXT,
  operator_id TEXT,
  company_name TEXT,
  company_cnpj_hash TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  exclusion_reason TEXT,
  fallback_used BOOLEAN DEFAULT FALSE,
  fallback_model TEXT,
  retry_count INTEGER DEFAULT 0,
  total_latency_ms INTEGER,
  model_latency_ms INTEGER,
  waterfall_duration_ms INTEGER,
  modules_generated INTEGER,
  modules_required_present INTEGER,
  modules_missing TEXT[],
  report_chars INTEGER,
  report_tokens_estimated INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  input_cost_usd NUMERIC(10,6),
  output_cost_usd NUMERIC(10,6),
  total_cost_usd NUMERIC(10,6),
  estimated_cost BOOLEAN DEFAULT FALSE,
  cost_estimation_method TEXT,
  input_price_used NUMERIC(10,4),
  output_price_used NUMERIC(10,4),
  sources_count INTEGER,
  valid_sources_count INTEGER,
  removed_sources_count INTEGER,
  porta_score_present BOOLEAN,
  porta_markers_valid BOOLEAN,
  porta_score INTEGER,
  teia_complexidade_present BOOLEAN,
  teia_complexidade TEXT,
  parser_success BOOLEAN,
  render_success BOOLEAN,
  prompt_leak_detected BOOLEAN,
  response_empty BOOLEAN,
  response_truncated BOOLEAN,
  markdown_broken BOOLEAN,
  structural_score INTEGER,
  error_normalized TEXT,
  prompt_version TEXT NOT NULL,
  code_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_llm_runs_experiment_model
  ON llm_experiment_runs(experiment_id, selected_model);
CREATE INDEX IF NOT EXISTS idx_llm_runs_created
  ON llm_experiment_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_runs_status
  ON llm_experiment_runs(status);
CREATE INDEX IF NOT EXISTS idx_llm_runs_model_created
  ON llm_experiment_runs(selected_model, created_at);

ALTER TABLE llm_experiment_runs ENABLE ROW LEVEL SECURITY;

-- Sem INSERT/UPDATE client: persistência só via service_role em api/llm-experiment.ts
-- SELECT negado para anon (relatório via api/llm-experiment-report.ts)

CREATE POLICY "deny_anon_all_llm_experiment_runs"
  ON llm_experiment_runs FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- service_role bypassa RLS por padrão no Supabase

CREATE OR REPLACE VIEW llm_model_daily_report AS
SELECT
  DATE(r.created_at) AS report_date,
  r.experiment_id,
  r.selected_model,
  COUNT(*) FILTER (WHERE r.status NOT IN ('excluded', 'running')) AS runs_valid,
  COUNT(*) FILTER (WHERE r.status = 'success') AS runs_success,
  COUNT(*) FILTER (WHERE r.status = 'quality_failure') AS runs_quality_failure,
  COUNT(*) FILTER (WHERE r.status = 'failed') AS runs_failed,
  COUNT(*) FILTER (WHERE r.fallback_used = true) AS runs_fallback,
  ROUND(AVG(r.total_cost_usd), 6) AS avg_cost_per_dossier,
  SUM(r.total_cost_usd) AS total_cost,
  ROUND(AVG(r.input_tokens)) AS avg_input_tokens,
  ROUND(AVG(r.output_tokens)) AS avg_output_tokens,
  ROUND(AVG(r.total_latency_ms)) AS avg_latency_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r.total_latency_ms) AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY r.total_latency_ms) AS p95_latency_ms,
  ROUND(AVG(r.report_chars)) AS avg_report_chars,
  ROUND(AVG(r.valid_sources_count)) AS avg_valid_sources,
  ROUND(AVG(r.structural_score), 2) AS avg_structural_score,
  ROUND(100.0 * COUNT(*) FILTER (WHERE r.porta_markers_valid = true)
    / NULLIF(COUNT(*) FILTER (WHERE r.status NOT IN ('excluded', 'running')), 0), 2) AS pct_porta_valid
FROM llm_experiment_runs r
GROUP BY DATE(r.created_at), r.experiment_id, r.selected_model
ORDER BY report_date DESC, r.selected_model;
