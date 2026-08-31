-- BRU-81 B' (P0 separado do F1.3) — SINGLE_ACTIVE_RUN no lease.
--
-- Mutex server-side por (owner, session): dentro do advisory lock transacional
-- da sessão, apenas UMA execução de lifecycle ATIVO (RUNNING ou
-- CANCEL_REQUESTED) pode existir. Cobre reload, nova aba e perda do estado
-- React — zero dependência de floodgate de cliente.
--
-- Motivação (incidente provado 2026-08-13, preview): run 7d1934e1 ficou RUNNING
-- após reload e o reenvio criou 08b2fcfb 16s ANTES do lease anterior expirar —
-- dois runs coexistindo para a mesma sessão. A dedup por idempotency_key do
-- create_or_get_dossier_run não impede isso (chave nova = identidade nova).
--
-- Contrato material (congelado pelo Planejador 2026-08-13, revisado no mesmo
-- dia após parecer adversário):
--   * a SESSÃO é reservada PRIMEIRO (advisory lock transacional) e só depois
--     as linhas da sessão são tocadas — ordem única, sem lock próprio antes
--     do lock da sessão (elimina travamento entre ativações concorrentes);
--   * TODOS os outros runs com lifecycle ATIVO (RUNNING ou CANCEL_REQUESTED —
--     o renew aceita ambos e o cancelamento não garante término) da mesma
--     owner/session são avaliados (nunca LIMIT 1): se QUALQUER um tiver lease
--     ainda válido, o novo run NÃO começa; se TODOS estiverem mortos, TODOS
--     são terminalizados antes da ativação do novo (RUNNING→FAILED
--     SUPERSEDED_STALE_RUN; CANCEL_REQUESTED→CANCELLED com cancelled_at);
--   * fail-closed: run alvo sem session_id (campo aceita NULL hoje) é
--     terminalizado deterministicamente ANTES de qualquer lock — nunca fica
--     PENDING órfão (FAILED RUN_SESSION_REQUIRED, linha retornada);
--   * a tentativa rejeitada termina deterministicamente: o run alvo vira
--     FAILED (SINGLE_ACTIVE_RUN_BLOCKED) na MESMA transação e a RPC retorna a
--     linha marcada — o cliente (message-orchestrator) já aborta quando o
--     status não é RUNNING (dossier-run-lease-not-acquired);
--   * COMPLETED/FAILED/CANCELLED anteriores preservados (só RUNNING é tocado);
--   * nenhuma mudança em dossiê promovido, BRU-62 ou Gold;
--   * save_dossiers_autosave usa o MESMO advisory lock de sessão
--     (dossier_session:<session_id>) — ativação e autosave da mesma thread
--     ficam mutuamente exclusivos. A promoção (complete_dossier_run_with_dossier)
--     NÃO usa esse lock: tem travas próprias por run (FOR UPDATE) — não é
--     afirmado aqui que ela compartilhe o lock de sessão.

CREATE OR REPLACE FUNCTION public.acquire_dossier_run_lease(
  p_run_id uuid, p_lease_owner text, p_lease_seconds integer DEFAULT 45
) RETURNS public.dossier_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_session_id uuid;
  v_run public.dossier_runs;
