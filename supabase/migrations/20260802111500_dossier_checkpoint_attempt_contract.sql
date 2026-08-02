-- DOSSIER-FLOW-05E.0C
-- Contract-only foundation for durable attempts, checkpoints, fencing and resume.
--
-- This migration is intentionally isolated from api/dossier.ts and the canonical
-- pipeline. It creates exactly two new tables and keeps dossier_runs,
-- dossier_runs.status_check and the legacy persistence RPC unchanged.
--
-- No direct table DML is granted. The authenticated owner reaches the new
-- surfaces only through SECURITY DEFINER RPCs that derive ownership from
-- auth.uid(). No user token, secret or connection string is persisted.

CREATE TABLE public.dossier_run_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.dossier_runs (run_id) ON DELETE CASCADE,
  attempt_no smallint NOT NULL,
  fence_token uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  pipeline_version text NOT NULL,
  status text NOT NULL DEFAULT 'RUNNING',
  next_retry_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  last_heartbeat_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_stage text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT dossier_run_attempts_attempt_no_check
    CHECK (attempt_no BETWEEN 1 AND 2),
  CONSTRAINT dossier_run_attempts_pipeline_version_check
    CHECK (pg_catalog.btrim(pipeline_version) <> ''),
  CONSTRAINT dossier_run_attempts_status_check
    CHECK (status IN ('RUNNING', 'RETRYABLE_FAILED', 'FAILED', 'CANCELLED', 'COMPLETED', 'SUPERSEDED')),
  CONSTRAINT dossier_run_attempts_finished_at_check
    CHECK (status = 'RUNNING' AND finished_at IS NULL OR status <> 'RUNNING' AND finished_at IS NOT NULL),
  CONSTRAINT dossier_run_attempts_retry_at_check
    CHECK (
      status = 'RETRYABLE_FAILED' AND next_retry_at IS NOT NULL
      OR status <> 'RETRYABLE_FAILED' AND next_retry_at IS NULL
    ),
  CONSTRAINT dossier_run_attempts_error_code_check
    CHECK (error_code IS NULL OR (pg_catalog.length(error_code) <= 128 AND error_code !~ '[\r\n]')),
  CONSTRAINT dossier_run_attempts_error_stage_check
    CHECK (error_stage IS NULL OR (pg_catalog.length(error_stage) <= 128 AND error_stage !~ '[\r\n]')),
  CONSTRAINT dossier_run_attempts_run_attempt_unique UNIQUE (run_id, attempt_no),
  CONSTRAINT dossier_run_attempts_run_attempt_id_unique UNIQUE (run_id, attempt_id),
  CONSTRAINT dossier_run_attempts_fence_token_unique UNIQUE (fence_token)
);

CREATE UNIQUE INDEX dossier_run_attempts_one_running_per_run
  ON public.dossier_run_attempts (run_id)
  WHERE status = 'RUNNING';

CREATE INDEX dossier_run_attempts_retry_lookup
  ON public.dossier_run_attempts (run_id, status, next_retry_at);

CREATE INDEX dossier_run_attempts_pipeline_lookup
  ON public.dossier_run_attempts (run_id, pipeline_version, attempt_no);

