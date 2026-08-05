-- =============================================================================
-- Teste SQL executável da RPC close_stale_dossier_runs (medida G)
-- -----------------------------------------------------------------------------
-- Deve rodar DEPOIS do replay completo das migrations (replay-migrations-local.sh).
-- Cobre, com PostgreSQL real (não mocks):
--   1. Fixtures: stale, lease ativa, janela de tolerância e estados terminais
--   2. dry-run não altera linhas
--   3. execução real fecha exatamente os elegíveis (status FAILED + lease liberado)
--   4. segunda execução é idempotente (0)
--   5. lote limitado funciona (p_batch_limit)
--   6. permissões: anon/authenticated são rejeitados; service_role executa
--   7. parâmetros inválidos são rejeitados
-- Falha com DO block que lança exceção (psql sai com código != 0).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Limpeza de estado anterior (permite reexecução)
-- -----------------------------------------------------------------------------
DELETE FROM public.dossier_runs WHERE operator_id = 'measure-g-test';
DELETE FROM auth.users WHERE email LIKE 'measure-g-test-%';

-- Usuário dono dos runs de teste (FK dossier_runs_owner_id_fkey → auth.users)
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (gen_random_uuid(), 'measure-g-test-owner@example.com', now(), now());

-- -----------------------------------------------------------------------------
-- 1. Fixtures
-- -----------------------------------------------------------------------------
-- stale-1: lease expirado há 2h (> janela de 1h) → elegível
-- stale-2: lease expirado há 90min (> janela de 1h) → elegível
-- active-1: lease ativa (expira em 30s) → NÃO elegível
-- grace-1: lease expirado há 30min (< janela de 1h) → NÃO elegível (tolerância)
-- done-1: COMPLETED com lease antiga → NÃO elegível (estado terminal)
-- failed-1: FAILED com lease antiga → NÃO elegível (estado terminal)
-- pending-1: PENDING sem lease → NÃO elegível
DO $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT id INTO v_owner FROM auth.users WHERE email = 'measure-g-test-owner@example.com';

  INSERT INTO public.dossier_runs
    (owner_id, operator_id, session_id, status, idempotency_key,
     lease_owner, lease_expires_at, environment, app_version, last_heartbeat_at)
  VALUES
    (v_owner, 'measure-g-test', NULL, 'RUNNING',   'stale-1',
     'owner-a', now() - interval '2 hours',    'test', 'test', now() - interval '2 hours'),
    (v_owner, 'measure-g-test', NULL, 'RUNNING',   'stale-2',
     'owner-b', now() - interval '90 minutes', 'test', 'test', now() - interval '90 minutes'),
    (v_owner, 'measure-g-test', NULL, 'RUNNING',   'active-1',
     'owner-c', now() + interval '30 seconds', 'test', 'test', now()),
    (v_owner, 'measure-g-test', NULL, 'RUNNING',   'grace-1',
     'owner-d', now() - interval '30 minutes', 'test', 'test', now() - interval '30 minutes'),
    (v_owner, 'measure-g-test', NULL, 'COMPLETED', 'done-1',
     'owner-e', now() - interval '2 hours',    'test', 'test', NULL),
    (v_owner, 'measure-g-test', NULL, 'FAILED',    'failed-1',
     'owner-f', now() - interval '2 hours',    'test', 'test', NULL),
    (v_owner, 'measure-g-test', NULL, 'PENDING',   'pending-1',
     NULL, NULL, 'test', 'test', NULL);
END $$;

-- -----------------------------------------------------------------------------
-- 2. dry-run: conta 2 candidatos e não muta nada
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_count INT;
  v_running INT;
BEGIN
  v_count := public.close_stale_dossier_runs(3600, 50, TRUE);
  ASSERT v_count = 2, 'dry-run deveria contar 2 candidatos (stale-1, stale-2)';

  SELECT COUNT(*) INTO v_running
    FROM public.dossier_runs
   WHERE operator_id = 'measure-g-test' AND status = 'RUNNING';
  ASSERT v_running = 4, 'dry-run não deveria alterar status (esperado 4 RUNNING)';
END $$;

-- -----------------------------------------------------------------------------
-- 3. Execução real: fecha exatamente 2 (lote 50 cobre todos) com o contrato certo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_count INT;
  v_row public.dossier_runs;
