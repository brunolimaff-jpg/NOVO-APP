\set ON_ERROR_STOP on

-- 05D.2A-R3: prova local descartável. Este arquivo nunca deve ser aplicado
-- em Supabase/Produção: o runner sempre aponta para um cluster local novo.

CREATE ROLE dossier_worker_executor
  NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE ROLE dossier_worker_v1
  LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD :'worker_v1_password';
CREATE ROLE dossier_worker_v2
  LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD :'worker_v2_password';
CREATE ROLE dossier_worker_unprivileged
  LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD :'unprivileged_password';
CREATE ROLE anon
  LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD :'anon_password';
CREATE ROLE authenticated
  LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD :'authenticated_password';
CREATE ROLE service_role
  LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD :'service_role_password';

GRANT dossier_worker_executor TO dossier_worker_v1;
GRANT dossier_worker_executor TO dossier_worker_v2;

CREATE SCHEMA dossier_proof;
CREATE SCHEMA dossier_proof_internal;
CREATE SCHEMA dossier_proof_api;

CREATE TABLE dossier_proof.dossier_runs (
  run_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  owner_id text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  worker_id text,
  lease_token text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz
);

CREATE TABLE dossier_proof.dossier_run_checkpoints (
  run_id text NOT NULL REFERENCES dossier_proof.dossier_runs(run_id),
  attempt integer NOT NULL CHECK (attempt > 0),
  checkpoint_key text NOT NULL,
  payload jsonb NOT NULL,
  is_complete boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, attempt, checkpoint_key)
);

