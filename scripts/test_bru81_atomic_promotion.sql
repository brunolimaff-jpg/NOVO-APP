-- ============================================================================
-- BRU-81 — TDD SQL da promoção atômica (complete_dossier_run_with_dossier)
-- Uso: psql -d <banco_descartavel> -v ON_ERROR_STOP=1 -f scripts/test_bru81_atomic_promotion.sql
-- NUNCA executar em Produção.
-- Provas: sucesso · lease errada · owner errado · session mismatch ·
--         cancelled/failed · replay divergente · ROLLBACK pós-UPSERT (atomicidade).
-- ============================================================================

BEGIN;

-- 0. Identidades fixas
--    operador A (dono do dossiê B e do run) · operador B (intruso)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  operator_id TEXT UNIQUE,
  email TEXT,
  name TEXT
);

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@teste.com'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@teste.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, operator_id, email, name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'op_a', 'a@teste.com', 'Operador A'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'op_b', 'b@teste.com', 'Operador B')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'role authenticated ausente — rodar bootstrap de auth antes';
  END IF;
END $$;

-- auth.uid() real: lê o JWT simulado via request.jwt.claims
-- (o bootstrap de replay cria um stub que retorna NULL — substituímos aqui)
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid
$$;

-- helper: simula o JWT do usuário autenticado (auth.uid())
CREATE OR REPLACE FUNCTION test_set_jwt(p_sub uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub::text)::text, true);
$$;

-- helper: snapshot JSON do dossiê (mesma forma do cliente prepareDossierForPersistence)
CREATE OR REPLACE FUNCTION test_snapshot(p_thread uuid, p_title text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'id', p_thread,
    'title', p_title,
    'empresaAlvo', 'Acme Agro',
    'cnpj', '12345678000190',
    'modoPrincipal', 'investigacao',
    'scoreOportunidade', 72,
    'resumoDossie', p_title || ' resumo',
    'updatedAt', '2026-08-12T17:00:00Z',
    'messages', jsonb_build_array(jsonb_build_object('sender', 'Bot', 'text', p_title))
  );
$$;

