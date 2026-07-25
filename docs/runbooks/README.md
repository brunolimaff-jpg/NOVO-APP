# Runbooks Operacionais — Senior Scout 360

| Runbook | Descrição |
|---------|-----------|
| [litellm-5xx.md](litellm-5xx.md) | Gateway LiteLLM retorna 5xx |
| [supabase-outage.md](supabase-outage.md) | Supabase indisponível |
| [sentry-privacy.md](sentry-privacy.md) | PII no Sentry |
| [retencao-de-dados.md](retencao-de-dados.md) | Política de retenção (proposta) |

## Arquitetura Atual (Jul/2026)

- **Gateway dossiê:** `api/dossier.ts` → `api/_dossier-llm-gateway.ts` → LiteLLM (`scout-dossier-generate`)
- **Auth:** Supabase Auth (JWT) + `profiles` table → `operator_id` canônico
- **RLS:** `dossier_runs`, `dossies`, `extract_cache`, `feedback_events` — policies via `auth.uid() -> profiles.operator_id`
- **Preview isolado:** `xlvsrnbynpawgfapowec` (separado de Produção `vmqfcaoirjcfucvlnpig`)
- **Legado (ainda presente):** `api/gemini.ts` para compatibilidade — será removido em PR futura

## Não Documentado Aqui
- Clerk (removido)
- `VITE_SUPABASE_URL` hardcoded (usar Vercel env)
- Pipeline v2 / waterfall antigo (substituído por gateway/lifecycle)