BEGIN
  v_count := public.close_stale_dossier_runs(3600, 50, FALSE);
  ASSERT v_count = 2, 'execução real deveria fechar 2 runs';

  SELECT * INTO v_row
    FROM public.dossier_runs
   WHERE operator_id = 'measure-g-test' AND idempotency_key = 'stale-1';
  ASSERT v_row.status = 'FAILED', 'stale-1 deveria estar FAILED';
  ASSERT v_row.error_code = 'STALE_RUN_LEASE_EXPIRED', 'error_code errado';
  ASSERT v_row.error_stage = 'stale_cleanup', 'error_stage errado';
  ASSERT v_row.lease_owner IS NULL, 'lease_owner deveria ser liberado';
  ASSERT v_row.lease_expires_at IS NULL, 'lease_expires_at deveria ser liberado';
  ASSERT v_row.failed_at IS NOT NULL, 'failed_at deveria estar preenchido';

  SELECT * INTO v_row
    FROM public.dossier_runs
   WHERE operator_id = 'measure-g-test' AND idempotency_key = 'active-1';
  ASSERT v_row.status = 'RUNNING', 'active-1 não deveria ser fechado';
END $$;

-- -----------------------------------------------------------------------------
-- 4. Idempotência: segunda execução retorna 0
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_count INT;
BEGIN
  v_count := public.close_stale_dossier_runs(3600, 50, FALSE);
  ASSERT v_count = 0, 'segunda execução deveria ser idempotente (0)';
END $$;

-- -----------------------------------------------------------------------------
-- 5. Lote limitado: 2 novos stale com p_batch_limit = 1 fecham 1 por chamada
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT id INTO v_owner FROM auth.users WHERE email = 'measure-g-test-owner@example.com';

  INSERT INTO public.dossier_runs
    (owner_id, operator_id, session_id, status, idempotency_key,
     lease_owner, lease_expires_at, environment, app_version, last_heartbeat_at)
  VALUES
    (v_owner, 'measure-g-test', NULL, 'RUNNING', 'batch-1',
     'owner-g', now() - interval '2 hours', 'test', 'test', now() - interval '2 hours'),
    (v_owner, 'measure-g-test', NULL, 'RUNNING', 'batch-2',
     'owner-h', now() - interval '2 hours', 'test', 'test', now() - interval '2 hours');
END $$;

DO $$
DECLARE
  v_count INT;
BEGIN
  v_count := public.close_stale_dossier_runs(3600, 1, FALSE);
  ASSERT v_count = 1, 'lote 1 deveria fechar exatamente 1';

  v_count := public.close_stale_dossier_runs(3600, 1, FALSE);
  ASSERT v_count = 1, 'segundo lote deveria fechar mais 1';

  v_count := public.close_stale_dossier_runs(3600, 1, FALSE);
  ASSERT v_count = 0, 'terceiro lote deveria fechar 0';
END $$;

-- -----------------------------------------------------------------------------
-- 6. Parâmetros inválidos são rejeitados
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_caught BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.close_stale_dossier_runs(0, 50, FALSE);
  EXCEPTION WHEN others THEN
    v_caught := TRUE;
  END;
  ASSERT v_caught, 'janela <= 0 deveria lançar exceção';

  v_caught := FALSE;
  BEGIN
    PERFORM public.close_stale_dossier_runs(3600, 5000, FALSE);
  EXCEPTION WHEN others THEN
    v_caught := TRUE;
  END;
  ASSERT v_caught, 'lote > 1000 deveria lançar exceção';
END $$;

-- -----------------------------------------------------------------------------
-- 7. Permissões efetivas: anon/authenticated NÃO executam; service_role executa
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_caught BOOLEAN := FALSE;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.close_stale_dossier_runs(3600, 50, TRUE);
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;
  RESET ROLE;
  ASSERT v_caught, 'anon não deveria executar a RPC';
END $$;

DO $$
DECLARE
  v_caught BOOLEAN := FALSE;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.close_stale_dossier_runs(3600, 50, TRUE);
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;
  RESET ROLE;
  ASSERT v_caught, 'authenticated não deveria executar a RPC';
END $$;

DO $$
DECLARE
  v_count INT;
BEGIN
  SET LOCAL ROLE service_role;
  v_count := public.close_stale_dossier_runs(3600, 50, TRUE);
  RESET ROLE;
  ASSERT v_count = 0, 'service_role deveria conseguir executar (dry-run, 0 candidatos restantes)';
END $$;

-- -----------------------------------------------------------------------------
-- 8. Limpeza
-- -----------------------------------------------------------------------------
DELETE FROM public.dossier_runs WHERE operator_id = 'measure-g-test';

SELECT 'TODOS OS ASSERTS DA MEDIDA G PASSARAM' AS resultado;