CREATE TABLE dossier_proof.dossier_results (
  run_id text PRIMARY KEY REFERENCES dossier_proof.dossier_runs(run_id),
  payload jsonb NOT NULL,
  persisted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE dossier_proof.dossier_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id text NOT NULL REFERENCES dossier_proof.dossier_runs(run_id),
  event_type text NOT NULL,
  attempt integer,
  worker_id text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX dossier_runs_claim_idx
  ON dossier_proof.dossier_runs (status, next_attempt_at, created_at, run_id);

INSERT INTO dossier_proof.dossier_runs (run_id, tenant_id, owner_id)
VALUES
  ('run-concurrency', 'tenant-concurrency', 'owner-concurrency'),
  ('run-redelivery', 'tenant-redelivery', 'owner-redelivery'),
  ('run-checkpoint', 'tenant-checkpoint', 'owner-checkpoint'),
  ('run-idempotent', 'tenant-idempotent', 'owner-idempotent'),
  ('run-direct-table', 'tenant-direct-table', 'owner-direct-table');

CREATE OR REPLACE FUNCTION dossier_proof_internal.require_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
BEGIN
  IF NOT pg_has_role(session_user, 'dossier_worker_executor', 'member') THEN
    RAISE EXCEPTION 'worker role required (session_user=%)', session_user
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION dossier_proof_internal.require_run_lease(
  p_run_id text,
  p_attempt integer,
  p_worker_id text,
  p_lease_token text
)
RETURNS dossier_proof.dossier_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
DECLARE
  v_run dossier_proof.dossier_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_run
  FROM dossier_proof.dossier_runs
  WHERE run_id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'run not found: %', p_run_id USING ERRCODE = 'P0002';
  END IF;
  IF v_run.status <> 'RUNNING'
     OR v_run.attempts <> p_attempt
     OR v_run.worker_id IS DISTINCT FROM p_worker_id
     OR v_run.lease_token IS DISTINCT FROM p_lease_token
     OR v_run.lease_expires_at IS NULL
     OR v_run.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'stale or invalid worker lease for run %', p_run_id
      USING ERRCODE = '42501';
  END IF;
  RETURN v_run;
END;
$$;

CREATE OR REPLACE FUNCTION dossier_proof_internal.worker_claim_core(
  p_worker_id text,
  p_lease_seconds integer,
  p_hold_ms integer
)
RETURNS TABLE (
  run_id text,
  tenant_id text,
  owner_id text,
  worker_id text,
  lease_token text,
  attempt integer,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
DECLARE
  v_run dossier_proof.dossier_runs%ROWTYPE;
  v_attempt integer;
  v_token text;
  v_expires timestamptz;
BEGIN
  PERFORM dossier_proof_internal.require_worker();
  IF p_worker_id IS NULL OR btrim(p_worker_id) = '' THEN
    RAISE EXCEPTION 'worker_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_lease_seconds <= 0 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'lease_seconds out of range' USING ERRCODE = '22023';
  END IF;
  IF p_hold_ms < 0 OR p_hold_ms > 10000 THEN
    RAISE EXCEPTION 'hold_ms out of range' USING ERRCODE = '22023';
  END IF;

  SELECT r.* INTO v_run
  FROM dossier_proof.dossier_runs AS r
  WHERE r.status = 'PENDING'
    AND r.next_attempt_at <= clock_timestamp()
    AND r.attempts < 3
  ORDER BY r.created_at, r.run_id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_hold_ms > 0 THEN
    PERFORM pg_sleep(p_hold_ms / 1000.0);
  END IF;

  v_attempt := v_run.attempts + 1;
  v_token := md5(
    v_run.run_id || ':' || p_worker_id || ':' || v_attempt::text || ':'
      || clock_timestamp()::text || ':' || random()::text
  );
  v_expires := clock_timestamp() + make_interval(secs => p_lease_seconds);

  UPDATE dossier_proof.dossier_runs
  SET status = 'RUNNING',
      attempts = v_attempt,
      worker_id = p_worker_id,
      lease_token = v_token,
      lease_expires_at = v_expires
  WHERE dossier_runs.run_id = v_run.run_id;

  INSERT INTO dossier_proof.dossier_events (run_id, event_type, attempt, worker_id)
  VALUES (v_run.run_id, 'CLAIMED', v_attempt, p_worker_id);

  RETURN QUERY SELECT v_run.run_id, v_run.tenant_id, v_run.owner_id,
    p_worker_id, v_token, v_attempt, v_expires;
END;
$$;

CREATE OR REPLACE FUNCTION dossier_proof_internal.worker_renew_core(
  p_run_id text,
  p_attempt integer,
  p_worker_id text,
  p_lease_token text,
  p_lease_seconds integer
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
DECLARE
  v_run dossier_proof.dossier_runs%ROWTYPE;
  v_expires timestamptz;
BEGIN
  PERFORM dossier_proof_internal.require_worker();
  IF p_lease_seconds <= 0 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'lease_seconds out of range' USING ERRCODE = '22023';
  END IF;
  v_run := dossier_proof_internal.require_run_lease(p_run_id, p_attempt, p_worker_id, p_lease_token);
  v_expires := clock_timestamp() + make_interval(secs => p_lease_seconds);
  UPDATE dossier_proof.dossier_runs
  SET lease_expires_at = v_expires
  WHERE run_id = v_run.run_id;
  RETURN v_expires;
END;
$$;

CREATE OR REPLACE FUNCTION dossier_proof_internal.record_checkpoint_core(
  p_run_id text,
  p_attempt integer,
  p_worker_id text,
  p_lease_token text,
  p_checkpoint_key text,
  p_payload jsonb,
  p_is_complete boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
DECLARE
  v_existing dossier_proof.dossier_run_checkpoints%ROWTYPE;
BEGIN
  PERFORM dossier_proof_internal.require_worker();
  IF p_checkpoint_key IS NULL OR btrim(p_checkpoint_key) = '' THEN
    RAISE EXCEPTION 'checkpoint_key is required' USING ERRCODE = '22023';
  END IF;
  PERFORM dossier_proof_internal.require_run_lease(p_run_id, p_attempt, p_worker_id, p_lease_token);

  SELECT * INTO v_existing
  FROM dossier_proof.dossier_run_checkpoints
  WHERE run_id = p_run_id AND attempt = p_attempt AND checkpoint_key = p_checkpoint_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload IS DISTINCT FROM p_payload
       OR v_existing.is_complete IS DISTINCT FROM p_is_complete THEN
      RAISE EXCEPTION 'divergent checkpoint payload for %, attempt %, key %',
        p_run_id, p_attempt, p_checkpoint_key USING ERRCODE = '23505';
    END IF;
    RETURN 'IDEMPOTENT';
  END IF;

  INSERT INTO dossier_proof.dossier_run_checkpoints
    (run_id, attempt, checkpoint_key, payload, is_complete)
  VALUES (p_run_id, p_attempt, p_checkpoint_key, p_payload, p_is_complete);
  INSERT INTO dossier_proof.dossier_events (run_id, event_type, attempt, worker_id)
  VALUES (p_run_id, 'CHECKPOINT', p_attempt, p_worker_id);
  RETURN 'RECORDED';
END;
$$;

CREATE OR REPLACE FUNCTION dossier_proof_internal.schedule_retry_core(
  p_run_id text,
  p_attempt integer,
  p_worker_id text,
  p_lease_token text,
  p_delay_seconds integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
DECLARE
  v_run dossier_proof.dossier_runs%ROWTYPE;
BEGIN
  PERFORM dossier_proof_internal.require_worker();
  IF p_delay_seconds < 0 OR p_delay_seconds > 3600 THEN
    RAISE EXCEPTION 'delay_seconds out of range' USING ERRCODE = '22023';
  END IF;
  v_run := dossier_proof_internal.require_run_lease(p_run_id, p_attempt, p_worker_id, p_lease_token);
  IF v_run.attempts >= 3 THEN
    RAISE EXCEPTION 'retry limit exhausted' USING ERRCODE = '55000';
  END IF;
  UPDATE dossier_proof.dossier_runs
  SET status = 'PENDING',
      next_attempt_at = clock_timestamp() + make_interval(secs => p_delay_seconds),
      worker_id = NULL,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE run_id = p_run_id;
  INSERT INTO dossier_proof.dossier_events (run_id, event_type, attempt, worker_id)
  VALUES (p_run_id, 'RETRY_SCHEDULED', p_attempt, p_worker_id);
  RETURN 'RETRY_SCHEDULED';
END;
$$;

CREATE OR REPLACE FUNCTION dossier_proof_internal.reconcile_core(p_run_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
DECLARE
  v_run dossier_proof.dossier_runs%ROWTYPE;
BEGIN
  PERFORM dossier_proof_internal.require_worker();
  SELECT * INTO v_run
  FROM dossier_proof.dossier_runs
  WHERE run_id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run not found: %', p_run_id USING ERRCODE = 'P0002';
  END IF;
  IF v_run.status = 'RUNNING' AND v_run.lease_expires_at <= clock_timestamp() THEN
    UPDATE dossier_proof.dossier_runs
    SET status = 'PENDING',
        next_attempt_at = clock_timestamp(),
        worker_id = NULL,
        lease_token = NULL,
        lease_expires_at = NULL
    WHERE run_id = p_run_id;
    INSERT INTO dossier_proof.dossier_events (run_id, event_type, attempt)
    VALUES (p_run_id, 'LEASE_EXPIRED_REDELIVERY', v_run.attempts);
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION dossier_proof_internal.mark_cancelled_core(
  p_run_id text,
  p_attempt integer,
  p_worker_id text,
  p_lease_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
BEGIN
  PERFORM dossier_proof_internal.require_worker();
  PERFORM dossier_proof_internal.require_run_lease(p_run_id, p_attempt, p_worker_id, p_lease_token);
  UPDATE dossier_proof.dossier_runs
  SET status = 'CANCELLED', worker_id = NULL, lease_token = NULL, lease_expires_at = NULL,
      completed_at = clock_timestamp()
  WHERE run_id = p_run_id;
  RETURN 'CANCELLED';
END;
$$;

CREATE OR REPLACE FUNCTION dossier_proof_internal.mark_failed_core(
  p_run_id text,
  p_attempt integer,
  p_worker_id text,
  p_lease_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
BEGIN
  PERFORM dossier_proof_internal.require_worker();
  PERFORM dossier_proof_internal.require_run_lease(p_run_id, p_attempt, p_worker_id, p_lease_token);
  UPDATE dossier_proof.dossier_runs
  SET status = 'FAILED', worker_id = NULL, lease_token = NULL, lease_expires_at = NULL,
      completed_at = clock_timestamp()
  WHERE run_id = p_run_id;
  RETURN 'FAILED';
END;
$$;

CREATE OR REPLACE FUNCTION dossier_proof_internal.persist_complete_core(
  p_run_id text,
  p_attempt integer,
  p_worker_id text,
  p_lease_token text,
  p_payload jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
DECLARE
  v_existing jsonb;
  v_run dossier_proof.dossier_runs%ROWTYPE;
BEGIN
  PERFORM dossier_proof_internal.require_worker();

  SELECT payload INTO v_existing
  FROM dossier_proof.dossier_results
  WHERE run_id = p_run_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'divergent completion payload for %', p_run_id USING ERRCODE = '23505';
    END IF;
    RETURN 'COMPLETED_IDEMPOTENT';
  END IF;

  v_run := dossier_proof_internal.require_run_lease(p_run_id, p_attempt, p_worker_id, p_lease_token);
  INSERT INTO dossier_proof.dossier_results (run_id, payload)
  VALUES (p_run_id, p_payload);
  UPDATE dossier_proof.dossier_runs
  SET status = 'COMPLETED', worker_id = NULL, lease_token = NULL, lease_expires_at = NULL,
      completed_at = clock_timestamp()
  WHERE run_id = v_run.run_id;
  INSERT INTO dossier_proof.dossier_events (run_id, event_type, attempt, worker_id)
  VALUES (p_run_id, 'COMPLETED', p_attempt, p_worker_id);
  RETURN 'COMPLETED';
END;
$$;

CREATE OR REPLACE FUNCTION dossier_proof_internal.pooler_compatibility_probe()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof_internal
AS $$
BEGIN
  PERFORM dossier_proof_internal.require_worker();
  -- Deliberadamente não usa SET ROLE persistente, temp table, advisory lock,
  -- session variable ou prepared statement. Cada chamada é autocontida.
  RETURN 'PASS';
END;
$$;

-- Wrappers públicos do contrato worker-only. A identidade vem da sessão
-- PostgreSQL (session_user + membership); tenant/owner vêm do run reclamado.
CREATE OR REPLACE FUNCTION dossier_proof_api.worker_claim_dossier_run(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 2,
  p_hold_ms integer DEFAULT 0
)
RETURNS TABLE (
  run_id text,
  tenant_id text,
  owner_id text,
  worker_id text,
  lease_token text,
  attempt integer,
  lease_expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof, dossier_proof_internal
AS $$ SELECT * FROM dossier_proof_internal.worker_claim_core($1, $2, $3) $$;

CREATE OR REPLACE FUNCTION dossier_proof_api.worker_renew_dossier_run(
  p_run_id text, p_attempt integer, p_worker_id text, p_lease_token text,
  p_lease_seconds integer DEFAULT 2
)
RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof, dossier_proof_internal
AS $$ SELECT dossier_proof_internal.worker_renew_core($1, $2, $3, $4, $5) $$;

CREATE OR REPLACE FUNCTION dossier_proof_api.worker_record_dossier_checkpoint(
  p_run_id text, p_attempt integer, p_worker_id text, p_lease_token text,
  p_checkpoint_key text, p_payload jsonb, p_is_complete boolean DEFAULT false
)
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof, dossier_proof_internal
AS $$ SELECT dossier_proof_internal.record_checkpoint_core($1, $2, $3, $4, $5, $6, $7) $$;

CREATE OR REPLACE FUNCTION dossier_proof_api.worker_schedule_dossier_retry(
  p_run_id text, p_attempt integer, p_worker_id text, p_lease_token text,
  p_delay_seconds integer DEFAULT 0
)
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof, dossier_proof_internal
AS $$ SELECT dossier_proof_internal.schedule_retry_core($1, $2, $3, $4, $5) $$;

CREATE OR REPLACE FUNCTION dossier_proof_api.worker_reconcile_dossier_run(p_run_id text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof, dossier_proof_internal
AS $$ SELECT dossier_proof_internal.reconcile_core($1) $$;

CREATE OR REPLACE FUNCTION dossier_proof_api.worker_mark_dossier_cancelled(
  p_run_id text, p_attempt integer, p_worker_id text, p_lease_token text
)
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof, dossier_proof_internal
AS $$ SELECT dossier_proof_internal.mark_cancelled_core($1, $2, $3, $4) $$;

CREATE OR REPLACE FUNCTION dossier_proof_api.worker_mark_dossier_failed(
  p_run_id text, p_attempt integer, p_worker_id text, p_lease_token text
)
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof, dossier_proof_internal
AS $$ SELECT dossier_proof_internal.mark_failed_core($1, $2, $3, $4) $$;

CREATE OR REPLACE FUNCTION dossier_proof_api.worker_persist_and_complete_dossier_run(
  p_run_id text, p_attempt integer, p_worker_id text, p_lease_token text, p_payload jsonb
)
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof, dossier_proof_internal
AS $$ SELECT dossier_proof_internal.persist_complete_core($1, $2, $3, $4, $5) $$;

CREATE OR REPLACE FUNCTION dossier_proof_api.worker_pooler_compatibility_probe()
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof, dossier_proof_internal
AS $$ SELECT dossier_proof_internal.pooler_compatibility_probe() $$;

-- Wrapper conceitual separado: não é concedido ao worker e não é usado no
-- caminho deste lote. Não delega autoridade ao token/owner do usuário.
CREATE OR REPLACE FUNCTION dossier_proof_api.authenticated_persist_and_complete_dossier_run(
  p_run_id text, p_payload jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, dossier_proof, dossier_proof_internal
AS $$
BEGIN
  IF NOT pg_has_role(session_user, 'authenticated', 'member') THEN
    RAISE EXCEPTION 'authenticated role required' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'authenticated path is separate from worker path'
    USING ERRCODE = '0A000';
END;
$$;

-- A role worker só pode usar os wrappers. Nenhum acesso genérico às tabelas
-- ou ao núcleo interno é concedido; PUBLIC, anon, authenticated e
-- service_role permanecem explicitamente revogados.
REVOKE ALL ON SCHEMA dossier_proof, dossier_proof_internal, dossier_proof_api FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA dossier_proof FROM PUBLIC, dossier_worker_executor,
  dossier_worker_v1, dossier_worker_v2, dossier_worker_unprivileged,
  anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA dossier_proof FROM PUBLIC, dossier_worker_executor,
  dossier_worker_v1, dossier_worker_v2, dossier_worker_unprivileged,
  anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dossier_proof_internal FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dossier_proof_api FROM PUBLIC;

GRANT USAGE ON SCHEMA dossier_proof_api TO dossier_worker_executor;
GRANT EXECUTE ON FUNCTION dossier_proof_api.worker_claim_dossier_run(text, integer, integer)
  TO dossier_worker_executor;
GRANT EXECUTE ON FUNCTION dossier_proof_api.worker_renew_dossier_run(text, integer, text, text, integer)
  TO dossier_worker_executor;
GRANT EXECUTE ON FUNCTION dossier_proof_api.worker_record_dossier_checkpoint(text, integer, text, text, text, jsonb, boolean)
  TO dossier_worker_executor;
GRANT EXECUTE ON FUNCTION dossier_proof_api.worker_schedule_dossier_retry(text, integer, text, text, integer)
  TO dossier_worker_executor;
GRANT EXECUTE ON FUNCTION dossier_proof_api.worker_reconcile_dossier_run(text)
  TO dossier_worker_executor;
GRANT EXECUTE ON FUNCTION dossier_proof_api.worker_mark_dossier_cancelled(text, integer, text, text)
  TO dossier_worker_executor;
GRANT EXECUTE ON FUNCTION dossier_proof_api.worker_mark_dossier_failed(text, integer, text, text)
  TO dossier_worker_executor;
GRANT EXECUTE ON FUNCTION dossier_proof_api.worker_persist_and_complete_dossier_run(text, integer, text, text, jsonb)
  TO dossier_worker_executor;
GRANT EXECUTE ON FUNCTION dossier_proof_api.worker_pooler_compatibility_probe()
  TO dossier_worker_executor;

-- O executor só herda os EXECUTE acima; nenhum login individual recebe grant
-- adicional. O owner administrativo é o único que prepara o banco descartável.
ALTER ROLE dossier_worker_v1 SET search_path = pg_catalog;
ALTER ROLE dossier_worker_v2 SET search_path = pg_catalog;
ALTER ROLE dossier_worker_unprivileged SET search_path = pg_catalog;
ALTER ROLE anon SET search_path = pg_catalog;
ALTER ROLE authenticated SET search_path = pg_catalog;
ALTER ROLE service_role SET search_path = pg_catalog;

SELECT 'SETUP_READY=PASS' AS gate;