CREATE TABLE public.dossier_run_checkpoints (
  checkpoint_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.dossier_runs (run_id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL,
  fence_token uuid NOT NULL,
  pipeline_version text NOT NULL,
  step_key text NOT NULL,
  step_ordinal integer NOT NULL,
  output_payload jsonb NOT NULL,
  output_digest text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT dossier_run_checkpoints_attempt_fk
    FOREIGN KEY (run_id, attempt_id)
    REFERENCES public.dossier_run_attempts (run_id, attempt_id)
    ON DELETE CASCADE,
  CONSTRAINT dossier_run_checkpoints_pipeline_version_check
    CHECK (pg_catalog.btrim(pipeline_version) <> ''),
  CONSTRAINT dossier_run_checkpoints_step_key_check
    CHECK (pg_catalog.btrim(step_key) <> ''),
  CONSTRAINT dossier_run_checkpoints_step_ordinal_check
    CHECK (step_ordinal >= 0),
  CONSTRAINT dossier_run_checkpoints_payload_object_check
    CHECK (pg_catalog.jsonb_typeof(output_payload) = 'object'),
  CONSTRAINT dossier_run_checkpoints_payload_size_check
    CHECK (
      pg_catalog.octet_length(
        pg_catalog.convert_to(output_payload::text, 'UTF8')
      ) <= 1048576
    ),
  CONSTRAINT dossier_run_checkpoints_digest_format_check
    CHECK (output_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT dossier_run_checkpoints_step_unique
    UNIQUE (run_id, pipeline_version, step_key),
  CONSTRAINT dossier_run_checkpoints_ordinal_unique
    UNIQUE (run_id, pipeline_version, step_ordinal)
);

CREATE INDEX dossier_run_checkpoints_resume_order
  ON public.dossier_run_checkpoints (run_id, pipeline_version, step_ordinal);

CREATE INDEX dossier_run_checkpoints_attempt_lookup
  ON public.dossier_run_checkpoints (run_id, attempt_id, fence_token);

ALTER TABLE public.dossier_run_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossier_run_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dossier_run_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossier_run_checkpoints FORCE ROW LEVEL SECURITY;

-- Explicit deny policies document that direct DML is never the contract.
CREATE POLICY dossier_run_attempts_no_direct_dml
  ON public.dossier_run_attempts
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY dossier_run_checkpoints_no_direct_dml
  ON public.dossier_run_checkpoints
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.dossier_run_attempts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dossier_run_checkpoints FROM PUBLIC, anon, authenticated, service_role;

-- Start a new persistent attempt and bind the run lease to its database token.
CREATE OR REPLACE FUNCTION public.begin_dossier_run_attempt(
  p_run_id uuid,
  p_pipeline_version text,
  p_lease_seconds integer DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_run public.dossier_runs;
  v_previous public.dossier_run_attempts;
  v_attempt public.dossier_run_attempts;
  v_now timestamptz;
  v_max_attempt smallint;
  v_fence_token uuid;
  v_lease_expires_at timestamptz;
BEGIN
  IF v_owner IS NULL OR p_run_id IS NULL
     OR p_pipeline_version IS NULL
     OR pg_catalog.btrim(p_pipeline_version) = ''
     OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
    INTO v_run
    FROM public.dossier_runs AS r
   WHERE r.run_id = p_run_id
     AND r.owner_id = v_owner
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_now := pg_catalog.clock_timestamp();

  IF v_run.status IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN
    RAISE EXCEPTION 'RUN_TERMINAL' USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status = 'CANCEL_REQUESTED' OR v_run.cancel_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'RUN_CANCEL_REQUESTED' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.*
    INTO v_previous
    FROM public.dossier_run_attempts AS a
   WHERE a.run_id = p_run_id
     AND a.status = 'RUNNING'
   ORDER BY a.attempt_no DESC
   LIMIT 1
   FOR UPDATE;

  IF v_previous.attempt_id IS NOT NULL THEN
    IF v_run.lease_expires_at IS NOT NULL AND v_run.lease_expires_at > v_now THEN
      RAISE EXCEPTION 'RUN_LEASE_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    IF v_previous.attempt_no >= 2 THEN
      UPDATE public.dossier_run_attempts
         SET status = 'FAILED',
             finished_at = v_now,
             updated_at = v_now,
             error_code = 'ATTEMPT_LIMIT_REACHED',
             error_stage = 'begin_attempt'
       WHERE attempt_id = v_previous.attempt_id;

      UPDATE public.dossier_runs
         SET status = 'FAILED',
             failed_at = coalesce(failed_at, v_now),
             error_code = 'ATTEMPT_LIMIT_REACHED',
             error_stage = 'begin_attempt',
             lease_owner = NULL,
             lease_expires_at = NULL
       WHERE run_id = p_run_id
         AND owner_id = v_owner;

      RAISE EXCEPTION 'ATTEMPT_LIMIT_REACHED' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.dossier_run_attempts
       SET status = 'SUPERSEDED',
           finished_at = v_now,
           updated_at = v_now,
           error_code = 'ATTEMPT_LEASE_EXPIRED',
           error_stage = 'begin_attempt'
     WHERE attempt_id = v_previous.attempt_id;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.dossier_run_attempts AS a
     WHERE a.run_id = p_run_id
       AND a.pipeline_version IS DISTINCT FROM p_pipeline_version
  ) THEN
    RAISE EXCEPTION 'PIPELINE_VERSION_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(max(a.attempt_no), 0)
    INTO v_max_attempt
    FROM public.dossier_run_attempts AS a
   WHERE a.run_id = p_run_id;

  IF v_max_attempt >= 2 THEN
    RAISE EXCEPTION 'ATTEMPT_LIMIT_REACHED' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.dossier_run_attempts AS a
     WHERE a.run_id = p_run_id
       AND a.status = 'RETRYABLE_FAILED'
       AND a.next_retry_at IS NOT NULL
       AND a.next_retry_at > v_now
  ) THEN
    RAISE EXCEPTION 'RETRY_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  v_fence_token := extensions.gen_random_uuid();
  v_lease_expires_at := v_now + pg_catalog.make_interval(secs => p_lease_seconds);

  UPDATE public.dossier_runs
     SET status = 'RUNNING',
         lease_owner = v_fence_token::text,
         lease_expires_at = v_lease_expires_at,
         started_at = coalesce(started_at, v_now),
         last_heartbeat_at = v_now
   WHERE run_id = p_run_id
     AND owner_id = v_owner;

  INSERT INTO public.dossier_run_attempts (
    run_id,
    attempt_no,
    fence_token,
    pipeline_version,
    status,
    started_at,
    last_heartbeat_at,
    created_at,
    updated_at
  )
  VALUES (
    p_run_id,
    v_max_attempt + 1,
    v_fence_token,
    p_pipeline_version,
    'RUNNING',
    v_now,
    v_now,
    v_now,
    v_now
  )
  RETURNING * INTO v_attempt;

  RETURN pg_catalog.jsonb_build_object(
    'run_id', v_attempt.run_id,
    'attempt_id', v_attempt.attempt_id,
    'attempt_no', v_attempt.attempt_no,
    'fence_token', v_attempt.fence_token,
    'pipeline_version', v_attempt.pipeline_version,
    'lease_expires_at', v_lease_expires_at,
    'checkpoint_count', (
      SELECT count(*)::integer
        FROM public.dossier_run_checkpoints AS c
       WHERE c.run_id = p_run_id
         AND c.pipeline_version = p_pipeline_version
    )
  );
END;
$$;

-- Renew only the active attempt that still owns the run lease.
CREATE OR REPLACE FUNCTION public.renew_dossier_run_attempt_lease(
  p_run_id uuid,
  p_attempt_id uuid,
  p_fence_token uuid,
  p_lease_seconds integer DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_run public.dossier_runs;
  v_attempt public.dossier_run_attempts;
  v_now timestamptz;
  v_expires timestamptz;
BEGIN
  IF v_owner IS NULL OR p_run_id IS NULL OR p_attempt_id IS NULL
     OR p_fence_token IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
    INTO v_run
    FROM public.dossier_runs AS r
   WHERE r.run_id = p_run_id
     AND r.owner_id = v_owner
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.*
    INTO v_attempt
    FROM public.dossier_run_attempts AS a
   WHERE a.run_id = p_run_id
     AND a.attempt_id = p_attempt_id
   FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'RUNNING'
     OR v_attempt.fence_token IS DISTINCT FROM p_fence_token THEN
    RAISE EXCEPTION 'ATTEMPT_FENCE_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  v_now := pg_catalog.clock_timestamp();

  IF v_run.status <> 'RUNNING'
     OR v_run.cancel_requested_at IS NOT NULL
     OR v_run.lease_owner IS DISTINCT FROM p_fence_token::text
     OR v_run.lease_expires_at IS NULL
     OR v_run.lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'ATTEMPT_LEASE_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  v_expires := v_now + pg_catalog.make_interval(secs => p_lease_seconds);

  UPDATE public.dossier_runs
     SET lease_expires_at = v_expires,
         last_heartbeat_at = v_now
   WHERE run_id = p_run_id
     AND owner_id = v_owner
     AND lease_owner = p_fence_token::text;

  UPDATE public.dossier_run_attempts
     SET last_heartbeat_at = v_now,
         updated_at = v_now
   WHERE attempt_id = p_attempt_id
     AND status = 'RUNNING'
     AND fence_token = p_fence_token;

  RETURN pg_catalog.jsonb_build_object(
    'run_id', p_run_id,
    'attempt_id', p_attempt_id,
    'fence_token', p_fence_token,
    'lease_expires_at', v_expires
  );
END;
$$;

-- Record an immutable checkpoint; the digest is computed from the payload here.
CREATE OR REPLACE FUNCTION public.record_dossier_run_checkpoint(
  p_run_id uuid,
  p_attempt_id uuid,
  p_fence_token uuid,
  p_pipeline_version text,
  p_step_key text,
  p_step_ordinal integer,
  p_output_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_run public.dossier_runs;
  v_attempt public.dossier_run_attempts;
  v_checkpoint public.dossier_run_checkpoints;
  v_same_ordinal public.dossier_run_checkpoints;
  v_now timestamptz;
  v_digest text;
BEGIN
  IF v_owner IS NULL OR p_run_id IS NULL OR p_attempt_id IS NULL
     OR p_fence_token IS NULL OR p_pipeline_version IS NULL
     OR pg_catalog.btrim(p_pipeline_version) = ''
     OR p_step_key IS NULL OR pg_catalog.btrim(p_step_key) = ''
     OR p_step_ordinal IS NULL OR p_step_ordinal < 0
     OR p_output_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_output_payload) <> 'object' THEN
    RAISE EXCEPTION 'PERSISTENCE_FAILED' USING ERRCODE = 'P0001';
  END IF;

  IF pg_catalog.octet_length(
       pg_catalog.convert_to(p_output_payload::text, 'UTF8')
     ) > 1048576 THEN
    RAISE EXCEPTION 'CHECKPOINT_PAYLOAD_TOO_LARGE' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
    INTO v_run
    FROM public.dossier_runs AS r
   WHERE r.run_id = p_run_id
     AND r.owner_id = v_owner
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.*
    INTO v_attempt
    FROM public.dossier_run_attempts AS a
   WHERE a.run_id = p_run_id
     AND a.attempt_id = p_attempt_id
   FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'RUNNING'
     OR v_attempt.fence_token IS DISTINCT FROM p_fence_token THEN
    RAISE EXCEPTION 'ATTEMPT_FENCE_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  v_now := pg_catalog.clock_timestamp();

  IF v_run.status <> 'RUNNING'
     OR v_run.cancel_requested_at IS NOT NULL
     OR v_run.lease_owner IS DISTINCT FROM p_fence_token::text
     OR v_run.lease_expires_at IS NULL
     OR v_run.lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'ATTEMPT_LEASE_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_attempt.pipeline_version IS DISTINCT FROM p_pipeline_version THEN
    RAISE EXCEPTION 'PIPELINE_VERSION_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.*
    INTO v_checkpoint
    FROM public.dossier_run_checkpoints AS c
   WHERE c.run_id = p_run_id
     AND c.pipeline_version = p_pipeline_version
     AND c.step_key = p_step_key
   FOR UPDATE;

  IF v_checkpoint.checkpoint_id IS NOT NULL THEN
    v_digest := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(p_output_payload::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    IF v_checkpoint.output_digest = v_digest
       AND v_checkpoint.output_payload IS NOT DISTINCT FROM p_output_payload THEN
      RETURN pg_catalog.jsonb_build_object(
        'checkpoint_id', v_checkpoint.checkpoint_id,
        'run_id', v_checkpoint.run_id,
        'attempt_id', v_checkpoint.attempt_id,
        'pipeline_version', v_checkpoint.pipeline_version,
        'step_key', v_checkpoint.step_key,
        'step_ordinal', v_checkpoint.step_ordinal,
        'output_digest', v_checkpoint.output_digest,
        'idempotent', true
      );
    END IF;

    RAISE EXCEPTION 'CHECKPOINT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.*
    INTO v_same_ordinal
    FROM public.dossier_run_checkpoints AS c
   WHERE c.run_id = p_run_id
     AND c.pipeline_version = p_pipeline_version
     AND c.step_ordinal = p_step_ordinal
   FOR UPDATE;

  IF v_same_ordinal.checkpoint_id IS NOT NULL THEN
    RAISE EXCEPTION 'CHECKPOINT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.dossier_run_checkpoints AS c
     WHERE c.run_id = p_run_id
       AND c.pipeline_version = p_pipeline_version
       AND c.step_ordinal > p_step_ordinal
  ) THEN
    RAISE EXCEPTION 'CHECKPOINT_OUT_OF_ORDER' USING ERRCODE = 'P0001';
  END IF;

  v_digest := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_output_payload::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.dossier_run_checkpoints (
    run_id,
    attempt_id,
    fence_token,
    pipeline_version,
    step_key,
    step_ordinal,
    output_payload,
    output_digest,
    confirmed_at,
    created_at
  )
  VALUES (
    p_run_id,
    p_attempt_id,
    p_fence_token,
    p_pipeline_version,
    p_step_key,
    p_step_ordinal,
    p_output_payload,
    v_digest,
    v_now,
    v_now
  )
  RETURNING * INTO v_checkpoint;

  RETURN pg_catalog.jsonb_build_object(
    'checkpoint_id', v_checkpoint.checkpoint_id,
    'run_id', v_checkpoint.run_id,
    'attempt_id', v_checkpoint.attempt_id,
    'pipeline_version', v_checkpoint.pipeline_version,
    'step_key', v_checkpoint.step_key,
    'step_ordinal', v_checkpoint.step_ordinal,
    'output_digest', v_checkpoint.output_digest,
    'idempotent', false
  );
END;
$$;

-- Read-only resume projection for the authenticated owner.
CREATE OR REPLACE FUNCTION public.get_dossier_run_resume_state(
  p_run_id uuid,
  p_pipeline_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_run public.dossier_runs;
BEGIN
  IF v_owner IS NULL OR p_run_id IS NULL
     OR p_pipeline_version IS NULL
     OR pg_catalog.btrim(p_pipeline_version) = '' THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
    INTO v_run
    FROM public.dossier_runs AS r
   WHERE r.run_id = p_run_id
     AND r.owner_id = v_owner;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.dossier_run_attempts AS a
     WHERE a.run_id = p_run_id
       AND a.pipeline_version IS DISTINCT FROM p_pipeline_version
  ) THEN
    RAISE EXCEPTION 'PIPELINE_VERSION_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'run_id', v_run.run_id,
    'status', v_run.status,
    'pipeline_version', p_pipeline_version,
    'attempts', coalesce(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'attempt_id', a.attempt_id,
            'attempt_no', a.attempt_no,
            'pipeline_version', a.pipeline_version,
            'status', a.status,
            'next_retry_at', a.next_retry_at,
            'started_at', a.started_at,
            'last_heartbeat_at', a.last_heartbeat_at,
            'finished_at', a.finished_at,
            'error_code', a.error_code,
            'error_stage', a.error_stage
          )
          ORDER BY a.attempt_no
        )
        FROM public.dossier_run_attempts AS a
        WHERE a.run_id = p_run_id
      ),
      '[]'::jsonb
    ),
    'checkpoints', coalesce(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'checkpoint_id', c.checkpoint_id,
            'attempt_id', c.attempt_id,
            'pipeline_version', c.pipeline_version,
            'step_key', c.step_key,
            'step_ordinal', c.step_ordinal,
            'output_payload', c.output_payload,
            'output_digest', c.output_digest,
            'confirmed_at', c.confirmed_at
          )
          ORDER BY c.step_ordinal
        )
        FROM public.dossier_run_checkpoints AS c
        WHERE c.run_id = p_run_id
          AND c.pipeline_version = p_pipeline_version
      ),
      '[]'::jsonb
    ),
    'checkpoint_count', (
      SELECT count(*)::integer
        FROM public.dossier_run_checkpoints AS c
       WHERE c.run_id = p_run_id
         AND c.pipeline_version = p_pipeline_version
    ),
    'attempts_consumed', (
      SELECT count(*)::integer
        FROM public.dossier_run_attempts AS a
       WHERE a.run_id = p_run_id
    ),
    'next_retry_at', (
      SELECT min(a.next_retry_at)
        FROM public.dossier_run_attempts AS a
       WHERE a.run_id = p_run_id
         AND a.status = 'RETRYABLE_FAILED'
    )
  );
