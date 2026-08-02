\set ON_ERROR_STOP on

-- Local-only contract proof. The harness replaces auth.uid() with a
-- request-claim reader; no Supabase remote connection is used.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

\set owner '11111111-1111-1111-1111-111111111111'
\set other '22222222-2222-2222-2222-222222222222'
\set run1 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set run2 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set run3 'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set run4 'dddddddd-dddd-dddd-dddd-dddddddddddd'
\set run5 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

RESET ROLE;
INSERT INTO auth.users (id, email)
VALUES
  (:'owner'::uuid, 'owner@example.test'),
  (:'other'::uuid, 'other@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, operator_id, email, name)
VALUES
  (:'owner'::uuid, 'op_contract_owner', 'owner@example.test', 'Contract Owner'),
  (:'other'::uuid, 'op_contract_other', 'other@example.test', 'Contract Other')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dossier_runs (
  run_id, owner_id, operator_id, status, idempotency_key, environment, app_version
)
VALUES
  (:'run1'::uuid, :'owner'::uuid, 'op_contract_owner', 'PENDING', 'contract-run-1', 'test', 'contract'),
  (:'run2'::uuid, :'owner'::uuid, 'op_contract_owner', 'PENDING', 'contract-run-2', 'test', 'contract'),
  (:'run3'::uuid, :'owner'::uuid, 'op_contract_owner', 'PENDING', 'contract-run-3', 'test', 'contract'),
  (:'run4'::uuid, :'owner'::uuid, 'op_contract_owner', 'PENDING', 'contract-run-4', 'test', 'contract'),
  (:'run5'::uuid, :'owner'::uuid, 'op_contract_owner', 'PENDING', 'contract-run-5', 'test', 'contract')
ON CONFLICT (run_id) DO NOTHING;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'owner', false);

-- First attempt: database-generated identity and fence.
SELECT payload->>'attempt_id' AS attempt_id,
       payload->>'fence_token' AS fence_token
  FROM (
    SELECT public.begin_dossier_run_attempt(:'run1'::uuid, 'v1', 30) AS payload
  ) AS q
\gset attempt1_
SELECT set_config('test.attempt1_id', :'attempt1_attempt_id', false);
SELECT set_config('test.attempt1_fence', :'attempt1_fence_token', false);

SELECT payload->>'checkpoint_id' AS checkpoint_id,
       payload->>'output_digest' AS output_digest
  FROM (
    SELECT public.record_dossier_run_checkpoint(
      :'run1'::uuid,
      current_setting('test.attempt1_id')::uuid,
      current_setting('test.attempt1_fence')::uuid,
      'v1',
      'foundation',
      0,
      '{"kind":"foundation","value":1}'::jsonb
    ) AS payload
  ) AS q
\gset checkpoint1_

DO $$
DECLARE
  v_resume jsonb;
BEGIN
  SELECT public.get_dossier_run_resume_state(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'v1'
  ) INTO v_resume;
  IF (v_resume->>'checkpoint_count')::integer <> 1
     OR v_resume->'checkpoints'->0->>'step_key' <> 'foundation'
     OR v_resume->'checkpoints'->0->'output_payload'->>'kind' <> 'foundation'
     OR v_resume::text LIKE '%fence_token%' THEN
    RAISE EXCEPTION 'resume projection mismatch';
  END IF;
END;
$$;

-- Equivalent checkpoint is idempotent and does not overwrite the first row.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT public.record_dossier_run_checkpoint(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    current_setting('test.attempt1_id')::uuid,
    current_setting('test.attempt1_fence')::uuid,
    'v1',
    'foundation',
    0,
    '{"value":1,"kind":"foundation"}'::jsonb
  ) INTO v_result;
  IF (v_result->>'idempotent')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'equivalent checkpoint was not idempotent';
  END IF;
END;
$$;

-- Divergent checkpoint, ordinal regression and oversized payload are explicit errors.
DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.record_dossier_run_checkpoint(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      current_setting('test.attempt1_id')::uuid,
      current_setting('test.attempt1_fence')::uuid,
      'v1', 'foundation', 0, '{"value":2}'::jsonb
    );
    RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  IF v_message <> 'CHECKPOINT_CONFLICT' THEN
    RAISE EXCEPTION 'unexpected divergent checkpoint error: %', v_message;
  END IF;
