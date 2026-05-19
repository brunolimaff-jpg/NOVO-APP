# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `423f821` |
| Working branch | `codex/sprint-11-onda-0-5-mini-crm-local-fixes` |
| Last updated | `2026-05-19` |
| Current phase | `sprint_11_onda_1b_loading_smart` |
| Current sprint | `Sprint 11` |
| Overall status | `loading_smart_view_model_green` |
| Current baseline | PR `#259` concluída na branch de trabalho; `main` local ainda em PR `#258` (`423f821`) |

## Current Focus

- Executar a Onda 1B em `LoadingSmart` sem alterar a fachada pública.
- Manter `components/LoadingSmart.tsx` como default export consumido pelo App.
- Extrair primeiro a lógica pura de timeline/progresso para helper testável.
- Manter `WarRoom` fora deste PR.

## Next Up

1. Completar a segunda fatia de `LoadingSmart`: extrair hook de curiosidades/timers ou encerrar o PR se o corte ficar pequeno.
2. Rodar gate ampliado da Sprint 11 quando a fatia fechar.
3. Depois iniciar Onda 1C em `WarRoom`, em PR separado.

## Blocked

- Nenhum bloqueio técnico imediato.
- `CODE.md` está não rastreado no workspace atual e deve ser preservado sem alteração nesta onda.

## Validation

- Onda 0+1:
  - `npm exec vitest run tests/features/dossier/porta-reconciliation.test.ts tests/features/dossier/waterfall-orchestrator.test.ts` green (`15` testes)
  - `npm exec vitest run tests/services/clientLookupService.test.ts tests/extraction.test.ts` green (`20` testes)
  - `npm run typecheck` green
  - `npm run test` green (`114` arquivos, `846` testes)
  - `npm run build` green (warnings aceitos OI-003/OI-057)
  - `npm run lint` green com `0` erros e `150` warnings conhecidos
  - `npm run analyze:circular` green, sem ciclos
- OI-066:
  - PR `#256` mergeada em `main` (`66591f1`)
  - `npm exec vitest run tests/components/MessageRow.test.tsx tests/components/chat/MessageTimeline.test.tsx` green (`18` testes)
  - `npm run typecheck` green
  - `npm run build` green
  - `npm run lint` green com `0` erros e `147` warnings conhecidos
- Sprint 10:
  - PR `#257` mergeada em `2026-05-16` (`fbf5536`)
  - `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`40` testes)
  - review comments do Gemini Code Assist resolvidos (`forceScan` manual + `scoutDiag.error`)
  - `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/architecture/radarBoundaryImportGuard.test.ts` green (`35` testes)
  - `npm exec vitest run tests/components/chat/ChatPanels.test.tsx tests/components/EmptyStateHome.test.tsx` green (`11` testes)
  - `npm exec vitest run tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`7` testes)
  - `npm run typecheck` green
  - `npm run test` green (`115` arquivos, `851` testes)
  - `npm run build` green (warnings aceitos OI-003/OI-057)
  - `npm run lint` green com `0` erros e `147` warnings conhecidos
  - `npm run analyze:circular` green, sem ciclos
  - checks remotos green: AI Config Quality Score, Typecheck, Build, Tests, Dossier Golden, GitGuardian, Vercel, Vercel Preview Comments
- Sprint 11 Onda 0:
  - PR `#258` mergeada em `main` (`423f821`)
  - testes de caracterização para `WarRoom` criados; cobertura de `CRMDetail` ficou histórica após decisão de remover Mini CRM.
- Sprint 11 Onda 0.5:
  - PR `#259` concluída na branch `codex/sprint-11-onda-0-5-mini-crm-local-fixes`
  - Mini CRM local removido do runtime/contratos/tipos/testes dedicados.
  - `config/localDevApiProxy.ts` centraliza proxies Vite e inclui `/api/open-web-search`.
  - Gates locais registrados: `typecheck`, `test`, `build`, `lint` e `analyze:circular` verdes; warnings conhecidos mantidos como backlog.
- Sprint 11 Onda 1A:
  - canônicos de plano reconciliados; `CRMDetail` aparece apenas como histórico/removido.
  - `npm run docs:obsidian:check`: green (`14` notas).
- Sprint 11 Onda 1B:
  - `utils/loadingSmartViewModel.ts` criado para timeline/progresso.
  - `components/LoadingSmart.tsx` reduzido de `766` para `672` linhas, mantendo fachada/default export.
  - `npm exec vitest run tests/utils/loadingSmartViewModel.test.ts tests/components/LoadingSmart.test.tsx tests/App.loadingVariant.test.tsx`: green (`18` testes).
  - `npm run typecheck`: green.

