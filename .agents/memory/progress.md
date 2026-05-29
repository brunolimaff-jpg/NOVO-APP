# Progress

Last updated: 2026-05-29 20:30 (novos bugs preview + decisao fechar PR #314)

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

| Item                                     | Status                                                       | Link                                                          |
| ---------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| PR #314 `feat/dossier-lifecycle`         | **SENDO FECHADA** — 2 novos P0 + 1 P2 encontrados no preview | PR #314, vault novos bugs                                     |
| Branch `feat/crm-supabase-migration`     | WIP (com stashed changes)                                    | `docs/superpowers/plans/2026-05-29-crm-supabase-migration.md` |
| P0 withTimeout (api/gemini.ts:416, :491) | Documentado, nao corrigido                                   | `30-DECISOES/ACHADO-P0-WITHTIMEOUT-ABORTSIGNAL-2026-05-28.md` |

## Concluido recente

| Data       | Marco                                                                                                     | Link                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 2026-05-29 | **Decisao: fechar PR #314** — 2 novos P0 + 1 P2 no preview. Opcao 3: fechar, corrigir, squash, nova PR    | vault `2026-05-29T20-30-00-novos-bugs-preview-fechamento-pr314.md` |
| 2026-05-29 | **3 P0 corrigidos** — feat/dossier-lifecycle: cleanup race, silent errors, cross-device divergence        | PR #314, commit 0486897                                            |
| 2026-05-29 | **PR #313 MERGEADA** — fix/remove-web-search-fallback (squash 8d6e33f)                                    | PR #313                                                            |
| 2026-05-29 | **PR #312 MERGEADA** — feat/dossier-tracking-events (squash c35b45b)                                      | HANDOFF, PR #312                                                   |
| 2026-05-29 | **Code review max-effort** — feat/dossier-lifecycle: 1047 linhas, 11 arquivos, 9 angulos, 65->15 findings | vault `2026-05-29T17-30-00-code-review-dossier-lifecycle-pr313.md` |
| 2026-05-29 | **PR #311 MERGEADA** — extrai status HTTP de geminiProxy                                                  | vault PR311-PR312                                                  |
| 2026-05-29 | **PR #310 MERGEADA** — classificacao erro billing Gemini                                                  | vault PR310                                                        |
| 2026-05-29 | **PR #309 MERGEADA** — tracking operadores Supabase                                                       | vault PR311-PR312                                                  |
| 2026-05-28 | Automacoes .claude/ + trava commits + code review 9 angulos                                               | vault automacoes                                                   |
| 2026-05-28 | Code review 61 arquivos + 10 bugs corrigidos                                                              | commits                                                            |

## Comandos de validacao

```bash
npm run typecheck
npm test
npm run test:contracts
npm run test:e2e:blank
npm run test:e2e:loading
npm run test:e2e:errors
npm run lint
npm run build
```
