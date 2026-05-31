# Progress

Last updated: 2026-05-31 — Vercel Features Exploradas

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

| Item                                     | Status                                                          | Link                                                          |
| ---------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| P0 withTimeout (api/gemini.ts:416, :491) | Documentado, nao corrigido                                      | `30-DECISOES/ACHADO-P0-WITHTIMEOUT-ABORTSIGNAL-2026-05-28.md` |
| Branch `feat/crm-supabase-migration`     | WIP (com stashed changes)                                       | --                                                            |
| Branches residuais para limpar           | `refactor/remove-idb-storage`, `fix/remove-web-search-fallback` | --                                                            |

## Concluido recente

| Data       | Marco                                                                                                                                                        | Link                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 2026-05-31 | **Vercel Features Exploradas** — Audit 8 features, plano AI Gateway+Cron+Queues escrito e arquivado. Cancelado: Hobby plan limita a 12 funcoes.              | `docs/superpowers/plans/2026-05-31-vercel-ai-gateway-cron-queues.md` |
| 2026-05-31 | **PR #317 SQUASH-MERGEADA** — Simplificacao Supabase. 18 commits em 1 (7773173). 19 arquivos, +740/-2146. 1249 testes, 0 falhas.                             | vault `2026-05-31T01-30-00-merge-pr317.md`                           |
| 2026-05-30 | **Simplificacao Supabase Fase 1** — Remove offline-first (IDB + sync + merge). Supabase como fonte unica. storage.ts 872->449 linhas. 14 commits, +825/-2332 | vault `2026-05-30T18-00-00-simplificacao-supabase.md`                |
| 2026-05-29 | **Decisao: fechar PR #314** — 2 novos P0 + 1 P2 no preview. Opcao 3: fechar, corrigir, squash, nova PR                                                       | vault `2026-05-29T20-30-00-novos-bugs-preview-fechamento-pr314.md`   |
| 2026-05-29 | **3 P0 corrigidos** — feat/dossier-lifecycle: cleanup race, silent errors, cross-device divergence                                                           | PR #314, commit 0486897                                              |
| 2026-05-29 | **PR #313 MERGEADA** — fix/remove-web-search-fallback (squash 8d6e33f)                                                                                       | PR #313                                                              |
| 2026-05-29 | **PR #312 MERGEADA** — feat/dossier-tracking-events (squash c35b45b)                                                                                         | HANDOFF, PR #312                                                     |
| 2026-05-29 | **Code review max-effort** — feat/dossier-lifecycle: 1047 linhas, 11 arquivos, 9 angulos, 65->15 findings                                                    | vault `2026-05-29T17-30-00-code-review-dossier-lifecycle-pr313.md`   |

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
