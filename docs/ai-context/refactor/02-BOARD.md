# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `66591f16f5463e7ab40bb718ec886a88f52eae40` |
| Working branch | `codex/sprint-10-radar-boundary` |
| Last updated | `2026-05-16` |
| Current phase | `ready_for_pr` |
| Current sprint | `Sprint 10` |
| Overall status | `ready_for_review` |
| Current baseline | PR `#256` mergeada em `main`; merge `66591f1` |

## Current Focus

- Completar a boundary de runtime do Radar em `features/radar/*`.
- Preservar compatibilidade publica via facades `hooks/useRadar.ts` e `services/radarService.ts`.
- Atualizar imports internos novos para o barrel `features/radar`.
- Documentar o escopo real da Sprint 10 sem misturar componentes grandes, PWA ou cleanup global.

## Next Up

1. Abrir PR da branch `codex/sprint-10-radar-boundary`.
2. Acompanhar checks remotos.
3. Validar preview Vercel com checklist manual do Radar.

## Blocked

- Nenhum bloqueio técnico imediato.
- Workspace principal original ainda tinha mudanças não commitadas em `refactor/code-quality`; Sprint 10 está sendo executada em worktree limpa para não misturar escopos.

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
  - `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`40` testes)
  - `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/architecture/radarBoundaryImportGuard.test.ts` green (`34` testes)
  - `npm exec vitest run tests/components/chat/ChatPanels.test.tsx tests/components/EmptyStateHome.test.tsx` green (`11` testes)
  - `npm exec vitest run tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`7` testes)
  - `npm run typecheck` green
  - `npm run test` green (`115` arquivos, `850` testes)
  - `npm run build` green (warnings aceitos OI-003/OI-057)
  - `npm run lint` green com `0` erros e `147` warnings conhecidos
  - `npm run analyze:circular` green, sem ciclos

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
| 10 | Radar boundary completion | ready_for_review | runtime de Radar no boundary `features/radar/*` com facades compatíveis | `origin/main@66591f1` | `features/radar/*`, `hooks/useRadar.ts`, `services/radarService.ts` |
| 11 | Componentes grandes + tipagem forte | planned | reducao de complexidade em `CRMDetail`, `LoadingSmart`, `WarRoom` | `start-of-sprint-11` | `components/CRMDetail.tsx`, `components/LoadingSmart.tsx`, `components/WarRoom.tsx` |
| 12 | Hardening final | planned | warnings operacionais e guardrails fechados | `start-of-sprint-12` | `tests/*`, `utils/idbStorage.ts`, docs de closeout |
