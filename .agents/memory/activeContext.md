# Active Context

Last updated: 2026-05-29 20:30 (novos bugs preview + decisao fechar PR #314)

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`

## Fase atual

**PR #313 mergeada. 3 P0 corrigidos. Novos bugs encontrados no preview. Decisao: fechar PR #314 e abrir nova PR limpa.**

### PR #313 — fix/remove-web-search-fallback

| Item         | Status                    |
| ------------ | ------------------------- |
| Branch       | MERGEADA (squash 8d6e33f) |
| Branch local | Ainda existe (deletar)    |

### PR #314 — feat/dossier-lifecycle (sendo fechada)

| Item                               | Status                                  |
| ---------------------------------- | --------------------------------------- |
| Trava CNPJ duplicado               | Implementado                            |
| Modal dossie duplicado             | Implementado                            |
| findExistingDossier                | Implementado                            |
| DossierShareBar + link Teams       | Implementado                            |
| Code review (65 -> 15 findings)    | CONCLUIDO                               |
| 3 P0 corrigidos (0486897)          | CONCLUIDO                               |
| **Novo P0: operator_email null**   | **PENDENTE** (storage.ts)               |
| **Novo P0: tela branca transicao** | **PENDENTE** (renderStateClassifier.ts) |
| **Novo P2: dynamic import**        | **PENDENTE** (DossierShareBar.tsx)      |
| CI                                 | Pendente                                |
| **Decisao: fechar PR #314**        | **NOVA PR**                             |

### Pendencias de sessoes anteriores

| Item                                                      | Status                          |
| --------------------------------------------------------- | ------------------------------- |
| P0 withTimeout AbortSignal (api/gemini.ts:416, :491)      | **NAO CORRIGIDO** — documentado |
| Unique constraint `email_normalized` no Supabase          | Pendente                        |
| Branch residual `fix/gemini-billing-error-classification` | Verificar                       |

## Proximo passo

1. Corrigir `operator_email: null` em `services/storage.ts:153-218`
2. Corrigir tela branca em `utils/renderStateClassifier.ts`
3. Corrigir dynamic import em `DossierShareBar.tsx:22`
4. Squash commits (3-4 semanticos)
5. Abrir nova PR limpa
6. Retomar CRM migration (`feat/crm-supabase-migration`)

## Ponteiros

- `HANDOFF_AI.md`
- PR #314: https://github.com/brunolimaff-jpg/NOVO-APP/pull/314
- PR #313 (merged): https://github.com/brunolimaff-jpg/NOVO-APP/pull/313
- Preview: `scoutagro-git-feat-dossier-lifecycle-brunolimaff-3629s-projects.vercel.app`
- Vault novos bugs: `Bruno Vault/20-SESSOES/2026-05/2026-05-29T20-30-00-novos-bugs-preview-fechamento-pr314.md`
- `CALIBER_LEARNINGS.md`