BEGIN
  IF v_owner IS NULL OR coalesce(btrim(p_lease_owner), '') = '' OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Invalid authenticated lease request';
  END IF;

  -- Resolve a sessão do run alvo (ownership check). LEITURA pura, sem lock:
  -- nenhuma linha é travada antes de obter a exclusividade da sessão.
  SELECT session_id INTO v_session_id
    FROM public.dossier_runs
   WHERE run_id = p_run_id AND owner_id = v_owner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found or not owned';
  END IF;
  -- Fail-closed: o campo session_id aceita NULL no banco atual. Run existente
  -- SEM sessão é terminalizado deterministicamente aqui (R4): a tentativa
  -- inválida NUNCA fica PENDING órfã — vira FAILED (RUN_SESSION_REQUIRED) e a
  -- linha marcada é retornada; o cliente já trata status != RUNNING como
  -- recusa. Run inexistente/de outro owner continua gerando erro.
  IF v_session_id IS NULL THEN
    UPDATE public.dossier_runs
       SET status = 'FAILED',
           failed_at = coalesce(failed_at, now()),
           error_code = 'RUN_SESSION_REQUIRED',
           error_stage = 'lease_acquire',
           lease_owner = NULL,
           lease_expires_at = NULL
     WHERE run_id = p_run_id AND owner_id = v_owner
       AND status IN ('PENDING', 'RUNNING')
     RETURNING * INTO v_run;
    RETURN v_run;
  END IF;

  -- PASSO 1 — reserva a SESSÃO inteira antes de qualquer lock de linha.
  -- O advisory lock transacional serializa ativação e autosave da MESMA
  -- thread (dossier_session:<session_id>); ativações de sessões diferentes
  -- nunca disputam a mesma trava.
  PERFORM pg_advisory_xact_lock(hashtext('dossier_session:' || v_session_id::text));

  -- PASSO 2 — com a sessão reservada, trava as linhas da sessão em ORDEM
  -- ÚNICA e previsível (run_id ASC), para nunca cruzar com transações que
  -- não usam o advisory (ex: promoção, que trava por run específico).
  PERFORM 1
    FROM public.dossier_runs
   WHERE owner_id = v_owner AND session_id = v_session_id
   ORDER BY run_id
   FOR UPDATE;

  -- PASSO 3 — SINGLE_ACTIVE_RUN: avalia TODOS os outros runs com LIFECYCLE
  -- ATIVO da mesma owner/session (avalia TODOS — nada fica ignorado).
  -- Ocupação ativa = RUNNING OU CANCEL_REQUESTED com lease ainda válido:
  -- o renew aceita ambos os estados e o autosave também os trata como ativos
  -- (cancelamento solicitado NÃO significa execução terminada).
  IF EXISTS (
    SELECT 1
      FROM public.dossier_runs
     WHERE owner_id = v_owner
       AND session_id = v_session_id
       AND run_id <> p_run_id
       AND status IN ('RUNNING', 'CANCEL_REQUESTED')
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at >= now()
  ) THEN
    -- Existe execução VIVA: rejeita a nova ativação e terminaliza o run alvo
    -- deterministicamente — nunca fica PENDING/RUNNING órfão.
    UPDATE public.dossier_runs
       SET status = 'FAILED',
           failed_at = coalesce(failed_at, now()),
           error_code = 'SINGLE_ACTIVE_RUN_BLOCKED',
           error_stage = 'lease_acquire',
           lease_owner = NULL,
           lease_expires_at = NULL
     WHERE run_id = p_run_id AND owner_id = v_owner
       AND status IN ('PENDING', 'RUNNING')
     RETURNING * INTO v_run;
    RETURN v_run;
  END IF;

  -- PASSO 4 — TODOS os demais runs ativos estão mortos (lease expirado ou
  -- ausente): terminaliza TODOS antes de ativar o novo (nenhum órfão
  -- ignorado, inclusive sujeira histórica). Cada estado morto recebe o
  -- terminal SEMÂNTICO correspondente:
  --   RUNNING           → FAILED  (SUPERSEDED_STALE_RUN)
  --   CANCEL_REQUESTED  → CANCELLED (cancelled_at preenchido + lease limpa)
  UPDATE public.dossier_runs
     SET status = 'FAILED',
         failed_at = coalesce(failed_at, now()),
         error_code = 'SUPERSEDED_STALE_RUN',
         error_stage = 'lease_acquire',
         lease_owner = NULL,
         lease_expires_at = NULL
   WHERE owner_id = v_owner
     AND session_id = v_session_id
     AND run_id <> p_run_id
     AND status = 'RUNNING'
     AND (lease_expires_at IS NULL OR lease_expires_at < now());

  UPDATE public.dossier_runs
     SET status = 'CANCELLED',
         cancelled_at = coalesce(cancelled_at, now()),
         lease_owner = NULL,
         lease_expires_at = NULL
   WHERE owner_id = v_owner
     AND session_id = v_session_id
     AND run_id <> p_run_id
     AND status = 'CANCEL_REQUESTED'
     AND (lease_expires_at IS NULL OR lease_expires_at < now());

  -- PASSO 5 — ativação normal do run alvo (mesma semântica anterior,
  -- preservando o re-acquire pelo próprio lease_owner).
  UPDATE public.dossier_runs
     SET lease_owner = p_lease_owner, lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         last_heartbeat_at = now(), started_at = coalesce(started_at, now()), status = 'RUNNING'
   WHERE run_id = p_run_id AND owner_id = v_owner
     AND status IN ('PENDING', 'RUNNING')
     AND (lease_expires_at IS NULL OR lease_expires_at < now() OR lease_owner = p_lease_owner)
  RETURNING * INTO v_run;
  RETURN v_run;
END;
$$;

ALTER FUNCTION public.acquire_dossier_run_lease(uuid, text, integer) OWNER TO postgres;

-- ACL: estado histórico preservado (read-back do banco em 2026-08-13:
-- authenticated E service_role com EXECUTE; anon e PUBLIC sem).
REVOKE ALL ON FUNCTION public.acquire_dossier_run_lease(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_dossier_run_lease(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.acquire_dossier_run_lease(uuid, text, integer) TO authenticated;
-- service_role NÃO é revogado aqui — CREATE OR REPLACE preserva o grant
-- histórico e o contrato exige mantê-lo exatamente como está.
