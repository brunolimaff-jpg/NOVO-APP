# Progress

Last updated: 2026-06-03 — fix freeze dossiê hero

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

| Item                                        | Status                                                               | Link                   |
| ------------------------------------------- | -------------------------------------------------------------------- | ---------------------- |
| PR #328 — Tela branca pos-waterfall         | **ABERTA**, branch `fix/waterfall-session-persist-race-condition`, aguardando novo CI remoto | PR #328, HANDOFF_AI.md |
| sessionToPersist null — causa raiz primaria | **CORRIGIDA LOCALMENTE** — monitorar preview/Supabase diagnostics     | PR #328                |
| Sessao orfa por disparo inicial duplicado   | **CORRIGIDA LOCALMENTE** — validar preview apos push                  | PR #328                |
| Freeze dossiê hero — main thread + Virtuoso durante Compliance | **PR aberta** — overlay/stop/guard persist | fix/hero-loading-freeze-session |
| PR #327 — Socio-search decomposition        | **ABERTA**, branch `refactor/socio-search-decompose`, com rastreio de painel branco + fallback estático + gates E2E longos adicionados | PR #327, HANDOFF_AI.md |
| Interromper pesquisa inicial                | **CORRIGIDO LOCALMENTE** — abort remove sessão temporária e impede consolidação/save tardio | PR #327, `message-orchestrator`, `waterfall-orchestrator` |
| 3 god modules restantes                     | docExtractor (533L), textCleaners (630L), clientLookupService (741L) | HANDOFF_AI.md          |
| P0 withTimeout (api/gemini.ts:416, :491)    | Nao corrigido                                                        | HANDOFF_AI.md          |
| Branch `feat/crm-supabase-migration`        | Stashed, nao decidido                                                | --                     |

## Concluido recente

| Data       | Marco                                                                                                                                                                                                                                                    | Link                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 2026-06-03 | **PR #327 cancelamento de pesquisa** — `Interromper` durante pesquisa inicial não deixa sessão no histórico, volta para home e impede waterfall de consolidar/salvar relatório após abort. | PR #327, `features/chat/message-orchestrator.ts`, `features/dossier/waterfall-orchestrator.ts` |
| 2026-06-03 | **PR #327 fallback de tela branca** — evidência real mostrou Virtuoso `itemsRendered` sem conteúdo visível. `ChatInterface` ativa `forceStaticTimelineFallback`; `MessageTimeline` pula Virtuoso e renderiza `MessageRow` estático. | PR #327, `components/ChatInterface.tsx`, `components/chat/MessageTimeline.tsx` |
| 2026-06-03 | **PR #327 observabilidade de tela branca** — detector `BlankPanel` no painel central, `captureMessage` Sentry, sanitizer preservando métricas seguras, índices Supabase em `scout_diagnostics`, E2E blank/loading exigindo bot longo visível. | PR #327, `utils/blankPanelTelemetry.ts`, Supabase `blank_panel_observability` |
| 2026-06-02 | **PR #328 follow-up 2** — nova evidencia de preview: waterfall completava e persistia, mas segunda chamada inicial criava sessao orfa selecionada. `pendingInitialSendRef` bloqueia duplicacao antes do re-render. Typecheck OK, 1290 testes OK, build OK. | PR #328                                                  |
| 2026-06-02 | **PR #328 aberta** — Tela branca pos-waterfall mitigada. 6 commits, 17 arquivos. Fallback sessionsRef + merge funcional + 10 diagnosticos + DossierShareBar removido. **1289 testes, 0 erros.** sessionToPersist null persiste como causa raiz residual. | PR #328, commits `dee6557c`..`1a5100a9`                  |
| 2026-06-02 | **PR #328 follow-up** — causa raiz primaria corrigida localmente. `updateSessionById` retorna snapshot, `setSessions` sincroniza `sessionsRef`, `activeGenerationRef` limpa no finally, E2E critico deterministico adicionado ao CI. **1289 testes + E2E critico 9/9 + build OK.** | PR #328                                                  |
| 2026-06-02 | **Merge funcional no useAppInitialization** — `setSessions(() => localSessions)` vira `prev => merge(loaded, prev)`. Elimina overwrite de sessions na inicializacao.                                                                                     | PR #328, `44951b6b`                                      |
| 2026-06-02 | **Waterfall bug fix** — fallback sessionsRef quando updateSessionById perde a sessao por React batching. 10 diagnosticos + health-check. Branch `fix/waterfall-session-persist-race-condition` (PR #328)                                                 | PR #328, `7ef4dbb4`                                      |
| 2026-06-01 | **PR #327 aberta** — socio-search.ts 1350->149 linhas decomposto em 6 modulos (services/socio-search/). 1283 testes, typecheck limpo.                                                                                                                    | PR #327, `d7a4bc55`                                      |
| 2026-06-01 | **PR #326 MERGEADA** — 4 god components decompostos + Jules Tracks A-D completos. `7362af16`. 12 commits, 1283 testes.                                                                                                                                   | PR #326, `7362af16`                                      |
| 2026-06-01 | **Jules Track B (Qualidade)** — 19 itens: B1 Tailwind constantes, B2 templates constantes, B3 funcoes nomeadas, B4 SVG sanitizado + URLs extraidas + TODOs removidos                                                                                     | `1e7baab0`, `6e1c6ab8`, `798ea53a`, `b993872b`           |
| 2026-06-01 | **Jules Track C (Testes)** — 34 novos testes: errorBoundaryAudit (10), supabaseClient (2), documentExtractor (1->16), security-headers + comex (7)                                                                                                       | `a9237905`                                               |
| 2026-06-01 | **Jules Track D (Arquitetura)** — benchmark fallback visual + React Compiler apenas em dev                                                                                                                                                               | `5e502253`, `28877fb9`                                   |
| 2026-06-01 | **Code reviews** — 11 threads PR #320 + 6 threads PR #326 + 2 threads PR #327 = 19 resolvidas                                                                                                                                                            | PR #326, PR #320, PR #327                                |
| 2026-06-01 | **Decomposicao Fase 1** — 4 god modules decompostos (storage.ts, LoadingSmart, SocietaryMap, EmptyStateHome). +1450/-974. 1249 testes, 0 falhas. PR #326 aberta.                                                                                         | PR #326, commits `f214ebc1`..`4a6e20b2`                  |
| 2026-06-01 | **Jules Track A (Performance)** — Map indexes O(1) socio, fetch paralelo documentExtractor, paginacao paralela consultasocio.com                                                                                                                         | `bb759f44`, `3ed42808`                                   |
| 2026-06-01 | **Rebase waterfall** — branch refactor/decompose-and-optimize rebaseada no main. Waterfall-orchestrator.ts 100% identico ao main                                                                                                                         | `c41f001a`                                               |
| 2026-05-31 | **Vercel Features Exploradas** — Audit 8 features, plano AI Gateway+Cron+Quezes escrito e arquivado. Cancelado: Hobby plan limita a 12 funcoes.                                                                                                          | `docs/superpowers/plans/2026-05-31-vercel-ai-gateway...` |
| 2026-05-31 | **PR #317 SQUASH-MERGEADA** — Simplificacao Supabase. 18 commits em 1 (7773173). 19 arquivos, +740/-2146. 1249 testes, 0 falhas.                                                                                                                         | vault `2026-05-31T01-30-00-merge-pr317.md`               |

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
