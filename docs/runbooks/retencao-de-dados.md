# Runbook: Retenção de Dados (Proposta)

## Status
**PROPOSTA** — não implementada. Nenhum purge automático ativo.

## Tabelas e Políticas Sugeridas

| Tabela | Retenção | Ação |
|--------|----------|------|
| `dossier_runs` | 90 dias | `DELETE WHERE completed_at < now() - interval '90 days' AND status IN ('COMPLETED','FAILED','CANCELLED')` |
| `dossies` | 2 anos | Arquivar (soft delete) ou mover para cold storage |
| `extract_cache` | 30 dias | `DELETE WHERE updated_at < now() - interval '30 days'` |
| `feedback_events` | 1 ano | Manter para auditoria |
| `operator_events` | 180 dias | `DELETE WHERE created_at < now() - interval '180 days'` |
| `operator_sessions` | 90 dias | `DELETE WHERE last_seen < now() - interval '90 days'` |
| `user_context` | Vitalício | Vinculado a `profiles` (não expirar) |

## Implementação
- Cron job via `pg_cron` (Supabase) ou Vercel Cron
- Dry-run mensal antes de ativar
- Backup point-in-time antes de qualquer DELETE

## Aprovação
Requer sign-off: Legal, Security, Product. Não ativar sem aprovação.
