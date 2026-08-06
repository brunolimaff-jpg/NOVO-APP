-- ============================================================================
-- P0-SUPABASE-SECURITY-CONTAINMENT — MIGRATION 3: DESCOBERTA SEGURA DE
-- DUPLICIDADE ESTRANGEIRA (preserva o comportamento aprovado da BRU-11 #478)
-- Task: P0-SUPABASE-SECURITY-CONTAINMENT-CODE-ONLY-2026-08-06
-- Status: CODE-ONLY — NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA
-- ============================================================================

-- ---------------------------------------------------------------------------
-- RPC: retorna APENAS a existência de um dossiê para o CNPJ em QUALQUER
-- operador. Não expõe id, content, score, operator_id, datas ou metadados.
-- Com o isolamento RLS das novas policies, um SELECT direto só veria dossiês
-- próprios; esta função consulta o universo completo (SECURITY DEFINER) mas
-- devolve somente um booleano — preservando a detecção de duplicidade
-- estrangeira exigida pelo fluxo da #478 (modal de bloqueio fail-closed),
-- sem vazar nenhum dado do proprietário.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."check_existing_dossier_for_cnpj"(p_cnpj text)
RETURNS boolean
LANGUAGE "sql"
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."dossies"
    WHERE "cnpj" = "public"."normalize_cnpj"(p_cnpj)
      AND "deleted_at" IS NULL
  )
$$;

-- Função auxiliar: normaliza CNPJ para dígitos (defesa contra variações).
CREATE OR REPLACE FUNCTION "public"."normalize_cnpj"(p_cnpj text)
RETURNS text
LANGUAGE "sql"
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
$$;

-- ACL: apenas authenticated pode consultar (fluxo do cliente); anon e PUBLIC negados.
REVOKE ALL ON FUNCTION "public"."check_existing_dossier_for_cnpj"(text) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."check_existing_dossier_for_cnpj"(text) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."normalize_cnpj"(text) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."normalize_cnpj"(text) TO "authenticated";

-- ============================================================================
-- FIM MIGRATION 3 — revisar + revalidar em banco descartável antes de aplicar.
-- ============================================================================
