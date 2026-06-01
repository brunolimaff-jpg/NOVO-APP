# Progress

Last updated: 2026-06-01 — Sentry integrado no frontend, branch feature/sentry-error-monitoring

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `docs/obsidian/daily/` — ver `docs/obsidian/OBSIDIAN-README.md`.
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

| Item                                           | Status                                 | Link                                                          |
| ---------------------------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| P0 withTimeout (api/gemini.ts:416, :491)       | Documentado, nao corrigido             | `30-DECISOES/ACHADO-P0-WITHTIMEOUT-ABORTSIGNAL-2026-05-28.md` |
| Branch `feat/crm-supabase-migration`           | WIP (com stashed changes)              | —                                                             |
| Branches residuais para limpar                 | 5+ branches restart-loop + outras      | —                                                             |
| Sentry DSN real no .env                        | Pendente — desabilitado ate configurar | `.env.example`                                                |
| PR da branch `feature/sentry-error-monitoring` | Nao aberta                             | —                                                             |

## Concluido recente

| Data       | Marco                                                                                                                                                                               | Link                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 2026-06-01 | **SENTRY INTEGRADO** — `@sentry/react` + `Sentry.init()` em `index.tsx` + 3 ErrorBoundaries (global, chat, dossier) + Sentry MCP server. Branch `feature/sentry-error-monitoring`.  | `e34ee919`, `index.tsx`, `components/ErrorBoundary.tsx`              |
| 2026-06-01 | **MERGE MAIN NA BRANCH SENTRY** — `061cccbe` traz PRs #321 (WaterfallGuard oficial) e #322 (5 correcoes anti-restart-loop, StrictMode removido) para a branch Sentry.               | `061cccbe`                                                           |
| 2026-06-01 | **PR #322 MERGEADA** — 5 correcoes anti-restart-loop. StrictMode removido producao, re-entry guard, callerStack diagnostic, loadingVariant reset, generationBefore/After guard.     | `0370a5ec`, `index.tsx`, `message-orchestrator.ts`                   |
| 2026-06-01 | **PR #321 SQUASH-MERGEADA** — WaterfallGuard: floodgate anti-restart-loop. 4 arquivos, +674/-435. Diagnosticos Supabase + PostCompletion com restart detection + useRef no cleanup. | `features/dossier/waterfall-guard.ts`, commit `7aca0032`             |
| 2026-05-31 | **Vercel Features Exploradas** — Audit 8 features, plano AI Gateway+Cron+Queues escrito e arquivado. Cancelado: Hobby plan limita a 12 funcoes.                                     | `docs/superpowers/plans/2026-05-31-vercel-ai-gateway-cron-queues.md` |
| 2026-05-31 | **PR #317 SQUASH-MERGEADA** — Simplificacao Supabase. 18 commits em 1 (7773173). 19 arquivos, +740/-2146. 1249 testes, 0 falhas.                                                    | vault `2026-05-31T01-30-00-merge-pr317.md`                           |
| 2026-05-30 | **Simplificacao Supabase Fase 1** — Remove offline-first (IDB + sync + merge). Supabase como fonte unica. storage.ts 872->449 linhas. 14 commits, +825/-2332                        | vault `2026-05-30T18-00-00-simplificacao-supabase.md`                |

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
