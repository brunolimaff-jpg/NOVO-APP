-- ============================================================================
-- P0-SUPABASE-SECURITY-CONTAINMENT — MIGRATION 3 (REVISADA): DESCOBERTA SEGURA
-- DE DUPLICIDADE ESTRANGEIRA (preserva o comportamento aprovado da BRU-11 #478)
-- Task: P0-SUPABASE-SECURITY-CONTAINMENT-CODE-ONLY-2026-08-06
-- Status: CODE-ONLY — NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA
--
-- Revisão (2ª auditoria): normalize_cnpj criada ANTES da RPC; RPC valida
-- auth.uid(), perfil autenticado, CNPJ de exatamente 14 dígitos e retorna true
-- apenas para duplicidade ESTRANGEIRA (operator_id != operador atual).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. normalize_cnpj: helper imutável, criado PRIMEIRO (a RPC depende dele).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."normalize_cnpj"(p_cnpj text)
RETURNS text
LANGUAGE "sql"
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
$$;

REVOKE ALL ON FUNCTION "public"."normalize_cnpj"(text) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."normalize_cnpj"(text) TO "authenticated";

-- ---------------------------------------------------------------------------
-- 2. check_existing_dossier_for_cnpj: retorna APENAS boolean.
--    Exige identidade autenticada válida (auth.uid() + perfil com operator_id)
--    e retorna true somente quando existe dossiê ATIVO com o MESMO CNPJ
--    pertencente a OUTRO operador. Nunca expõe id, content, score, datas ou
--    operator_id do proprietário.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."check_existing_dossier_for_cnpj"(p_cnpj text)
RETURNS boolean
LANGUAGE "sql"
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."dossies" d
    WHERE d."cnpj" = "public"."normalize_cnpj"(p_cnpj)
      AND d."deleted_at" IS NULL
      AND length("public"."normalize_cnpj"(p_cnpj)) = 14
      AND (SELECT "auth"."uid"()) IS NOT NULL
      AND d."operator_id" <> (
        SELECT "operator_id" FROM "public"."profiles"
        WHERE "id" = (SELECT "auth"."uid"()::uuid)
        LIMIT 1
      )
  )
$$;

REVOKE ALL ON FUNCTION "public"."check_existing_dossier_for_cnpj"(text) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."check_existing_dossier_for_cnpj"(text) TO "authenticated";

-- ============================================================================
-- FIM MIGRATION 3 (REVISADA) — revisar + revalidar em banco descartável.
-- ============================================================================