END;
$$;

-- Persist retry state without deleting checkpoints.
CREATE OR REPLACE FUNCTION public.schedule_dossier_run_retry(
  p_run_id uuid,
  p_attempt_id uuid,
  p_fence_token uuid,
  p_error_code text,
  p_error_stage text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_run public.dossier_runs;
  v_attempt public.dossier_run_attempts;
  v_now timestamptz;
  v_retry_at timestamptz;
BEGIN
  IF v_owner IS NULL OR p_run_id IS NULL OR p_attempt_id IS NULL
     OR p_fence_token IS NULL
     OR p_error_code IS NULL OR pg_catalog.btrim(p_error_code) = ''
     OR p_error_stage IS NULL OR pg_catalog.btrim(p_error_stage) = '' THEN
    RAISE EXCEPTION 'RETRY_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
    INTO v_run
    FROM public.dossier_runs AS r
   WHERE r.run_id = p_run_id
     AND r.owner_id = v_owner
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.*
    INTO v_attempt
    FROM public.dossier_run_attempts AS a
   WHERE a.run_id = p_run_id
     AND a.attempt_id = p_attempt_id
   FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'RUNNING'
     OR v_attempt.fence_token IS DISTINCT FROM p_fence_token THEN
    RAISE EXCEPTION 'ATTEMPT_FENCE_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  v_now := pg_catalog.clock_timestamp();

  IF v_attempt.attempt_no <> 1
     OR v_run.status <> 'RUNNING'
     OR v_run.cancel_requested_at IS NOT NULL
     OR v_run.lease_owner IS DISTINCT FROM p_fence_token::text
     OR v_run.lease_expires_at IS NULL
     OR v_run.lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'RETRY_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  v_retry_at := v_now + pg_catalog.make_interval(secs => 5);

  UPDATE public.dossier_run_attempts
     SET status = 'RETRYABLE_FAILED',
         next_retry_at = v_retry_at,
         finished_at = v_now,
         updated_at = v_now,
         error_code = pg_catalog.left(pg_catalog.btrim(p_error_code), 128),
         error_stage = pg_catalog.left(pg_catalog.btrim(p_error_stage), 128)
   WHERE attempt_id = p_attempt_id
     AND status = 'RUNNING';

  UPDATE public.dossier_runs
     SET status = 'PENDING',
         error_code = pg_catalog.left(pg_catalog.btrim(p_error_code), 128),
         error_stage = pg_catalog.left(pg_catalog.btrim(p_error_stage), 128),
         lease_owner = NULL,
         lease_expires_at = NULL,
         last_heartbeat_at = v_now
   WHERE run_id = p_run_id
     AND owner_id = v_owner
     AND status = 'RUNNING'
     AND lease_owner = p_fence_token::text
     AND cancel_requested_at IS NULL;

  RETURN pg_catalog.jsonb_build_object(
    'run_id', p_run_id,
    'attempt_id', p_attempt_id,
    'attempt_no', v_attempt.attempt_no,
    'status', 'RETRYABLE_FAILED',
    'next_retry_at', v_retry_at,
    'retry_backoff_ms', 5000
  );
END;
$$;

-- Terminal failure reuses the existing dossier_runs failure behavior.
CREATE OR REPLACE FUNCTION public.fail_dossier_run_attempt(
  p_run_id uuid,
  p_attempt_id uuid,
  p_fence_token uuid,
  p_error_code text,
  p_error_stage text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_run public.dossier_runs;
  v_attempt public.dossier_run_attempts;
  v_now timestamptz;
BEGIN
  IF v_owner IS NULL OR p_run_id IS NULL OR p_attempt_id IS NULL
     OR p_fence_token IS NULL
     OR p_error_code IS NULL OR pg_catalog.btrim(p_error_code) = ''
     OR p_error_stage IS NULL OR pg_catalog.btrim(p_error_stage) = '' THEN
    RAISE EXCEPTION 'PERSISTENCE_FAILED' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
    INTO v_run
    FROM public.dossier_runs AS r
   WHERE r.run_id = p_run_id
     AND r.owner_id = v_owner
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.*
    INTO v_attempt
    FROM public.dossier_run_attempts AS a
   WHERE a.run_id = p_run_id
     AND a.attempt_id = p_attempt_id
   FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'RUNNING'
     OR v_attempt.fence_token IS DISTINCT FROM p_fence_token THEN
    RAISE EXCEPTION 'ATTEMPT_FENCE_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  v_now := pg_catalog.clock_timestamp();

  IF v_run.status <> 'RUNNING'
     OR v_run.cancel_requested_at IS NOT NULL
     OR v_run.lease_owner IS DISTINCT FROM p_fence_token::text
     OR v_run.lease_expires_at IS NULL
     OR v_run.lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'ATTEMPT_LEASE_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.fail_dossier_run(
    p_run_id,
    p_fence_token::text,
    pg_catalog.left(pg_catalog.btrim(p_error_code), 128),
    pg_catalog.left(pg_catalog.btrim(p_error_stage), 128)
  );

  UPDATE public.dossier_run_attempts
     SET status = 'FAILED',
         finished_at = v_now,
         updated_at = v_now,
         error_code = pg_catalog.left(pg_catalog.btrim(p_error_code), 128),
         error_stage = pg_catalog.left(pg_catalog.btrim(p_error_stage), 128)
   WHERE attempt_id = p_attempt_id
     AND status = 'RUNNING';

  RETURN pg_catalog.jsonb_build_object(
    'run_id', p_run_id,
    'attempt_id', p_attempt_id,
    'status', 'FAILED',
    'error_code', pg_catalog.left(pg_catalog.btrim(p_error_code), 128),
    'error_stage', pg_catalog.left(pg_catalog.btrim(p_error_stage), 128)
  );
END;
$$;

-- Cancel active attempts or a run waiting between retries.
CREATE OR REPLACE FUNCTION public.cancel_dossier_run_attempt(
  p_run_id uuid,
  p_attempt_id uuid DEFAULT NULL,
  p_fence_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_run public.dossier_runs;
  v_attempt public.dossier_run_attempts;
  v_now timestamptz;
BEGIN
  IF v_owner IS NULL OR p_run_id IS NULL THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
    INTO v_run
    FROM public.dossier_runs AS r
   WHERE r.run_id = p_run_id
     AND r.owner_id = v_owner
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status = 'COMPLETED' OR v_run.status = 'FAILED' THEN
    RAISE EXCEPTION 'RUN_TERMINAL' USING ERRCODE = 'P0001';
  END IF;

  v_now := pg_catalog.clock_timestamp();

  SELECT a.*
    INTO v_attempt
    FROM public.dossier_run_attempts AS a
   WHERE a.run_id = p_run_id
     AND a.status = 'RUNNING'
   ORDER BY a.attempt_no DESC
   LIMIT 1
   FOR UPDATE;

  IF v_attempt.attempt_id IS NOT NULL THEN
    IF p_attempt_id IS NULL OR p_fence_token IS NULL
       OR v_attempt.attempt_id IS DISTINCT FROM p_attempt_id
       OR v_attempt.fence_token IS DISTINCT FROM p_fence_token THEN
      RAISE EXCEPTION 'ATTEMPT_FENCE_MISMATCH' USING ERRCODE = 'P0001';
    END IF;

    IF v_run.lease_owner IS DISTINCT FROM p_fence_token::text THEN
      RAISE EXCEPTION 'ATTEMPT_FENCE_MISMATCH' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.dossier_run_attempts
       SET status = 'CANCELLED',
           finished_at = v_now,
           updated_at = v_now,
           error_code = 'RUN_CANCEL_REQUESTED',
           error_stage = 'cancel_attempt'
     WHERE attempt_id = v_attempt.attempt_id
       AND status = 'RUNNING';
  END IF;

  UPDATE public.dossier_runs
     SET status = 'CANCELLED',
         cancel_requested_at = coalesce(cancel_requested_at, v_now),
         cancelled_at = coalesce(cancelled_at, v_now),
         lease_owner = NULL,
         lease_expires_at = NULL
   WHERE run_id = p_run_id
     AND owner_id = v_owner
     AND status IN ('PENDING', 'RUNNING', 'CANCEL_REQUESTED');

  RETURN pg_catalog.jsonb_build_object(
    'run_id', p_run_id,
    'status', 'CANCELLED',
    'attempt_id', v_attempt.attempt_id,
    'cancelled_at', v_now
  );
END;
$$;

-- Final persistence wrapper: validate the attempt, then reuse the existing
-- atomic dossier write and mark the attempt terminal in the same transaction.
CREATE OR REPLACE FUNCTION public.persist_and_complete_dossier_run_attempt(
  p_run_id uuid,
  p_attempt_id uuid,
  p_fence_token uuid,
  p_pipeline_version text,
  p_dossier_id uuid,
  p_title text,
  p_empresa_alvo text,
  p_cnpj text,
  p_modo_principal text,
  p_score_oportunidade integer,
  p_resumo_dossie text,
  p_content jsonb
)
RETURNS public.dossier_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_run public.dossier_runs;
  v_attempt public.dossier_run_attempts;
  v_completed public.dossier_runs;
  v_now timestamptz;
BEGIN
  IF v_owner IS NULL OR p_run_id IS NULL OR p_attempt_id IS NULL
     OR p_fence_token IS NULL OR p_pipeline_version IS NULL
     OR pg_catalog.btrim(p_pipeline_version) = '' THEN
    RAISE EXCEPTION 'PERSISTENCE_FAILED' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
    INTO v_run
    FROM public.dossier_runs AS r
   WHERE r.run_id = p_run_id
     AND r.owner_id = v_owner
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.*
    INTO v_attempt
    FROM public.dossier_run_attempts AS a
   WHERE a.run_id = p_run_id
     AND a.attempt_id = p_attempt_id
   FOR UPDATE;

  IF NOT FOUND OR v_attempt.fence_token IS DISTINCT FROM p_fence_token
     OR v_attempt.pipeline_version IS DISTINCT FROM p_pipeline_version THEN
    RAISE EXCEPTION 'ATTEMPT_FENCE_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status = 'COMPLETED' AND v_attempt.status = 'COMPLETED' THEN
    RETURN public.persist_and_complete_dossier_run(
      p_run_id,
      p_fence_token::text,
      p_dossier_id,
      p_title,
      p_empresa_alvo,
      p_cnpj,
      p_modo_principal,
      p_score_oportunidade,
      p_resumo_dossie,
      p_content
    );
  END IF;

  v_now := pg_catalog.clock_timestamp();

  IF v_attempt.status <> 'RUNNING'
     OR v_run.status <> 'RUNNING'
     OR v_run.cancel_requested_at IS NOT NULL
     OR v_run.lease_owner IS DISTINCT FROM p_fence_token::text
     OR v_run.lease_expires_at IS NULL
     OR v_run.lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'ATTEMPT_LEASE_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  v_completed := public.persist_and_complete_dossier_run(
    p_run_id,
    p_fence_token::text,
    p_dossier_id,
    p_title,
    p_empresa_alvo,
    p_cnpj,
    p_modo_principal,
    p_score_oportunidade,
    p_resumo_dossie,
    p_content
  );

  UPDATE public.dossier_run_attempts
     SET status = 'COMPLETED',
         finished_at = v_now,
         updated_at = v_now,
         next_retry_at = NULL,
         error_code = NULL,
         error_stage = NULL
   WHERE attempt_id = p_attempt_id
     AND status = 'RUNNING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERSISTENCE_FAILED' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_completed;
END;
$$;

ALTER TABLE public.dossier_run_attempts OWNER TO postgres;
ALTER TABLE public.dossier_run_checkpoints OWNER TO postgres;

ALTER FUNCTION public.begin_dossier_run_attempt(uuid, text, integer) OWNER TO postgres;
ALTER FUNCTION public.renew_dossier_run_attempt_lease(uuid, uuid, uuid, integer) OWNER TO postgres;
ALTER FUNCTION public.record_dossier_run_checkpoint(uuid, uuid, uuid, text, text, integer, jsonb) OWNER TO postgres;
ALTER FUNCTION public.get_dossier_run_resume_state(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.schedule_dossier_run_retry(uuid, uuid, uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.fail_dossier_run_attempt(uuid, uuid, uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.cancel_dossier_run_attempt(uuid, uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.persist_and_complete_dossier_run_attempt(uuid, uuid, uuid, text, uuid, text, text, text, text, integer, text, jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.begin_dossier_run_attempt(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.renew_dossier_run_attempt_lease(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_dossier_run_checkpoint(uuid, uuid, uuid, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_dossier_run_resume_state(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.schedule_dossier_run_retry(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fail_dossier_run_attempt(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_dossier_run_attempt(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.persist_and_complete_dossier_run_attempt(uuid, uuid, uuid, text, uuid, text, text, text, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.begin_dossier_run_attempt(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_dossier_run_attempt_lease(uuid, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_dossier_run_checkpoint(uuid, uuid, uuid, text, text, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dossier_run_resume_state(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_dossier_run_retry(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_dossier_run_attempt(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_dossier_run_attempt(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.persist_and_complete_dossier_run_attempt(uuid, uuid, uuid, text, uuid, text, text, text, text, integer, text, jsonb) TO authenticated;

COMMENT ON TABLE public.dossier_run_attempts IS
  'DOSSIER-FLOW-05E.0C: durable attempt identity, retry state and fencing token. Runtime integration is a later adjudicated card.';

COMMENT ON TABLE public.dossier_run_checkpoints IS
  'DOSSIER-FLOW-05E.0C: immutable per-step resume payload and database-computed SHA-256 digest.';
