-- Drop FK constraint on operator_events.session_id
-- Motivo: eventos podem disparar antes da sessao ser criada no banco (race condition).
-- O session_id e gerado no cliente e consistente entre operador_sessions e operador_events.
-- A FK nao agrega valor de integridade — eventos sao fire-and-forget e falhas sao silenciosas.
-- O erro 409 (FK violation) estava causando perda silenciosa de eventos de tracking.
ALTER TABLE operator_events DROP CONSTRAINT IF EXISTS operator_events_session_id_fkey;