## Known Accepted Warnings

- `tests/components/SessionsSidebar.test.tsx` ainda emite `Functions are not valid as a React child` (OI-004).
- Build ainda emite warning de chunking em `utils/idbStorage.ts` (OI-003).
- `npm run lint` passa, mas com backlog de warnings (OI-005).
- OI-055: Pinecone via `VITE_*` aceito pelo owner para app interno/fechado.

## Sprint Tracker

| Sprint | Goal | Status | Exit Criteria | Rollback Point | Primary Files/Modules |
|---|---|---|---|---|---|
| 1 | Baseline e fronteiras | done | auth legado removido e fronteiras documentadas | `origin/main@3c1412e` | `App.tsx`, `contexts/OperatorContext.tsx`, `services/geminiService.ts` |
| 2 | Quebrar Gemini | done | `services/gemini/*` ativo sem quebrar fachada | `origin/main@ef30b5d` | `services/geminiService.ts`, `services/gemini/*` |
| 3 | Extrair chat do App | done | `features/chat/*` ativo e validado | `origin/main@510f91f` | `App.tsx`, `features/chat/*` |
| 4 | Extrair dossie do App | done | `features/dossier/*` + stores/boundaries ativos | `start-of-sprint-4` | `features/dossier/*`, `stores/*` |
| 5 | Modularizar ChatInterface | done | shell `components/chat/*` com fachada estavel | `origin/main@16c8f2e` | `components/ChatInterface.tsx`, `components/chat/*` |
| 6 | Dividir megaPrompts | done | `prompts/mega/*` ativo, facade preservada | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | done | `hooks/useChat.ts` removido + `constants.ts` enxuto | `start-of-sprint-7` | `constants.ts`, `constants/market-intelligence.ts`, `services/apiConfig.ts` |
| 8 | War Room + Radar stub | done | `services/war-room/*` ativo + facade preservada + `features/radar/*` stub | `start-of-sprint-8` | `services/warRoomService.ts`, `services/war-room/*`, `features/radar/*` |
| 9 | App shell decoupling + governanca | done | PR `#254` mergeada em `main` (`922a403`) | `pre-sprint-9` | `App.tsx`, `features/chat/*`, `features/dossier/*` |
| Onda 0+1 | Cleanup base + primeira correção técnica | done | PR `#255` mergeada em `main` (`0550454`) | `origin/main@922a403` | docs/memory, `features/dossier/*`, logs cliente |
| OI-066 | Delete icon Unicode hotfix | done | PR `#256` mergeada em `main` (`66591f1`) | `origin/main@0550454` | `components/MessageRow.tsx` |
| 10 | Radar boundary completion | done | PR `#257` mergeada em `main` (`fbf5536`) | `origin/main@66591f1` | `features/radar/*`, `hooks/useRadar.ts`, `services/radarService.ts` |
| 11 Onda 0 | Testes de caracterização | done | PR `#258` mergeada em `main` (`423f821`) | `origin/main@fbf5536` | `tests/components/WarRoom.test.tsx`, `tests/components/LoadingSmart.test.tsx` |
| 11 Onda 0.5 | Remoção Mini CRM + proxies locais | done | PR `#259` concluída; Mini CRM removido e `/api/open-web-search` proxied localmente | `origin/main@423f821` | `vite.config.ts`, `config/localDevApiProxy.ts`, contratos Mini CRM removidos |
| 11 Onda 1A | Saneamento documental | done | canônicos sem duplicação de próximos passos; `CRMDetail` aparece só como histórico/removido | `start-of-sprint-11` | `HANDOFF_AI.md`, `.agents/memory/*`, `docs/ai-context/refactor/*`, `docs/obsidian/*` |
| 11 Onda 1B | `LoadingSmart` | active | fachada preservada; helper de timeline/progresso extraído com testes; próxima fatia é hook de curiosidades/timers | `post-onda-1a` | `components/LoadingSmart.tsx`, `utils/loadingSmartViewModel.ts`, `tests/utils/loadingSmartViewModel.test.ts` |
| 11 Onda 1C | `WarRoom` | planned | props públicas preservadas e UI estática extraída antes de hook de sessão | `post-onda-1b` | `components/WarRoom.tsx`, `components/war-room/*` |
| 12 | Hardening final | planned | warnings operacionais e guardrails fechados | `start-of-sprint-12` | `tests/*`, `utils/idbStorage.ts`, docs de closeout |