-- fixture: dossiê B antigo (OLD)
INSERT INTO public.dossies (id, operator_id, title, empresa_alvo, cnpj, modo_principal, score_oportunidade, resumo_dossie, content, updated_at)
VALUES (
  'cccccccc-0000-4000-8000-000000000003', 'op_a', 'Antigo', 'Acme Agro', '12345678000190',
  'investigacao', 70, 'resumo antigo',
  jsonb_build_object('id', 'cccccccc-0000-4000-8000-000000000003', 'messages', jsonb_build_array(jsonb_build_object('sender','Bot','text','OLD CONTENT'))),
  '2026-08-12T10:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

-- helper: cria um run RUNNING com lease
CREATE OR REPLACE FUNCTION test_create_running_run(
  p_run uuid, p_owner uuid, p_operator text, p_session uuid, p_lease text
) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.dossier_runs (run_id, owner_id, operator_id, session_id, status, idempotency_key, lease_owner, environment, app_version)
  VALUES (p_run, p_owner, p_operator, p_session, 'RUNNING', 'idem_' || p_run::text, p_lease, 'test', 'test');
$$;

-- helper: lê o content do dossiê
CREATE OR REPLACE FUNCTION test_dossier_content(p_thread uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT content FROM public.dossies WHERE id = p_thread;
$$;

-- ============================================================================
-- 1. SUCESSO — B OLD → promoção NEW → B = NEW, run COMPLETED, dossier_id = B
-- ============================================================================
DO $$
DECLARE v_run public.dossier_runs;
BEGIN
  PERFORM test_set_jwt('aaaaaaaa-0000-4000-8000-000000000001');
  PERFORM test_create_running_run('11111111-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000001', 'op_a', 'cccccccc-0000-4000-8000-000000000003', 'lease-1');

  v_run := public.complete_dossier_run_with_dossier(
    '11111111-0000-4000-8000-000000000011', 'lease-1',
    test_snapshot('cccccccc-0000-4000-8000-000000000003', 'NOVO')
  );

  IF v_run.status <> 'COMPLETED' THEN RAISE EXCEPTION 'ASSERT-1-FAIL: status=%', v_run.status; END IF;
  IF v_run.dossier_id <> 'cccccccc-0000-4000-8000-000000000003' THEN RAISE EXCEPTION 'ASSERT-1-FAIL: dossier_id=%', v_run.dossier_id; END IF;
  IF v_run.lease_owner IS NOT NULL THEN RAISE EXCEPTION 'ASSERT-1-FAIL: lease nao limpa'; END IF;
  IF (test_dossier_content('cccccccc-0000-4000-8000-000000000003')->'messages'->0->>'text') <> 'NOVO' THEN
    RAISE EXCEPTION 'ASSERT-1-FAIL: B nao foi promovido para NOVO';
  END IF;
END $$;

-- ============================================================================
-- 2. LEASE INCORRETA — falha; B continua exatamente OLD; run não COMPLETED
-- ============================================================================
DO $$
DECLARE v_failed boolean := false;
BEGIN
  PERFORM test_set_jwt('aaaaaaaa-0000-4000-8000-000000000001');
  PERFORM test_create_running_run('22222222-0000-4000-8000-000000000022', 'aaaaaaaa-0000-4000-8000-000000000001', 'op_a', 'cccccccc-0000-4000-8000-000000000003', 'lease-2');

  BEGIN
    PERFORM public.complete_dossier_run_with_dossier(
      '22222222-0000-4000-8000-000000000022', 'lease-INTRUSA',
      test_snapshot('cccccccc-0000-4000-8000-000000000003', 'INVASOR')
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;

  IF NOT v_failed THEN RAISE EXCEPTION 'ASSERT-2-FAIL: RPC deveria falhar com lease errada'; END IF;
  IF (test_dossier_content('cccccccc-0000-4000-8000-000000000003')->'messages'->0->>'text') <> 'NOVO' THEN
    RAISE EXCEPTION 'ASSERT-2-FAIL: B foi alterado com lease errada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dossier_runs WHERE run_id='22222222-0000-4000-8000-000000000022' AND status='COMPLETED') THEN
    RAISE EXCEPTION 'ASSERT-2-FAIL: run promovido com lease errada';
  END IF;
END $$;

-- ============================================================================
-- 3. OWNER INCORRETO — operador B não promove run/dossiê do A; zero alteração
-- ============================================================================
DO $$
DECLARE v_failed boolean := false;
BEGIN
  PERFORM test_set_jwt('aaaaaaaa-0000-4000-8000-000000000001');
  PERFORM test_create_running_run('33333333-0000-4000-8000-000000000033', 'aaaaaaaa-0000-4000-8000-000000000001', 'op_a', 'cccccccc-0000-4000-8000-000000000003', 'lease-3');

  PERFORM test_set_jwt('bbbbbbbb-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.complete_dossier_run_with_dossier(
      '33333333-0000-4000-8000-000000000033', 'lease-3',
      test_snapshot('cccccccc-0000-4000-8000-000000000003', 'INVASOR-B')
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;

  IF NOT v_failed THEN RAISE EXCEPTION 'ASSERT-3-FAIL: operador B promoveu run do A'; END IF;
  IF (test_dossier_content('cccccccc-0000-4000-8000-000000000003')->'messages'->0->>'text') <> 'NOVO' THEN
    RAISE EXCEPTION 'ASSERT-3-FAIL: B alterado por operador intruso';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dossier_runs WHERE run_id='33333333-0000-4000-8000-000000000033' AND status='COMPLETED') THEN
    RAISE EXCEPTION 'ASSERT-3-FAIL: run do A completado por B';
  END IF;
END $$;

-- ============================================================================
-- 4. SESSION MISMATCH — payload id ≠ run.session_id → zero alteração
-- ============================================================================
DO $$
DECLARE v_failed boolean := false;
BEGIN
  PERFORM test_set_jwt('aaaaaaaa-0000-4000-8000-000000000001');
  PERFORM test_create_running_run('44444444-0000-4000-8000-000000000044', 'aaaaaaaa-0000-4000-8000-000000000001', 'op_a', 'cccccccc-0000-4000-8000-000000000003', 'lease-4');

  BEGIN
    PERFORM public.complete_dossier_run_with_dossier(
      '44444444-0000-4000-8000-000000000044', 'lease-4',
      test_snapshot('dddddddd-0000-4000-8000-000000000004', 'OUTRA-THREAD')
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;

  IF NOT v_failed THEN RAISE EXCEPTION 'ASSERT-4-FAIL: session mismatch aceito'; END IF;
  IF EXISTS (SELECT 1 FROM public.dossies WHERE id = 'dddddddd-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'ASSERT-4-FAIL: dossiê de outra thread criado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dossier_runs WHERE run_id='44444444-0000-4000-8000-000000000044' AND status='COMPLETED') THEN
    RAISE EXCEPTION 'ASSERT-4-FAIL: run promovido com session mismatch';
  END IF;
END $$;

-- ============================================================================
-- 5. CANCELLED/FAILED — run terminal não pode ser promovido; B permanece
-- ============================================================================
DO $$
DECLARE v_failed boolean := false;
BEGIN
  PERFORM test_set_jwt('aaaaaaaa-0000-4000-8000-000000000001');
  INSERT INTO public.dossier_runs (run_id, owner_id, operator_id, session_id, status, idempotency_key, environment, app_version)
  VALUES ('55555555-0000-4000-8000-000000000055', 'aaaaaaaa-0000-4000-8000-000000000001', 'op_a', 'cccccccc-0000-4000-8000-000000000003', 'CANCELLED', 'idem_55', 'test', 'test');

  BEGIN
    PERFORM public.complete_dossier_run_with_dossier(
      '55555555-0000-4000-8000-000000000055', 'lease-5',
      test_snapshot('cccccccc-0000-4000-8000-000000000003', 'TARDE-DEMAIS')
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;

  IF NOT v_failed THEN RAISE EXCEPTION 'ASSERT-5-FAIL: run CANCELLED promovido'; END IF;
  IF (test_dossier_content('cccccccc-0000-4000-8000-000000000003')->'messages'->0->>'text') <> 'NOVO' THEN
    RAISE EXCEPTION 'ASSERT-5-FAIL: B alterado por run terminal';
  END IF;
END $$;

-- ============================================================================
-- 6. REPLAY DIVERGENTE — primeira promoção NEW-1; replay com NEW-2 retorna o
--    terminal existente SEM reescrever; B continua NEW-1
-- ============================================================================
DO $$
DECLARE v_run public.dossier_runs; v_failed boolean := false;
BEGIN
  PERFORM test_set_jwt('aaaaaaaa-0000-4000-8000-000000000001');
  PERFORM test_create_running_run('66666666-0000-4000-8000-000000000066', 'aaaaaaaa-0000-4000-8000-000000000001', 'op_a', 'cccccccc-0000-4000-8000-000000000003', 'lease-6');

  -- primeira promoção (NEW-1)
  v_run := public.complete_dossier_run_with_dossier(
    '66666666-0000-4000-8000-000000000066', 'lease-6',
    test_snapshot('cccccccc-0000-4000-8000-000000000003', 'NEW-1')
  );
  IF v_run.status <> 'COMPLETED' THEN RAISE EXCEPTION 'ASSERT-6-FAIL: primeira promoção falhou'; END IF;

  -- replay da MESMA promoção (payload idêntico ao terminal): retorna terminal sem reescrever
  v_run := public.complete_dossier_run_with_dossier(
    '66666666-0000-4000-8000-000000000066', 'lease-6',
    test_snapshot('cccccccc-0000-4000-8000-000000000003', 'NEW-1')
  );
  IF v_run.status <> 'COMPLETED' THEN RAISE EXCEPTION 'ASSERT-6-FAIL: replay não retornou terminal'; END IF;

  -- replay DIVERGENTE (tenta trocar o conteúdo de run concluído): rejeitado
  BEGIN
    PERFORM public.complete_dossier_run_with_dossier(
      '66666666-0000-4000-8000-000000000066', 'lease-6',
      test_snapshot('cccccccc-0000-4000-8000-000000000003', 'NEW-2')
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'ASSERT-6-FAIL: replay divergente aceito'; END IF;

  IF (test_dossier_content('cccccccc-0000-4000-8000-000000000003')->'messages'->0->>'text') <> 'NEW-1' THEN
    RAISE EXCEPTION 'ASSERT-6-FAIL: B reescrito por replay';
  END IF;
END $$;

-- ============================================================================
-- 7. ROLLBACK PÓS-UPSERT (atomicidade) — trigger força erro no update terminal
--    DEPOIS do UPSERT de dossies; a transação inteira volta; B continua OLD
-- ============================================================================
DO $do7$
DECLARE v_failed boolean := false;
BEGIN
  -- trigger de teste: falha o UPDATE final do run (após o UPSERT do dossiê)
  CREATE OR REPLACE FUNCTION test_force_terminal_failure() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    RAISE EXCEPTION 'forced terminal update failure';
  END;
  $fn$;
  DROP TRIGGER IF EXISTS trg_test_force_fail ON public.dossier_runs;
  CREATE TRIGGER trg_test_force_fail
    BEFORE UPDATE OF status ON public.dossier_runs
    FOR EACH ROW
    WHEN (NEW.status = 'COMPLETED')
    EXECUTE FUNCTION test_force_terminal_failure();

  PERFORM test_set_jwt('aaaaaaaa-0000-4000-8000-000000000001');
  PERFORM test_create_running_run('77777777-0000-4000-8000-000000000077', 'aaaaaaaa-0000-4000-8000-000000000001', 'op_a', 'cccccccc-0000-4000-8000-000000000003', 'lease-7');

  BEGIN
    PERFORM public.complete_dossier_run_with_dossier(
      '77777777-0000-4000-8000-000000000077', 'lease-7',
      test_snapshot('cccccccc-0000-4000-8000-000000000003', 'PARCIAL')
    );
  EXCEPTION WHEN OTHERS THEN v_failed := true; END;

  IF NOT v_failed THEN RAISE EXCEPTION 'ASSERT-7-FAIL: trigger não derrubou a promoção'; END IF;

  -- PROVA DA ATOMICIDADE: o UPSERT de dossies também foi desfeito
  IF (test_dossier_content('cccccccc-0000-4000-8000-000000000003')->'messages'->0->>'text') <> 'NEW-1' THEN
    RAISE EXCEPTION 'ASSERT-7-FAIL: B alterado mesmo com rollback (UPSERT não desfeito)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dossier_runs WHERE run_id='77777777-0000-4000-8000-000000000077' AND status='COMPLETED') THEN
    RAISE EXCEPTION 'ASSERT-7-FAIL: run COMPLETED apesar do rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dossier_runs WHERE run_id='77777777-0000-4000-8000-000000000077' AND status <> 'RUNNING') THEN
    RAISE EXCEPTION 'ASSERT-7-FAIL: run não continua RUNNING após rollback';
  END IF;

  DROP TRIGGER IF EXISTS trg_test_force_fail ON public.dossier_runs;
  DROP FUNCTION IF EXISTS test_force_terminal_failure();
END $do7$;

-- ============================================================================
-- 8. AUTOSAVE SERVER-SIDE (containment vinculado à escrita) — run RUNNING → PULADO
-- ============================================================================
DO $do8$
DECLARE v_failed boolean := false;
BEGIN
  PERFORM test_set_jwt('aaaaaaaa-0000-4000-8000-000000000001');
  PERFORM test_create_running_run('88888888-0000-4000-8000-000000000088', 'aaaaaaaa-0000-4000-8000-000000000001', 'op_a', 'cccccccc-0000-4000-8000-000000000003', 'lease-8');

  -- Lote do autosave: B (thread com run RUNNING, mid-flight PARCIAL) + C (normal)
  PERFORM public.save_dossiers_autosave(
    jsonb_build_array(
      test_snapshot('cccccccc-0000-4000-8000-000000000003', 'MIDFLIGHT-PARCIAL'),
      test_snapshot('dddddddd-0000-4000-8000-000000000004', 'SESSAO-C')
    )
  );

  -- PROPRIEDADE CENTRAL: B com run ativo NÃO foi gravada (permanece NEW-1 do cenário 6)
  IF (test_dossier_content('cccccccc-0000-4000-8000-000000000003')->'messages'->0->>'text') <> 'NEW-1' THEN
    RAISE EXCEPTION 'ASSERT-8-FAIL: B gravada pelo autosave com run RUNNING';
  END IF;
  -- A outra sessão do lote foi gravada normalmente
  IF NOT EXISTS (SELECT 1 FROM public.dossies WHERE id = 'dddddddd-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'ASSERT-8-FAIL: sessão sem run não gravada';
  END IF;
  IF (test_dossier_content('dddddddd-0000-4000-8000-000000000004')->'messages'->0->>'text') <> 'SESSAO-C' THEN
    RAISE EXCEPTION 'ASSERT-8-FAIL: conteúdo de C errado';
  END IF;
END $do8$;

-- ============================================================================
-- 9. AUTOSAVE SEM RUN ATIVO → grava normalmente
-- ============================================================================
DO $do9$
BEGIN
  PERFORM test_set_jwt('aaaaaaaa-0000-4000-8000-000000000001');

  PERFORM public.save_dossiers_autosave(
    jsonb_build_array(
      test_snapshot('dddddddd-0000-4000-8000-000000000004', 'SESSAO-C-V2')
    )
  );

  IF (test_dossier_content('dddddddd-0000-4000-8000-000000000004')->'messages'->0->>'text') <> 'SESSAO-C-V2' THEN
    RAISE EXCEPTION 'ASSERT-9-FAIL: sessão sem run não atualizada';
  END IF;
END $do9$;

-- ============================================================================
-- 10. P0 CROSS-OWNER: operador B autosave com UUID do dossiê de A → A INTACTO
-- ============================================================================
DO $do10$
BEGIN
  PERFORM test_set_jwt('bbbbbbbb-0000-4000-8000-000000000002');

  -- B tenta sobrescrever o dossiê de A (cccccccc pertence a op_a)
  PERFORM public.save_dossiers_autosave(
    jsonb_build_array(
      test_snapshot('cccccccc-0000-4000-8000-000000000003', 'TOMADA-HOSTIL')
    )
  );

  -- A permanece BYTE-A-BYTE intacto (NEW-1 do cenário 6) e o dono não muda
  IF (test_dossier_content('cccccccc-0000-4000-8000-000000000003')->'messages'->0->>'text') <> 'NEW-1' THEN
    RAISE EXCEPTION 'ASSERT-10-FAIL: dossiê de A sobrescrito por B';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dossies
     WHERE id = 'cccccccc-0000-4000-8000-000000000003' AND operator_id <> 'op_a'
  ) THEN
    RAISE EXCEPTION 'ASSERT-10-FAIL: operator_id reatribuído';
  END IF;
END $do10$;

ROLLBACK;

SELECT 'BRU81_ATOMIC_PROMOTION_SQL_ALL_ASSERTS_PASSED' AS resultado;
