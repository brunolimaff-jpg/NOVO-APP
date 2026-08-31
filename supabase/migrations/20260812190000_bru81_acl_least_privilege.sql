-- BRU81-ACL-LEAST-PRIV-01 — fecha o desvio de least privilege nas 2 RPCs novas.
--
-- O default privilege do Supabase concedeu EXECUTE a service_role na criação
-- de complete_dossier_run_with_dossier e save_dossiers_autosave. O contrato
-- auditado exige execução SOMENTE por authenticated (auth.uid() já é exigido
-- dentro das funções; service_role não tem fluxo que as chame).
--
-- Aditiva e mínima: NÃO altera a lógica das RPCs nem a migration histórica
-- 20260812170000 (que permanece byte-idêntica).
-- acquire_dossier_run_lease NÃO é alterada (ACL histórico preservado).

REVOKE EXECUTE ON FUNCTION public.complete_dossier_run_with_dossier(uuid, text, jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.save_dossiers_autosave(jsonb) FROM service_role;
