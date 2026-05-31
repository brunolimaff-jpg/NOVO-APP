# Active Context

Last updated: 2026-05-31 — Vercel Features Exploradas (plano cancelado)

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`

## Fase atual

**Audit Vercel Features completo. Plano de implementacao escrito e arquivado.**

### Pendencias de sessoes anteriores

| Item                                                 | Status                          |
| ---------------------------------------------------- | ------------------------------- |
| P0 withTimeout AbortSignal (api/gemini.ts:416, :491) | **NAO CORRIGIDO** — documentado |
| Unique constraint `email_normalized` no Supabase     | Pendente                        |
| Branch residual `fix/remove-web-search-fallback`     | Branch local existe, mergeada   |
| Branch `feat/crm-supabase-migration`                 | Stashed, precisa decidir        |
| `waterfallLogger.ts` nao removido                    | Confirmar com Bruno             |
| Branch `refactor/remove-idb-storage` local           | Mergeada, pode deletar          |
| Main local desatualizado (0b38ebe vs origin 7773173) | Precisa `git pull origin main`  |

## Decisoes desta sessao

- **Vercel Features: plano cancelado.** Hobby plan limita a 12 funcoes (plano precisaria de 16), AI Gateway e Queues requerem Pro. Upgrade para Pro (US$ 20/mes) necessario para viabilizar.
- Plano commitado em `424faab5` para referencia futura.

## Proximo passo

1. Sincronizar `main` local com origin (`git pull origin main`)
2. Deletar branches residuais locais
3. Decidir sobre CRM migration stashed
4. Corrigir P0 withTimeout quando houver janela

## Ponteiros

- `HANDOFF_AI.md`
- Plano Vercel: `docs/superpowers/plans/2026-05-31-vercel-ai-gateway-cron-queues.md`
- Commit: `424faab5`
- PR #317: `77731735`
