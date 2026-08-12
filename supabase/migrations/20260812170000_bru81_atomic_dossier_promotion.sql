-- BRU-81 (P0) — promoção atômica server-owned do dossiê (abordagem 2 aprovada pelo Bruno).
--
-- Contrato (opção B — só segurança transacional):
--   * thread/sessionId estável (uma thread por conta);
--   * durante RUNNING o dossiê persistido da thread permanece INTACTO;
--   * FAILED/CANCELLED não alteram o último dossiê válido;
--   * COMPLETED = transação única: valida owner/run/lease/session →
--     UPSERT do dossiê (id = session_id) → run COMPLETED → lease limpa;
--   * qualquer falha dentro da função = ROLLBACK integral (B byte-a-byte);
--   * idempotente: replay da mesma promoção retorna o terminal sem reescrever;
--   * replay divergente (outro session_id) é rejeitado.

CREATE OR REPLACE FUNCTION public.complete_dossier_run_with_dossier(
  p_run_id uuid,
  p_lease_owner text,
  p_dossier_snapshot jsonb
)
RETURNS public.dossier_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_run public.dossier_runs;
  v_operator_id text;
  v_operator_email text;
  v_session_id uuid;
  v_snapshot_id uuid;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required';
  END IF;

  IF p_dossier_snapshot IS NULL OR p_dossier_snapshot->>'id' IS NULL THEN
    RAISE EXCEPTION 'Dossier snapshot with id is required';
  END IF;

  BEGIN
    v_snapshot_id := (p_dossier_snapshot->>'id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Dossier snapshot id must be a valid uuid';
  END;

  -- Serializa a promoção bloqueando o run do próprio owner.
  SELECT * INTO v_run
    FROM public.dossier_runs
   WHERE run_id = p_run_id AND owner_id = v_owner
   FOR UPDATE;

  -- Idempotência: replay da MESMA promoção (run já COMPLETED, mesmo session_id,
  -- lease limpa E conteúdo persistido idêntico ao snapshot) retorna o estado
  -- terminal SEM reescrever o dossiê. Replay divergente (tenta trocar o conteúdo
  -- de um run já concluído) é REJEITADO.
  IF v_run.run_id IS NOT NULL
     AND v_run.status = 'COMPLETED'
     AND v_run.dossier_id = v_snapshot_id
     AND v_run.lease_owner IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.dossies d
       WHERE d.id = v_snapshot_id AND d.content = p_dossier_snapshot
    ) THEN
      RETURN v_run;
    END IF;
    RAISE EXCEPTION 'Replay rejected: completed run cannot change dossier content';
  END IF;

  IF v_run.run_id IS NULL THEN
    RAISE EXCEPTION 'Dossier run not found for the authenticated owner';
  END IF;

  IF v_run.status <> 'RUNNING' THEN
    RAISE EXCEPTION 'Dossier run is not RUNNING (status=%)', v_run.status;
  END IF;

  IF v_run.lease_owner IS DISTINCT FROM p_lease_owner THEN
    RAISE EXCEPTION 'Lease owner mismatch';
  END IF;

  v_session_id := v_run.session_id;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Dossier run has no session';
  END IF;

  -- O payload deve representar EXATAMENTE a thread do run (id = session_id):
  -- impede promover/sobrescrever dossiê de outra thread.
  IF v_snapshot_id <> v_session_id THEN
    RAISE EXCEPTION 'Dossier snapshot id must match run session_id';
  END IF;

  -- Identidade derivada SERVER-SIDE (nunca do payload do cliente).
  SELECT p.operator_id, p.email INTO v_operator_id, v_operator_email
    FROM public.profiles p WHERE p.id = v_owner;
  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated profile is required';
  END IF;

  -- Fail-closed explícito: nunca sobrescrever dossiê de OUTRO operador —
  -- INCLUSIVE soft-deleted (sem deleted_at IS NULL: um dossiê soft-deleted de
  -- outro operador também não pode ser ressuscitado/reatribuído pelo upsert).
  PERFORM 1
    FROM public.dossies d
   WHERE d.id = v_session_id
     AND d.operator_id IS DISTINCT FROM v_operator_id
   FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Cannot overwrite dossier owned by another operator';
  END IF;

  -- UPSERT atômico do dossiê na MESMA transação (thread B = id = session_id).
  INSERT INTO public.dossies (
    id, operator_id, operator_email, title, empresa_alvo, cnpj, modo_principal,
    score_oportunidade, resumo_dossie, content, updated_at, deleted_at, synced_at
  )
  VALUES (
    v_session_id,
    v_operator_id,
    COALESCE(v_operator_email, NULLIF(p_dossier_snapshot->>'operatorEmail', '')::text),
    NULLIF(p_dossier_snapshot->>'title', '')::text,
    NULLIF(p_dossier_snapshot->>'empresaAlvo', '')::text,
    NULLIF(p_dossier_snapshot->>'cnpj', '')::text,
    NULLIF(p_dossier_snapshot->>'modoPrincipal', '')::text,
    NULLIF(p_dossier_snapshot->>'scoreOportunidade', '')::integer,
    NULLIF(p_dossier_snapshot->>'resumoDossie', '')::text,
    p_dossier_snapshot,
    COALESCE(NULLIF(p_dossier_snapshot->>'updatedAt', '')::timestamptz, now()),
    NULL,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    operator_id = EXCLUDED.operator_id,
    operator_email = EXCLUDED.operator_email,
    title = EXCLUDED.title,
    empresa_alvo = EXCLUDED.empresa_alvo,
    cnpj = EXCLUDED.cnpj,
    modo_principal = EXCLUDED.modo_principal,
    score_oportunidade = EXCLUDED.score_oportunidade,
    resumo_dossie = EXCLUDED.resumo_dossie,
    content = EXCLUDED.content,
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL,
    synced_at = EXCLUDED.synced_at;

  -- Completa o run e limpa a lease na MESMA transação.
  UPDATE public.dossier_runs
     SET status = 'COMPLETED',
         dossier_id = v_session_id,
         completed_at = COALESCE(completed_at, now()),
         lease_owner = NULL,
         lease_expires_at = NULL
   WHERE run_id = p_run_id AND owner_id = v_owner
   RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

ALTER FUNCTION public.complete_dossier_run_with_dossier(uuid, text, jsonb) OWNER TO postgres;

-- Privilégio mínimo: sem PUBLIC, sem anon; execute SOMENTE para authenticated
-- (service_role não precisa chamar a promoção — nenhum fluxo de backend a usa).
REVOKE ALL ON FUNCTION public.complete_dossier_run_with_dossier(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_dossier_run_with_dossier(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_dossier_run_with_dossier(uuid, text, jsonb) TO authenticated;

-- ============================================================================
-- BRU-81 (P0) — autosave server-owned com filtro anti-run-ativo
-- ----------------------------------------------------------------------------
-- O containment CLIENT-side (getActiveDossierRun) tem janela TOCTOU e não vê
-- runs de OUTRA aba. Esta RPC vincula o check À ESCRITA na mesma transação:
-- para cada dossiê do lote, se existir run RUNNING/CANCEL_REQUESTED para a
-- session_id, a linha é PULADA (nunca gravada mid-flight); as demais são
-- persistidas normalmente. A promoção terminal continua sendo a ÚNICA escrita
-- do snapshot final da thread com run ativo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_dossiers_autosave(p_dossiers jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_operator_id text;
  v_operator_email text;
  v_dossier jsonb;
  v_session_id uuid;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required';
  END IF;

  -- Identidade derivada SERVER-SIDE (nunca do payload do cliente).
  SELECT p.operator_id, p.email INTO v_operator_id, v_operator_email
    FROM public.profiles p WHERE p.id = v_owner;
  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated profile is required';
  END IF;

  IF p_dossiers IS NULL OR jsonb_typeof(p_dossiers) <> 'array' THEN
    RAISE EXCEPTION 'p_dossiers must be a JSON array';
  END IF;

  FOR v_dossier IN SELECT value FROM jsonb_array_elements(p_dossiers)
  LOOP
    BEGIN
      v_session_id := (v_dossier->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE; -- linha sem id uuid válido é ignorada (fail-safe)
    END;

    -- SERIALIZAÇÃO com a ativação do run: advisory lock transacional na MESMA
    -- chave usada por acquire_dossier_run_lease (dossier_session:<session_id>).
    -- Fecha o TOCTOU de verdade: a ativação e o autosave NÃO podem intercalar
    -- check/escrita para a mesma thread (o lock só libera no commit).
    PERFORM pg_advisory_xact_lock(hashtext('dossier_session:' || v_session_id::text));

    -- P0 OWNERSHIP: nunca sobrescrever/reatribuir dossiê de OUTRO operador
    -- (SECURITY DEFINER não herda a proteção da RLS — FORCE RLS=false).
    -- Linha estrangeira (inclusive soft-deleted) é PULADA.
    PERFORM 1
      FROM public.dossies d
     WHERE d.id = v_session_id
       AND d.operator_id IS DISTINCT FROM v_operator_id
     FOR UPDATE;
    IF FOUND THEN
      CONTINUE;
    END IF;

    -- CONTAINMENT SERVER-SIDE: nunca gravar dossiê cuja thread tem run ativo.
    -- Com o advisory lock, a verificação e a escrita não intercalam com a
    -- ativação do run (mesma transação + mesmo lock).
    IF EXISTS (
      SELECT 1 FROM public.dossier_runs r
       WHERE r.session_id = v_session_id
         AND r.status IN ('RUNNING', 'CANCEL_REQUESTED')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.dossies (
      id, operator_id, operator_email, title, empresa_alvo, cnpj, modo_principal,
      score_oportunidade, resumo_dossie, content, updated_at, deleted_at, synced_at
    )
    VALUES (
      v_session_id,
      v_operator_id,
      COALESCE(v_operator_email, NULLIF(v_dossier->>'operatorEmail', '')::text),
      NULLIF(v_dossier->>'title', '')::text,
      NULLIF(v_dossier->>'empresaAlvo', '')::text,
      NULLIF(v_dossier->>'cnpj', '')::text,
      NULLIF(v_dossier->>'modoPrincipal', '')::text,
      NULLIF(v_dossier->>'scoreOportunidade', '')::integer,
      NULLIF(v_dossier->>'resumoDossie', '')::text,
      v_dossier,
      COALESCE(NULLIF(v_dossier->>'updatedAt', '')::timestamptz, now()),
      NULL,
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      operator_email = EXCLUDED.operator_email,
      title = EXCLUDED.title,
      empresa_alvo = EXCLUDED.empresa_alvo,
      cnpj = EXCLUDED.cnpj,
      modo_principal = EXCLUDED.modo_principal,
      score_oportunidade = EXCLUDED.score_oportunidade,
      resumo_dossie = EXCLUDED.resumo_dossie,
      content = EXCLUDED.content,
      updated_at = EXCLUDED.updated_at,
      deleted_at = NULL,
      synced_at = EXCLUDED.synced_at;
  END LOOP;
END;
$$;

ALTER FUNCTION public.save_dossiers_autosave(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.save_dossiers_autosave(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_dossiers_autosave(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_dossiers_autosave(jsonb) TO authenticated;

-- ============================================================================
-- BRU-81 (P0) — serialização da ativação do run com o autosave.
-- acquire_dossier_run_lease passa a segurar o MESMO advisory lock transacional
-- (dossier_session:<session_id>) que save_dossiers_autosave. Ativação (RUNNING)
-- e autosave da mesma thread ficam mutuamente exclusivos — sem janela TOCTOU.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.acquire_dossier_run_lease(
  p_run_id uuid, p_lease_owner text, p_lease_seconds integer DEFAULT 45
) RETURNS public.dossier_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_run public.dossier_runs;
BEGIN
  IF auth.uid() IS NULL OR coalesce(btrim(p_lease_owner), '') = '' OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Invalid authenticated lease request';
  END IF;

  -- Serializa com o autosave da MESMA thread (advisory lock transacional).
  PERFORM pg_advisory_xact_lock(hashtext('dossier_session:' || (
    SELECT session_id::text FROM public.dossier_runs
     WHERE run_id = p_run_id AND owner_id = auth.uid()
  )));

  UPDATE public.dossier_runs
     SET lease_owner = p_lease_owner, lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         last_heartbeat_at = now(), started_at = coalesce(started_at, now()), status = 'RUNNING'
   WHERE run_id = p_run_id AND owner_id = auth.uid()
     AND status IN ('PENDING', 'RUNNING')
     AND (lease_expires_at IS NULL OR lease_expires_at < now() OR lease_owner = p_lease_owner)
  RETURNING * INTO v_run;
  RETURN v_run;
END;
$$;

ALTER FUNCTION public.acquire_dossier_run_lease(uuid, text, integer) OWNER TO postgres;
