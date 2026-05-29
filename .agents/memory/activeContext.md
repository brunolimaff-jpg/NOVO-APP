# Active Context

Last updated: 2026-05-29 14:15 (PR #313 mergeada + 3 P0 corrigidos na PR #314)

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`

## Fase atual

**PR #313 mergeada. 3 P0 corrigidos na feat/dossier-lifecycle. PR #314 atualizada.**

### PR #313 — fix/remove-web-search-fallback

| Item            | Status                    |
| --------------- | ------------------------- |
| Branch          | MERGEADA (squash 8d6e33f) |
| Branch local    | Ainda existe (deletar)    |

### PR #314 — feat/dossier-lifecycle

| Item                            | Status                        |
| ------------------------------- | ----------------------------- |
| Trava CNPJ duplicado            | Implementado                  |
| Modal dossie duplicado          | Implementado                  |
| findExistingDossier             | Implementado                  |
| DossierShareBar + link Teams    | Implementado                  |
| Code review (65 -> 15 findings) | CONCLUIDO                     |
| 3 P0 corrigidos                 | **CONCLUIDO** (0486897)       |
| 2 P1 restantes                  | Pendente                      |
| 7 P2 restantes                  | Pendente                      |
| 3 P3 restantes                  | Pendente                      |
| CI                              | Pendente                      |

### Pendencias de sessoes anteriores

| Item                                                      | Status                          |
| --------------------------------------------------------- | ------------------------------- |
| P0 withTimeout AbortSignal (api/gemini.ts:416, :491)      | **NAO CORRIGIDO** — documentado |
| Unique constraint `email_normalized` no Supabase          | Pendente                        |
| Branch residual `fix/gemini-billing-error-classification` | Verificar                       |

## Proximo passo

1. Aguardar CI da PR #314
2. Se verde: mergear OU corrigir P1/P2 restantes primeiro
3. Retomar CRM migration (`feat/crm-supabase-migration`)

## Ponteiros

- `HANDOFF_AI.md`
- PR #314: https://github.com/brunolimaff-jpg/NOVO-APP/pull/314
- PR #313 (merged): https://github.com/brunolimaff-jpg/NOVO-APP/pull/313
- Vault code review: `Bruno Vault/20-SESSOES/2026-05/2026-05-29T17-30-00-code-review-dossier-lifecycle-pr313.md`
- `CALIBER_LEARNINGS.md`