END;
$$;

SELECT public.record_dossier_run_checkpoint(
  :'run1'::uuid,
  current_setting('test.attempt1_id')::uuid,
  current_setting('test.attempt1_fence')::uuid,
  'v1',
  'second',
  2,
  '{"kind":"second"}'::jsonb
);

DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.record_dossier_run_checkpoint(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      current_setting('test.attempt1_id')::uuid,
      current_setting('test.attempt1_fence')::uuid,
      'v1', 'middle', 1, '{"kind":"middle"}'::jsonb
    );
    RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  IF v_message <> 'CHECKPOINT_OUT_OF_ORDER' THEN
    RAISE EXCEPTION 'unexpected ordinal error: %', v_message;
  END IF;
END;
$$;

DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.record_dossier_run_checkpoint(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      current_setting('test.attempt1_id')::uuid,
      current_setting('test.attempt1_fence')::uuid,
      'v1', 'oversized', 3,
      jsonb_build_object('blob', repeat('x', 1048575))
    );
    RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  IF v_message <> 'CHECKPOINT_PAYLOAD_TOO_LARGE' THEN
    RAISE EXCEPTION 'unexpected payload error: %', v_message;
  END IF;
END;
$$;

-- Retry is durable and retains checkpoints.
SELECT public.schedule_dossier_run_retry(
  :'run1'::uuid,
  :'attempt1_attempt_id'::uuid,
  :'attempt1_fence_token'::uuid,
  'PROVIDER_TIMEOUT',
  'foundation'
);

RESET ROLE;
UPDATE public.dossier_run_attempts
   SET next_retry_at = clock_timestamp() - interval '1 second',
       updated_at = clock_timestamp()
 WHERE attempt_id = :'attempt1_attempt_id'::uuid;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'owner', false);

SELECT payload->>'attempt_id' AS attempt_id,
       payload->>'fence_token' AS fence_token
  FROM (
    SELECT public.begin_dossier_run_attempt(:'run1'::uuid, 'v1', 30) AS payload
  ) AS q
\gset attempt2_
SELECT set_config('test.attempt2_id', :'attempt2_attempt_id', false);
SELECT set_config('test.attempt2_fence', :'attempt2_fence_token', false);

DO $$
DECLARE
  v_resume jsonb;
BEGIN
  SELECT public.get_dossier_run_resume_state(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'v1'
  ) INTO v_resume;
  IF (v_resume->>'attempts_consumed')::integer <> 2
     OR (v_resume->>'checkpoint_count')::integer <> 2 THEN
    RAISE EXCEPTION 'checkpoints did not survive retry';
  END IF;
END;
$$;

-- The old attempt cannot renew, checkpoint or finalize.
DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.renew_dossier_run_attempt_lease(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      current_setting('test.attempt1_id')::uuid,
      current_setting('test.attempt1_fence')::uuid,
      30
    );
    RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  IF v_message NOT IN ('ATTEMPT_FENCE_MISMATCH', 'ATTEMPT_LEASE_EXPIRED') THEN
    RAISE EXCEPTION 'unexpected stale lease error: %', v_message;
  END IF;
END;
$$;

DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.record_dossier_run_checkpoint(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      current_setting('test.attempt1_id')::uuid,
      current_setting('test.attempt1_fence')::uuid,
      'v1', 'stale', 3, '{"stale":true}'::jsonb
    );
    RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  IF v_message NOT IN ('ATTEMPT_FENCE_MISMATCH', 'ATTEMPT_LEASE_EXPIRED') THEN
    RAISE EXCEPTION 'unexpected stale checkpoint error: %', v_message;
  END IF;
END;
$$;

DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.get_dossier_run_resume_state(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'v2'
    );
    RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  IF v_message <> 'PIPELINE_VERSION_MISMATCH' THEN
    RAISE EXCEPTION 'unexpected pipeline error: %', v_message;
  END IF;
END;
$$;

SELECT public.record_dossier_run_checkpoint(
  :'run1'::uuid,
  :'attempt2_attempt_id'::uuid,
  :'attempt2_fence_token'::uuid,
  'v1',
  'retry-step',
  3,
  '{"kind":"retry"}'::jsonb
);

