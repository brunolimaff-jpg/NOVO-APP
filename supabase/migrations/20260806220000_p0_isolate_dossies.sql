-- ============================================================================
-- P0-SUPABASE-SECURITY-CONTAINMENT — MIGRATION 1: ISOLAMENTO DE DOSSIÊS
-- Task: P0-SUPABASE-SECURITY-CONTAINMENT-CODE-ONLY-2026-08-06
-- Status: CODE-ONLY — NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA
-- Baseline: 131b8f20ef0ef9182d5a6cc7ff04d1b5a9c84b9f
-- Nota: sem BEGIN/COMMIT — a transação é controlada pelo runner (padrão do repo).
-- ============================================================================

-- Remove a policy permissiva que aceitava qualquer linha com operator_id preenchido
-- (sem vínculo com o perfil autenticado). Nome enganava: operator_own_dossies.
DROP POLICY IF EXISTS "operator_own_dossies" ON "public"."dossies";

-- SELECT: operador autenticado vê apenas dossiês cujo operator_id corresponde
-- ao operator_id do seu próprio perfil (auth.uid() → profiles.operator_id).
-- Sem perfil vinculado → zero linhas (fail-closed).
DROP POLICY IF EXISTS "p0_dossies_select_own" ON "public"."dossies";

CREATE POLICY "p0_dossies_select_own"
  ON "public"."dossies"
  FOR SELECT TO "authenticated"
  USING (
    "operator_id" = (
      SELECT "operator_id" FROM "public"."profiles"
      WHERE "id" = (SELECT "auth"."uid"()::uuid)
      LIMIT 1
    )
  );

-- INSERT: só permite criar com o PRÓPRIO operator_id (WITH CHECK real).
-- Bloqueia inserção com operator_id de outro operador.
DROP POLICY IF EXISTS "p0_dossies_insert_own" ON "public"."dossies";

CREATE POLICY "p0_dossies_insert_own"
  ON "public"."dossies"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "operator_id" = (
      SELECT "operator_id" FROM "public"."profiles"
      WHERE "id" = (SELECT "auth"."uid"()::uuid)
      LIMIT 1
    )
  );

-- UPDATE: só permite atualizar dossiês próprios (USING) E impede a troca de
-- ownership (WITH CHECK impede setar operator_id de outro operador).
-- Isso bloqueia o takeover cross-operator na fronteira do banco.
DROP POLICY IF EXISTS "p0_dossies_update_own" ON "public"."dossies";

CREATE POLICY "p0_dossies_update_own"
  ON "public"."dossies"
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

-- DELETE: continua sem GRANT para authenticated — reforço explícito
-- (harden 20260728 concedeu apenas SELECT/INSERT/UPDATE; defesa em profundidade).
REVOKE DELETE ON TABLE "public"."dossies" FROM "authenticated";

-- anon: reforço explícito do REVOKE ALL (harden 20260728 já revogou; defesa em
-- profundidade para manter anon sem acesso direto a dossies).
REVOKE ALL ON TABLE "public"."dossies" FROM "anon";

-- service_role: mantém acesso administrativo via grants existentes.

-- ============================================================================
-- FIM MIGRATION 1 — revisar + revalidar em banco descartável antes de aplicar.
-- ============================================================================
