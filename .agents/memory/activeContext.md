# Active Context

Last updated: 2026-05-29 15:30 (PR #312 mergeada)

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`

## Fase atual

**PR #312 mergeada.** Branch `feat/dossier-tracking-events` fechada.
Main local desatualizada (git pull pendente).
Branch `feat/crm-supabase-migration` com WIP existente.
**Proximo passo: git pull origin main + deletar branch local + definir prioridade (P0 withTimeout vs CRM migration).**

### PR #312 — dossier-tracking-events

| Item                                  | Status                        |
| ------------------------------------- | ----------------------------- |
| Branch `feat/dossier-tracking-events` | **MERGED** (commit `c35b45b`) |
| trackOperatorEvent fire-and-forget    | Em producao                   |
| Bug stale closure (deps array)        | Corrigido (commit `fd344a1`)  |
| Bug LoadingSmart travado benchmark    | Corrigido (commit `e67adf2`)  |
| Local main desatualizada              | Pendente (git pull)           |

### Pendencias da sessao anterior (PR #309 merge)

| Item                                                      | Status                          |
| --------------------------------------------------------- | ------------------------------- |
| P0 withTimeout AbortSignal (api/gemini.ts:416, :491)      | **NAO CORRIGIDO** — documentado |
| Unique constraint `email_normalized` no Supabase          | Pendente                        |
| Branch residual `fix/gemini-billing-error-classification` | Verificar                       |

### Validacao

- `tsc --noEmit`: limpo (ultima execucao conhecida)
- `npm test`: 142/142 files, 1242/1242 testes (100%)
- Preview Vercel: travamento benchmark corrigido, loading funciona

## Proximo passo

1. `git pull origin main` para sincronizar main local
2. `git branch -d feat/dossier-tracking-events` (branch ja mergeada)
3. Definir prioridade:
   - **Opcao A:** Corrigir P0 withTimeout + AbortSignal (api/gemini.ts:416, :491)
   - **Opcao B:** Iniciar CRM Supabase migration (plano em `docs/superpowers/plans/2026-05-29-crm-supabase-migration.md`)
4. Rodar `git log main..HEAD --oneline` em qualquer branch nova a cada 5 commits

## Ponteiros

- `HANDOFF_AI.md`
- Vault: `2026-05-29T15-30-00-fechamento-pr312-dossier-tracking-events.md`
- Vault (abertura PR #312): `2026-05-29T15-00-00-fechamento-pr311-pr312-supabase-cleanup.md`
- Plano CRM: `docs/superpowers/plans/2026-05-29-crm-supabase-migration.md`
- P0 withTimeout: `30-DECISOES/ACHADO-P0-WITHTIMEOUT-ABORTSIGNAL-2026-05-28.md`
- `CALIBER_LEARNINGS.md`