-- The database-computed digest is stable and matches SHA-256 of canonical JSONB text.
RESET ROLE;
DO $$
DECLARE
  v_stored text;
  v_expected text;
BEGIN
  SELECT c.output_digest,
         encode(extensions.digest(convert_to(c.output_payload::text, 'UTF8'), 'sha256'), 'hex')
    INTO v_stored, v_expected
    FROM public.dossier_run_checkpoints AS c
   WHERE c.run_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
     AND c.step_key = 'retry-step';
  IF v_stored IS NULL OR v_stored <> v_expected OR length(v_stored) <> 64 THEN
    RAISE EXCEPTION 'database digest mismatch';
  END IF;
END;
$$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'owner', false);

-- Pipeline mismatch is denied before resume.
DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.get_dossier_run_resume_state(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'v2'
    );
    RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  IF v_message <> 'PIPELINE_VERSION_MISMATCH' THEN
    RAISE EXCEPTION 'unexpected begin version error: %', v_message;
  END IF;
END;
$$;

-- Atomic success, equivalent completion and divergent conflict.
SELECT payload->>'attempt_id' AS attempt_id,
       payload->>'fence_token' AS fence_token
  FROM (
    SELECT public.begin_dossier_run_attempt(:'run2'::uuid, 'v1', 30) AS payload
  ) AS q
\gset success_
SELECT set_config('test.success_id', :'success_attempt_id', false);
SELECT set_config('test.success_fence', :'success_fence_token', false);

SELECT public.persist_and_complete_dossier_run_attempt(
  :'run2'::uuid,
  :'success_attempt_id'::uuid,
  :'success_fence_token'::uuid,
  'v1',
  '99999999-9999-9999-9999-999999999999'::uuid,
  'Contract dossier',
  'Empresa Contract',
  '99999999000199',
  'contract',
  80,
  'Resumo',
  '{"messages":[]}'::jsonb
);

SELECT public.persist_and_complete_dossier_run_attempt(
  :'run2'::uuid,
  :'success_attempt_id'::uuid,
  :'success_fence_token'::uuid,
  'v1',
  '99999999-9999-9999-9999-999999999999'::uuid,
  'Contract dossier',
  'Empresa Contract',
  '99999999000199',
  'contract',
  80,
  'Resumo',
  '{"messages":[]}'::jsonb
);

DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.persist_and_complete_dossier_run_attempt(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
      current_setting('test.success_id')::uuid,
      current_setting('test.success_fence')::uuid,
      'v1',
      '99999999-9999-9999-9999-999999999999'::uuid,
      'Divergent dossier',
      'Empresa Contract',
      '99999999000199',
      'contract',
      80,
      'Resumo',
      '{"messages":[]}'::jsonb
    );
    RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  IF v_message <> 'DOSSIER_CONFLICT' THEN
    RAISE EXCEPTION 'unexpected divergent completion error: %', v_message;
  END IF;
END;
$$;

-- Failure and cancellation are terminal and leave no dossier orphan.
SELECT payload->>'attempt_id' AS attempt_id,
       payload->>'fence_token' AS fence_token
  FROM (
    SELECT public.begin_dossier_run_attempt(:'run3'::uuid, 'v1', 30) AS payload
  ) AS q
\gset failure_
SELECT set_config('test.failure_id', :'failure_attempt_id', false);
SELECT set_config('test.failure_fence', :'failure_fence_token', false);

SELECT public.fail_dossier_run_attempt(
  :'run3'::uuid,
  :'failure_attempt_id'::uuid,
  :'failure_fence_token'::uuid,
  'MODEL_ERROR',
  'provider'
);

SELECT payload->>'attempt_id' AS attempt_id,
       payload->>'fence_token' AS fence_token
  FROM (
    SELECT public.begin_dossier_run_attempt(:'run4'::uuid, 'v1', 30) AS payload
  ) AS q
\gset cancel_
SELECT set_config('test.cancel_id', :'cancel_attempt_id', false);
SELECT set_config('test.cancel_fence', :'cancel_fence_token', false);

SELECT public.cancel_dossier_run_attempt(
  :'run4'::uuid,
  :'cancel_attempt_id'::uuid,
  :'cancel_fence_token'::uuid
);

DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.persist_and_complete_dossier_run_attempt(
      'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
      current_setting('test.cancel_id')::uuid,
      current_setting('test.cancel_fence')::uuid,
      'v1',
      '88888888-8888-8888-8888-888888888888'::uuid,
      'Cancelled',
      'Cancelled',
      NULL,
      'contract',
      1,
      'Cancelled',
      '{"messages":[]}'::jsonb
    );
    RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  IF v_message NOT IN ('ATTEMPT_FENCE_MISMATCH', 'ATTEMPT_LEASE_EXPIRED') THEN
    RAISE EXCEPTION 'late completion was not fenced: %', v_message;
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_run public.dossier_runs;
  v_attempt public.dossier_run_attempts;
  v_checkpoint_count integer;
BEGIN
  SELECT * INTO v_run FROM public.dossier_runs WHERE run_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
  SELECT * INTO v_attempt FROM public.dossier_run_attempts WHERE run_id = v_run.run_id;
  SELECT count(*) INTO v_checkpoint_count FROM public.dossier_run_checkpoints WHERE run_id = v_run.run_id;
  IF v_run.status <> 'COMPLETED' OR v_attempt.status <> 'COMPLETED'
     OR v_checkpoint_count <> 0
     OR NOT EXISTS (SELECT 1 FROM public.dossies WHERE id = v_run.dossier_id) THEN
    RAISE EXCEPTION 'atomic success state mismatch';
  END IF;

  SELECT * INTO v_run FROM public.dossier_runs WHERE run_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
  SELECT * INTO v_attempt FROM public.dossier_run_attempts WHERE run_id = v_run.run_id;
  IF v_run.status <> 'FAILED' OR v_attempt.status <> 'FAILED' THEN
    RAISE EXCEPTION 'atomic failure state mismatch';
  END IF;

  SELECT * INTO v_run FROM public.dossier_runs WHERE run_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid;
  SELECT * INTO v_attempt FROM public.dossier_run_attempts WHERE run_id = v_run.run_id;
  IF v_run.status <> 'CANCELLED' OR v_attempt.status <> 'CANCELLED'
     OR v_run.dossier_id IS NOT NULL THEN
    RAISE EXCEPTION 'atomic cancellation state mismatch';
  END IF;
END;
$$;

-- Identity and privilege matrix.
SELECT CASE WHEN has_table_privilege('anon', 'public.dossier_run_attempts', 'SELECT') THEN 0 ELSE 1 END AS anon_attempt_select_denied;
SELECT CASE WHEN has_table_privilege('authenticated', 'public.dossier_run_attempts', 'SELECT') THEN 0 ELSE 1 END AS auth_attempt_select_denied;
SELECT CASE WHEN has_table_privilege('service_role', 'public.dossier_run_checkpoints', 'INSERT') THEN 0 ELSE 1 END AS service_checkpoint_insert_denied;
SELECT CASE WHEN has_function_privilege('anon', 'public.begin_dossier_run_attempt(uuid,text,integer)', 'EXECUTE') THEN 0 ELSE 1 END AS anon_begin_denied;
SELECT CASE WHEN has_function_privilege('service_role', 'public.begin_dossier_run_attempt(uuid,text,integer)', 'EXECUTE') THEN 0 ELSE 1 END AS service_begin_denied;
SELECT CASE WHEN relrowsecurity AND relforcerowsecurity
            THEN 1 ELSE 0 END AS attempts_rls_forced
  FROM pg_class
 WHERE oid = 'public.dossier_run_attempts'::regclass;
SELECT CASE WHEN relrowsecurity AND relforcerowsecurity
            THEN 1 ELSE 0 END AS checkpoints_rls_forced
  FROM pg_class
 WHERE oid = 'public.dossier_run_checkpoints'::regclass;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'other', false);

DO $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.begin_dossier_run_attempt(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'v1', 30
    );
    RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  IF v_message <> 'RUN_NOT_FOUND' THEN
    RAISE EXCEPTION 'cross-owner access leaked: %', v_message;
  END IF;
END;
$$;

RESET ROLE;
SELECT 'CHECKPOINT_CONTRACT_LOCAL_FUNCTIONAL=PASS' AS evidence;
