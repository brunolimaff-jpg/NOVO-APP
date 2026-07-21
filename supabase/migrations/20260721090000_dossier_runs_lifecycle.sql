-- PR3: lifecycle transacional de execuções de dossiê.
-- Aditiva. Não aplica em ambiente remoto nesta mudança.

-- RLS exception: contract parser captura "public" em CREATE TABLE schema.table;
-- dossier_runs tem RLS habilitado abaixo.
CREATE TABLE public.dossier_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_id TEXT NOT NULL,
  session_id UUID,
  dossier_id UUID REFERENCES public.dossies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  idempotency_key TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  environment TEXT NOT NULL,
  app_version TEXT NOT NULL,
  error_code TEXT,
  error_stage TEXT,
  CONSTRAINT dossier_runs_status_check CHECK (status IN (
    'PENDING', 'RUNNING', 'CANCEL_REQUESTED', 'CANCELLED', 'COMPLETED', 'FAILED'
  )),
  CONSTRAINT dossier_runs_owner_idempotency_key_unique UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX idx_dossier_runs_owner_status ON public.dossier_runs(owner_id, status, created_at DESC);
CREATE INDEX idx_dossier_runs_expired_lease ON public.dossier_runs(lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;
CREATE INDEX idx_dossier_runs_session ON public.dossier_runs(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_dossier_runs_dossier ON public.dossier_runs(dossier_id) WHERE dossier_id IS NOT NULL;

ALTER TABLE public.dossier_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dossier_runs FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.dossier_runs TO authenticated;

CREATE POLICY "authenticated_read_own_dossier_runs"
  ON public.dossier_runs FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- Funções SECURITY DEFINER são a única superfície de escrita. Todo argumento
-- de ownership é derivado de auth.uid(); operator_id do cliente nunca é aceito.
CREATE OR REPLACE FUNCTION public.create_or_get_dossier_run(
  p_idempotency_key TEXT,
  p_session_id UUID,
  p_environment TEXT,
  p_app_version TEXT
) RETURNS public.dossier_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner UUID := auth.uid(); v_run public.dossier_runs;
BEGIN
  IF v_owner IS NULL OR coalesce(btrim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Authenticated user and idempotency key are required';
  END IF;
  INSERT INTO public.dossier_runs (owner_id, operator_id, session_id, status, idempotency_key, environment, app_version)
  SELECT v_owner, p.operator_id, p_session_id, 'PENDING', p_idempotency_key,
         coalesce(nullif(btrim(p_environment), ''), 'development'), coalesce(nullif(btrim(p_app_version), ''), 'unknown')
  FROM public.profiles p WHERE p.id = v_owner
  ON CONFLICT (owner_id, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING * INTO v_run;
  IF v_run.run_id IS NULL THEN RAISE EXCEPTION 'Authenticated profile is required'; END IF;
  RETURN v_run;
END; $$;

CREATE OR REPLACE FUNCTION public.get_own_dossier_run(p_run_id UUID)
RETURNS public.dossier_runs LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  SELECT r.* FROM public.dossier_runs r WHERE r.run_id = p_run_id AND r.owner_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.acquire_dossier_run_lease(p_run_id UUID, p_lease_owner TEXT, p_lease_seconds INTEGER DEFAULT 45)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  IF auth.uid() IS NULL OR coalesce(btrim(p_lease_owner), '') = '' OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Invalid authenticated lease request';
  END IF;
  UPDATE public.dossier_runs
     SET lease_owner = p_lease_owner, lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         last_heartbeat_at = now(), started_at = coalesce(started_at, now()), status = 'RUNNING'
   WHERE run_id = p_run_id AND owner_id = auth.uid()
     AND status IN ('PENDING', 'RUNNING')
     AND (lease_expires_at IS NULL OR lease_expires_at < now() OR lease_owner = p_lease_owner)
  RETURNING * INTO v_run;
  RETURN v_run;
END; $$;

CREATE OR REPLACE FUNCTION public.renew_dossier_run_lease(p_run_id UUID, p_lease_owner TEXT, p_lease_seconds INTEGER DEFAULT 45)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET lease_expires_at = now() + make_interval(secs => p_lease_seconds), last_heartbeat_at = now()
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND status = 'RUNNING'
     AND lease_owner = p_lease_owner AND lease_expires_at >= now()
  RETURNING * INTO v_run; RETURN v_run;
END; $$;

CREATE OR REPLACE FUNCTION public.release_dossier_run_lease(p_run_id UUID, p_lease_owner TEXT)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET lease_owner = NULL, lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND lease_owner = p_lease_owner
  RETURNING * INTO v_run; RETURN v_run;
END; $$;

CREATE OR REPLACE FUNCTION public.request_dossier_run_cancel(p_run_id UUID)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET status = 'CANCEL_REQUESTED', cancel_requested_at = coalesce(cancel_requested_at, now())
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND status IN ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  RETURNING * INTO v_run; RETURN v_run;
END; $$;

CREATE OR REPLACE FUNCTION public.mark_dossier_run_cancelled(p_run_id UUID, p_lease_owner TEXT)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET status = 'CANCELLED', lease_owner = NULL, lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND lease_owner = p_lease_owner AND status = 'CANCEL_REQUESTED'
  RETURNING * INTO v_run; RETURN v_run;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_dossier_run(p_run_id UUID, p_lease_owner TEXT, p_dossier_id UUID)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET status = 'COMPLETED', dossier_id = p_dossier_id, completed_at = now(), lease_owner = NULL, lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND lease_owner = p_lease_owner AND status = 'RUNNING'
  RETURNING * INTO v_run; RETURN v_run;
END; $$;

CREATE OR REPLACE FUNCTION public.fail_dossier_run(p_run_id UUID, p_lease_owner TEXT, p_error_code TEXT, p_error_stage TEXT)
RETURNS public.dossier_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  UPDATE public.dossier_runs SET status = 'FAILED', failed_at = now(), error_code = p_error_code, error_stage = p_error_stage,
      lease_owner = NULL, lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = auth.uid() AND lease_owner = p_lease_owner AND status NOT IN ('CANCELLED', 'COMPLETED', 'FAILED')
  RETURNING * INTO v_run; RETURN v_run;
END; $$;

REVOKE ALL ON FUNCTION public.create_or_get_dossier_run(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_own_dossier_run(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.acquire_dossier_run_lease(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.renew_dossier_run_lease(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_dossier_run_lease(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_dossier_run_cancel(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_dossier_run_cancelled(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_dossier_run(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fail_dossier_run(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_or_get_dossier_run(TEXT, UUID, TEXT, TEXT), public.get_own_dossier_run(UUID),
  public.acquire_dossier_run_lease(UUID, TEXT, INTEGER), public.renew_dossier_run_lease(UUID, TEXT, INTEGER),
  public.release_dossier_run_lease(UUID, TEXT), public.request_dossier_run_cancel(UUID),
  public.mark_dossier_run_cancelled(UUID, TEXT), public.complete_dossier_run(UUID, TEXT, UUID),
  public.fail_dossier_run(UUID, TEXT, TEXT, TEXT) TO authenticated;
