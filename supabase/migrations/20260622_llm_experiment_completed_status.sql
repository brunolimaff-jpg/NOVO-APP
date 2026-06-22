-- New runs use "completed"; keep historical "success" rows in the same metric.
CREATE OR REPLACE VIEW llm_model_daily_report AS
SELECT
  DATE(r.created_at) AS report_date,
  r.experiment_id,
  r.selected_model,
  COUNT(*) FILTER (WHERE r.status NOT IN ('excluded', 'running')) AS runs_valid,
  COUNT(*) FILTER (WHERE r.status IN ('completed', 'success')) AS runs_success,
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

ALTER VIEW public.llm_model_daily_report SET (security_invoker = true);
REVOKE ALL ON public.llm_model_daily_report FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.llm_model_daily_report TO service_role;

-- Reconciliação independente do browser: qualquer run abandonada por mais de
-- 30 minutos chega a um estado terminal mesmo que o cliente nunca retorne.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
      FROM cron.job
     WHERE jobname = 'reconcile-stale-llm-experiment-runs'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'reconcile-stale-llm-experiment-runs',
  '*/5 * * * *',
  $job$
    UPDATE public.llm_experiment_runs
       SET status = 'failed',
           completed_at = NOW(),
           error_normalized = 'stale_client_finalize_missing'
     WHERE status = 'running'
       AND created_at < NOW() - INTERVAL '30 minutes';
  $job$
);
