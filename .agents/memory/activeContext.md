# Active Context

Last updated: 2026-05-29 18:30 (Resolucao merge conflict + PR #314 aberta)

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`

## Fase atual

**Resolucao merge conflict PR #313 concluida. PR #314 dossier-lifecycle aberta. Ambos os PRs aguardando CI/revisao.**

### PR #313 — fix/remove-web-search-fallback

| Item                      | Status                      |
| ------------------------- | --------------------------- |
| Branch remota             | Pushada                     |
| PR #313 aberta            | Aberta                      |
| Merge conflict resolvido  | CONCLUIDO (2 conflitos)     |
| Gemini Code Assist review | Resolvido (6c7ef13)         |
| MergeStateStatus          | **MERGEABLE** (CI pendente) |

### PR #314 — feat/dossier-lifecycle (10 commits)

| Item                            | Status                          |
| ------------------------------- | ------------------------------- |
| Trava CNPJ duplicado            | Implementado (0415e40)          |
| Modal dossie duplicado          | Implementado (6e64e57)          |
| findExistingDossier             | Implementado (e276d9f)          |
| DossierShareBar + link Teams    | Implementado (9f5d32b, 626f97d) |
| Code review (65 -> 15 findings) | CONCLUIDO                       |
| PR #314 aberta                  | Aberta                          |
| 3 P0 corrigidos                 | Pendente                        |

### Pendencias de sessoes anteriores

| Item                                                      | Status                          |
| --------------------------------------------------------- | ------------------------------- |
| P0 withTimeout AbortSignal (api/gemini.ts:416, :491)      | **NAO CORRIGIDO** — documentado |
| Unique constraint `email_normalized` no Supabase          | Pendente                        |
| Branch residual `fix/gemini-billing-error-classification` | Verificar                       |

## Proximo passo

1. Aguardar CI da PR #313 (Build, Tests, Typecheck, Dossier Golden)
2. Se verde: mergear PR #313 e acompanhar deploy (verificar tela branca)
3. Corrigir 3 P0 + 2 P1 do code review na PR #314
4. Submeter nova revisao da PR #314

## Ponteiros

- `HANDOFF_AI.md`
- PR #313: https://github.com/brunolimaff-jpg/NOVO-APP/pull/313
- PR #314: https://github.com/brunolimaff-jpg/NOVO-APP/pull/314
- Vault: `2026-05-29T18-30-00-resolucao-merge-conflict-pr313-pr314.md`
- `CALIBER_LEARNINGS.md`
- `docs/superpowers/plans/2026-05-29-crm-supabase-migration.md`
- `docs/superpowers/plans/2026-05-29-dossier-lifecycle.md`
