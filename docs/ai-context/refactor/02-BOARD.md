# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `922a40316c08e78dab9a978e6fa1172c75198cdd` |
| Working branch | `refactor/wave-0-1-cleanup` |
| Last updated | `2026-05-16` |
| Current phase | `ready_for_pr` |
| Current sprint | `Onda 0+1` |
| Overall status | `ready_for_review` |
| Current baseline | Sprint 9 mergeada via PR `#254`; head `19485dc`, merge `922a403` |

## Current Focus

- Fechar a divergência documental pós-PR `#254`.
- Registrar a Onda 0+1 como ponte curta entre Sprint 9 e Sprint 10.
- Corrigir o bug provável de PORTA que podia deixar o dossiê sem `scorePorta` quando apenas parte das dimensões falhava.
- Migrar logs cliente sensíveis para `scoutDiag` com payload truncado.

## Next Up

1. Validar Onda 0+1 com testes focados e gates completos.
2. Abrir PR da branch `refactor/wave-0-1-cleanup`.
3. Após merge, iniciar Sprint 10: Radar boundary completion.

## Blocked

- Nenhum bloqueio técnico imediato.
- Workspace principal original tinha mudanças não commitadas em `refactor/code-quality`; esta Onda 0+1 foi executada em worktree limpa para não misturar escopos.

## Validation

- Onda 0+1:
  - `npm exec vitest run tests/features/dossier/porta-reconciliation.test.ts tests/features/dossier/waterfall-orchestrator.test.ts` green (`15` testes)
  - `npm exec vitest run tests/services/clientLookupService.test.ts tests/extraction.test.ts` green (`20` testes)
  - `npm run typecheck` green
  - `npm run test` green (`114` arquivos, `846` testes)
  - `npm run build` green (warnings aceitos OI-003/OI-057)
  - `npm run lint` green com `0` erros e `150` warnings conhecidos
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
| Onda 0+1 | Cleanup base + primeira correção técnica | ready_for_review | docs/memória sincronizados + PORTA/logs validados | `origin/main@922a403` | docs/memory, `features/dossier/*`, logs cliente |
| 10 | Radar boundary completion | planned | runtime de Radar no boundary `features/radar/*` | `start-of-sprint-10` | `features/radar/*`, `hooks/useRadar.ts`, `services/radarService.ts` |
| 11 | Componentes grandes + tipagem forte | planned | reducao de complexidade em `CRMDetail`, `LoadingSmart`, `WarRoom` | `start-of-sprint-11` | `components/CRMDetail.tsx`, `components/LoadingSmart.tsx`, `components/WarRoom.tsx` |
| 12 | Hardening final | planned | warnings operacionais e guardrails fechados | `start-of-sprint-12` | `tests/*`, `utils/idbStorage.ts`, docs de closeout |
