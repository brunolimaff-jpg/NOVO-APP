-- Code-only migration. Apply remotely only in an explicitly authorized release.
CREATE TABLE IF NOT EXISTS public.scout_diagnostics_maintenance (
  maintenance_key text PRIMARY KEY,
  last_run_date date NOT NULL
);

ALTER TABLE public.scout_diagnostics_maintenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_diagnostics_maintenance FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_scout_diagnostics_opportunistic(
  retention_days integer DEFAULT 14,
  batch_size integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count integer := 0;
  deleted_batch integer := 0;
  completed_batches integer := 0;
  max_batches constant integer := 20;
  started_at constant timestamptz := clock_timestamp();
  max_runtime constant interval := interval '1500 milliseconds';
BEGIN
  IF retention_days < 1 OR batch_size < 1 OR batch_size > 1000 THEN
    RAISE EXCEPTION 'invalid retention parameters';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtextextended('scout_diagnostics_retention', 0)) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.scout_diagnostics_maintenance (maintenance_key, last_run_date)
  VALUES ('retention', CURRENT_DATE)
  ON CONFLICT (maintenance_key) DO UPDATE
    SET last_run_date = EXCLUDED.last_run_date
    WHERE public.scout_diagnostics_maintenance.last_run_date < EXCLUDED.last_run_date;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  PERFORM set_config('statement_timeout', '2000ms', true);

  LOOP
    EXIT WHEN completed_batches >= max_batches;
    EXIT WHEN clock_timestamp() - started_at >= max_runtime;

    WITH expired AS (
      SELECT ctid
      FROM public.scout_diagnostics
      WHERE created_at < now() - make_interval(days => retention_days)
      ORDER BY created_at
      LIMIT batch_size
    )
    DELETE FROM public.scout_diagnostics target
    USING expired
    WHERE target.ctid = expired.ctid;

    GET DIAGNOSTICS deleted_batch = ROW_COUNT;
    deleted_count := deleted_count + deleted_batch;
    completed_batches := completed_batches + 1;
    EXIT WHEN deleted_batch < batch_size;
  END LOOP;

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_scout_diagnostics_opportunistic(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_scout_diagnostics_opportunistic(integer, integer) TO service_role;
