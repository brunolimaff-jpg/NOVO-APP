# Runbook: Retenção de Dados (Proposta)

> **Status:** **PROPOSTA** — não implementada. Nenhum purge automático ativo.

## Tabelas e Políticas Sugeridas (PROPOSTA)

**Ambientes onde cada tabela existe (Jul/2026):**

| Tabela | Produção | Preview | Coluna temporal | Retenção sugerida |
|--------|----------|---------|-----------------|-------------------|
| `dossier_runs` | **NÃO existe** | Sim | `completed_at` (Preview) | 90 dias (proposta) |
| `dossies` | Sim | Sim | `updated_at` | 2 anos (proposta) |
| `extract_cache` | **NÃO existe** | Sim | `expires_at` ou `created_at` | 30 dias (proposta) |
| `feedback_events` | **NÃO existe** | Sim | `created_at` | 1 ano (proposta) |
| `operator_events` | Sim | Sim | `created_at` | 180 dias (proposta) |
| `operator_sessions` | Sim | Sim | `last_seen_at` | 90 dias (proposta) |
| `user_context` | Sim | Sim | — | Vitalício (proposta) |

**Ações sugeridas (PROPOSTA, não implementadas):**

```sql
-- dossier_runs (apenas Preview): 
-- DELETE WHERE completed_at < now() - interval '90 days'
--   AND status IN ('COMPLETED','FAILED','CANCELLED');

-- extract_cache (apenas Preview):
-- DELETE WHERE expires_at < now() OR created_at < now() - interval '30 days';

-- operator_events (Produção + Preview):
-- DELETE WHERE created_at < now() - interval '180 days';

-- operator_sessions (Produção + Preview):
-- DELETE WHERE last_seen_at < now() - interval '90 days';
```

**Notas de schema (a validar antes de ativar):**
- `extract_cache` tem `expires_at`, `created_at`, `synced_at` — **não tem `updated_at`**.
- `operator_sessions` tem `last_seen_at` — **não tem `last_seen`**.
- `dossier_runs` e `extract_cache` e `feedback_events` **não existem em Produção** (Jul/2026).
- Validar colunas e existência de tabelas em ambos os ambientes antes de ativar qualquer purge.

## Implementação (PROPOSTA, sujeita a aprovação)

- **pg_cron (Supabase)** OU **Vercel Cron** — ambos viáveis; escolher por consistência com stack atual.
- **Dry-run mensal** antes de ativar.
- **Backup point-in-time** antes de qualquer `DELETE`.
- Esta PR **não implementa** purge. Toda retenção aqui é proposta para discussão.

## Aprovação
Requer sign-off: Legal, Security, Product. Não ativar purge sem aprovação formal e validação de schema atualizado.
