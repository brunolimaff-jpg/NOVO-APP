-- DOSSIER-FLOW-02: persistência e conclusão atômicas do dossiê.
--
-- Esta é uma delta nova sobre o schema versionado até
-- 20260728173731_harden_dossier_grants.sql. A linha de dossier_runs é a
-- barreira de concorrência: o lock é obtido antes da escrita em dossies e a
-- persistência + transição para COMPLETED ocorre na mesma transação.
--
-- A API chama a RPC com a role authenticated. anon e service_role não recebem
-- EXECUTE nesta migration porque não são dependências do runtime autorizado.
-- A revogação explícita de service_role neutraliza privilégios padrão herdados
-- do baseline e deve ser validada separadamente no replay/matriz de roles.

CREATE OR REPLACE FUNCTION public.persist_and_complete_dossier_run(
  p_run_id uuid,
  p_lease_owner text,
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
  v_auth_user_id uuid := auth.uid();
  v_run public.dossier_runs;
  v_completed public.dossier_runs;
  v_existing public.dossies;
  v_title text := nullif(pg_catalog.btrim(coalesce(p_title, '')), '');
  v_empresa_alvo text := nullif(pg_catalog.btrim(coalesce(p_empresa_alvo, '')), '');
  v_modo_principal text := nullif(pg_catalog.btrim(coalesce(p_modo_principal, '')), '');
  v_cnpj text := nullif(pg_catalog.btrim(coalesce(p_cnpj, '')), '');
  v_now timestamptz;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_run_id IS NULL OR p_lease_owner IS NULL OR pg_catalog.btrim(p_lease_owner) = ''
     OR p_dossier_id IS NULL OR v_title IS NULL OR v_empresa_alvo IS NULL
     OR v_modo_principal IS NULL OR p_content IS NULL
     OR pg_catalog.jsonb_typeof(p_content) <> 'object'
     OR pg_catalog.jsonb_typeof(p_content->'messages') <> 'array' THEN
    RAISE EXCEPTION 'PERSISTENCE_FAILED' USING ERRCODE = 'P0001';
  END IF;

  -- Serializa cancelamento, retry e conclusão do mesmo run.
  SELECT r.*
    INTO v_run
    FROM public.dossier_runs AS r
   WHERE r.run_id = p_run_id
     AND r.owner_id = v_auth_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- O relógio é capturado depois do lock para não aceitar uma lease que
  -- expirou enquanto a chamada aguardava a outra transação.
  v_now := pg_catalog.clock_timestamp();

  -- Retry idempotente: somente o mesmo run + dossier + payload retorna
  -- sucesso. Qualquer payload divergente é conflito explícito.
  IF v_run.status = 'COMPLETED' THEN
    SELECT d.*
      INTO v_existing
      FROM public.dossies AS d
     WHERE d.id = p_dossier_id
     FOR UPDATE;

    IF v_run.dossier_id = p_dossier_id
       AND v_existing.id IS NOT NULL
       AND v_existing.operator_id = v_run.operator_id
       AND v_existing.deleted_at IS NULL
       AND v_existing.title IS NOT DISTINCT FROM v_title
       AND v_existing.empresa_alvo IS NOT DISTINCT FROM v_empresa_alvo
       AND v_existing.cnpj IS NOT DISTINCT FROM v_cnpj
       AND v_existing.modo_principal IS NOT DISTINCT FROM v_modo_principal
       AND v_existing.score_oportunidade IS NOT DISTINCT FROM p_score_oportunidade
       AND v_existing.resumo_dossie IS NOT DISTINCT FROM p_resumo_dossie
       AND v_existing.content IS NOT DISTINCT FROM p_content THEN
      RETURN v_run;
    END IF;

    RAISE EXCEPTION 'DOSSIER_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status = 'CANCEL_REQUESTED' OR v_run.status = 'CANCELLED'
     OR v_run.cancel_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'RUN_CANCEL_REQUESTED' USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status <> 'RUNNING'
     OR v_run.lease_owner IS DISTINCT FROM p_lease_owner
     OR v_run.lease_expires_at IS NULL
     OR v_run.lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'RUN_LEASE_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  -- Owner/tenant vêm da linha autenticada bloqueada; nenhum identificador
  -- recebido no payload tem autoridade para escolher operator_id.
  SELECT d.*
    INTO v_existing
    FROM public.dossies AS d
   WHERE d.id = p_dossier_id
   FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.operator_id IS DISTINCT FROM v_run.operator_id
       OR v_existing.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'DOSSIER_CONFLICT' USING ERRCODE = 'P0001';
    END IF;

    IF v_existing.title IS DISTINCT FROM v_title
       OR v_existing.empresa_alvo IS DISTINCT FROM v_empresa_alvo
       OR v_existing.cnpj IS DISTINCT FROM v_cnpj
       OR v_existing.modo_principal IS DISTINCT FROM v_modo_principal
       OR v_existing.score_oportunidade IS DISTINCT FROM p_score_oportunidade
       OR v_existing.resumo_dossie IS DISTINCT FROM p_resumo_dossie
       OR v_existing.content IS DISTINCT FROM p_content THEN
      RAISE EXCEPTION 'DOSSIER_CONFLICT' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.dossies
       SET updated_at = v_now
     WHERE id = p_dossier_id;
  ELSE
    INSERT INTO public.dossies (
      id,
      operator_id,
      title,
      empresa_alvo,
      cnpj,
      modo_principal,
      score_oportunidade,
      resumo_dossie,
      content,
      updated_at
    )
    VALUES (
      p_dossier_id,
      v_run.operator_id,
      v_title,
      v_empresa_alvo,
      v_cnpj,
      v_modo_principal,
      p_score_oportunidade,
      p_resumo_dossie,
      p_content,
      v_now
    );
  END IF;

  UPDATE public.dossier_runs AS r
     SET status = 'COMPLETED',
         dossier_id = p_dossier_id,
         completed_at = coalesce(r.completed_at, v_now),
         lease_owner = NULL,
         lease_expires_at = NULL
   WHERE r.run_id = p_run_id
     AND r.owner_id = v_auth_user_id
     AND r.status = 'RUNNING'
     AND r.lease_owner = p_lease_owner
     AND r.cancel_requested_at IS NULL
  RETURNING r.* INTO v_completed;

  IF v_completed.run_id IS NULL THEN
    -- Rollback da transação: nunca deixar dossiê órfão de run COMPLETED.
    RAISE EXCEPTION 'RUN_CANCEL_REQUESTED' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_completed;
END;
$$;

ALTER FUNCTION public.persist_and_complete_dossier_run(
  uuid, text, uuid, text, text, text, text, integer, text, jsonb
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.persist_and_complete_dossier_run(
  uuid, text, uuid, text, text, text, text, integer, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.persist_and_complete_dossier_run(
  uuid, text, uuid, text, text, text, text, integer, text, jsonb
) TO authenticated;
