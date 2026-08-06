-- ============================================================================
-- P0-SUPABASE-SECURITY-CONTAINMENT — MIGRATION 2: ISOLAMENTO DE SESSÕES/EVENTOS
-- + REMOÇÃO DE ACESSOS ANÔNIMOS + FUNÇÃO SECURITY DEFINER + VIEWS
-- Task: P0-SUPABASE-SECURITY-CONTAINMENT-CODE-ONLY-2026-08-06
-- Status: CODE-ONLY — NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA
-- Nota: sem BEGIN/COMMIT — a transação é controlada pelo runner (padrão do repo).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. operator_events: remover policy permissiva + isolar por operador
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "operator_own_events" ON "public"."operator_events";

-- SELECT: operador vê apenas eventos do próprio operator_id.
DROP POLICY IF EXISTS "p0_events_select_own" ON "public"."operator_events";

CREATE POLICY "p0_events_select_own"
  ON "public"."operator_events"
  FOR SELECT TO "authenticated"
  USING (
    "operator_id" = (
      SELECT "operator_id" FROM "public"."profiles"
      WHERE "id" = (SELECT "auth"."uid"()::uuid)
      LIMIT 1
    )
  );

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

-- ---------------------------------------------------------------------------
-- 3. user_context: remover acesso anônimo (policies autenticadas já corretas)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."user_context" FROM "anon";

-- ---------------------------------------------------------------------------
-- 4. extract_cache: remover acesso anônimo; manter authenticated
--    (consumidores: services/socio-search/cache.ts, services/storage/extractCache.ts)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."extract_cache" FROM "anon";

-- ---------------------------------------------------------------------------
-- 5. shared_dossiers / crm_clientes / demais tabelas com grants anon indevidos
--    (sem consumidores ativos no código — least privilege)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."shared_dossiers" FROM "anon";
REVOKE ALL ON TABLE "public"."crm_clientes" FROM "anon";
REVOKE ALL ON TABLE "public"."audit_log" FROM "anon";
REVOKE ALL ON TABLE "public"."favorites" FROM "anon";
REVOKE ALL ON TABLE "public"."feedback_events" FROM "anon";
REVOKE ALL ON TABLE "public"."radar_alerts" FROM "anon";
REVOKE ALL ON TABLE "public"."radar_configs" FROM "anon";
REVOKE ALL ON TABLE "public"."llm_experiment_runs" FROM "anon";
REVOKE ALL ON TABLE "public"."scout_diagnostics" FROM "anon";
REVOKE ALL ON SEQUENCE "public"."scout_diagnostics_id_seq" FROM "anon";

-- crm_clientes: remover privilégios de escrita desnecessários de authenticated
-- (sem consumidor no código; policy USING(true) fica sem efeito sem grant amplo)
REVOKE INSERT, UPDATE, DELETE ON TABLE "public"."crm_clientes" FROM "authenticated";
GRANT SELECT ON TABLE "public"."crm_clientes" TO "authenticated";

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
