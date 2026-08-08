-- ============================================================================
-- P0-SUPABASE-SECURITY-CONTAINMENT — MIGRATION 2: ISOLAMENTO DE SESSÕES/EVENTOS
-- + REMOÇÃO DE ACESSOS ANÔNIMOS + FUNÇÃO SECURITY DEFINER + VIEWS
-- Task: P0-SUPABASE-SECURITY-CONTAINMENT-CODE-ONLY-2026-08-06
-- Status: CODE-ONLY — NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA
-- Nota: sem BEGIN/COMMIT — a transação é controlada pelo runner (padrão do repo).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. operator_events: remover policy permissiva + ISOLAR por operador.
--    Least privilege (3ª auditoria): o consumidor (operatorTracking.ts:292)
--    executa SOMENTE INSERT. Não há SELECT nem UPDATE pelo cliente — a policy
--    de SELECT é removida e os grants ficam restritos a INSERT.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "operator_own_events" ON "public"."operator_events";

-- (policy de SELECT removida: sem consumidor comprovado)

-- INSERT: o código (operatorTracking.ts:292) insere com o operator_id do
-- operador atual — exige que o WITH CHECK valide o PRÓPRIO operator_id.
DROP POLICY IF EXISTS "p0_events_insert_own" ON "public"."operator_events";

CREATE POLICY "p0_events_insert_own"
  ON "public"."operator_events"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "operator_id" = (
      SELECT "operator_id" FROM "public"."profiles"
      WHERE "id" = (SELECT "auth"."uid"()::uuid)
      LIMIT 1
    )
  );

REVOKE ALL ON TABLE "public"."operator_events" FROM "anon";
-- Grants mínimos: apenas INSERT para authenticated (sem SELECT/UPDATE/DELETE).
REVOKE ALL ON TABLE "public"."operator_events" FROM "authenticated";
GRANT INSERT ON TABLE "public"."operator_events" TO "authenticated";

-- ---------------------------------------------------------------------------
-- 2. operator_sessions: remover policy permissiva + isolar por operador
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "operator_own_sessions" ON "public"."operator_sessions";

-- SELECT/UPDATE: sessões do próprio operador (upsert por id + update por id,
-- operatorTracking.ts:174-265).
DROP POLICY IF EXISTS "p0_sessions_select_own" ON "public"."operator_sessions";

CREATE POLICY "p0_sessions_select_own"
  ON "public"."operator_sessions"
  FOR SELECT TO "authenticated"
  USING (
    "operator_id" = (
      SELECT "operator_id" FROM "public"."profiles"
      WHERE "id" = (SELECT "auth"."uid"()::uuid)
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "p0_sessions_insert_own" ON "public"."operator_sessions";

CREATE POLICY "p0_sessions_insert_own"
  ON "public"."operator_sessions"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "operator_id" = (
      SELECT "operator_id" FROM "public"."profiles"
      WHERE "id" = (SELECT "auth"."uid"()::uuid)
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "p0_sessions_update_own" ON "public"."operator_sessions";

CREATE POLICY "p0_sessions_update_own"
  ON "public"."operator_sessions"
  FOR UPDATE TO "authenticated"
  USING (
    "operator_id" = (
      SELECT "operator_id" FROM "public"."profiles"
      WHERE "id" = (SELECT "auth"."uid"()::uuid)
      LIMIT 1
    )
  )
  WITH CHECK (
    "operator_id" = (
      SELECT "operator_id" FROM "public"."profiles"
      WHERE "id" = (SELECT "auth"."uid"()::uuid)
      LIMIT 1
    )
  );

REVOKE ALL ON TABLE "public"."operator_sessions" FROM "anon";

-- Grants mínimos (least privilege, 3ª auditoria): operator_events já está em
-- REVOKE ALL + GRANT INSERT acima. operator_sessions usa SELECT/INSERT/UPDATE
-- (operatorTracking.ts:174-265) — garantir sem DELETE/REFERENCES/TRIGGER/TRUNCATE.
REVOKE DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."operator_sessions" FROM "authenticated";

-- ---------------------------------------------------------------------------
-- 3. user_context: remover acesso anônimo (policies autenticadas já corretas)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."user_context" FROM "anon";

-- ---------------------------------------------------------------------------
-- 4. extract_cache: remover acesso anônimo; manter authenticated fail-closed
--    (baseline não dá policy de RLS para authenticated — upsert do navegador já
--    não-funcional em Produção; fluxo real é service_role server-side)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."extract_cache" FROM "anon";

-- ---------------------------------------------------------------------------
-- 5. shared_dossiers / crm_clientes — sem consumidores ativos no código
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."shared_dossiers" FROM "anon";
REVOKE ALL ON TABLE "public"."crm_clientes" FROM "anon";

-- crm_clientes: revogar TODO acesso de authenticated (policy viva
-- operadores_leem_crm USING(true) tornaria qualquer autenticado capaz de ler
-- todas as linhas). Contenção: somente service_role/backend privilegiado.
REVOKE ALL ON TABLE "public"."crm_clientes" FROM "authenticated";

-- NOTA: audit_log, favorites, feedback_events, radar_alerts, radar_configs,
-- llm_experiment_runs e scout_diagnostics ficaram FORA deste lote (escopo do
-- pacote P0). Hardening dessas superfícies vai em lote separado com inventário
-- próprio de consumidores (feedback_events tem consumidor ativo no cliente).

-- ---------------------------------------------------------------------------
-- 6. auto_close_stale_sessions(): SECURITY DEFINER com escrita — apenas
--    service_role pode executar. Reescrita com search_path fixo e objetos
--    qualificados (a versão do baseline referenciava operator_sessions sem
--    qualificação, o que quebraria com search_path vazio).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."auto_close_stale_sessions"()
RETURNS integer
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  closed_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE public.operator_sessions
    SET
      ended_at        = last_seen_at,
      ended_reason    = 'timeout',
      duration_seconds = EXTRACT(EPOCH FROM (last_seen_at - started_at))::INTEGER
    WHERE ended_at IS NULL
      AND last_seen_at IS NOT NULL
      AND last_seen_at < NOW() - INTERVAL '30 minutes'
    RETURNING 1
  )
  SELECT COUNT(*) INTO closed_count FROM updated;

  RETURN closed_count;
END;
$$;

REVOKE ALL ON FUNCTION "public"."auto_close_stale_sessions"() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."auto_close_stale_sessions"() TO "service_role";

-- ---------------------------------------------------------------------------
-- 7. Views de métricas: sem acesso anônimo E sem exposição cross-operator
--    autenticada. As views executam com privilégios do owner (postgres, sem
--    security_invoker) e consultam operator_events/operator_sessions
--    globalmente — o RLS das tabelas subjacentes NÃO filtra para o chamador.
--    Sem consumidores ativos no código, a contenção de menor risco é restringir
--    o acesso ao backend privilegiado (service_role) apenas.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."vw_company_ranking" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."vw_daily_usage" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."vw_event_funnel" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."vw_operator_ranking" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."vw_session_stats" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."vw_metrics_summary" FROM "anon", "authenticated";

-- ============================================================================
-- FIM MIGRATION 2 — revisar + revalidar em banco descartável antes de aplicar.
-- ============================================================================
