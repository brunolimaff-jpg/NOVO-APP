# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `df1ca1e83100169a7d4dfd7665993a9f3018afb6` |
| Working branch | `refactor/sprint-9` |
| Last updated | `2026-05-16` |
| Current phase | `review` |
| Current sprint | `9` |
| Overall status | `active` |
| Current baseline | PR `#253` mergeada em `main`; tag `pre-sprint-9` criada no HEAD atualizado |

## Current Focus

- Executar Sprint 9 com App shell decoupling e governanca.
- Preservar as boundaries estabilizadas na Fase 1:
  - `services/gemini/*` com fachada `services/geminiService.ts`
  - `services/war-room/*` com fachada `services/warRoomService.ts`
  - `features/chat/*`
  - `features/dossier/*`
  - `features/radar/*` (stub)
- Pinecone via `VITE_*` e risco aceito para app interno/fechado, sem remocao nesta sprint.

## Next Up

1. Abrir PR da branch `refactor/sprint-9`.
2. Mergear Sprint 9 apos review.
3. Abrir Sprint 10 apos merge da Sprint 9.

## Blocked

- Nenhum bloqueio tecnico imediato.

## Validation Pending

- Nao ha validacao de runtime pendente para o fechamento da Sprint 8; o merge em `main` ja ocorreu.
- Sprint 9 validada localmente em 2026-05-16:
  - `npm run test` green (`114` arquivos, `854` testes)
  - `npm run typecheck` green
  - `npm run build` green (warning aceito OI-003)
  - `npm run lint` green com `0` erros e `160` warnings conhecidos
  - Playwright local em `http://127.0.0.1:3000/` sem `console.error`/`pageerror`

## Known Accepted Warnings

- `tests/components/SessionsSidebar.test.tsx` ainda emite `Functions are not valid as a React child` (OI-004).
- Build ainda emite warning de chunking em `utils/idbStorage.ts` (OI-003).
- `npm run lint` passa, mas com backlog de warnings (OI-005).

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
| 9 | App shell decoupling + governanca | ready_for_review | `App.tsx` com wiring reduzido e limites explicitos | `pre-sprint-9` | `App.tsx`, `features/chat/*`, `features/dossier/*` |
| 10 | Radar boundary completion | planned | runtime de Radar no boundary `features/radar/*` | `start-of-sprint-10` | `features/radar/*`, `hooks/useRadar.ts`, `services/radarService.ts` |
| 11 | Componentes grandes + tipagem forte | planned | reducao de complexidade em `CRMDetail`, `LoadingSmart`, `WarRoom` | `start-of-sprint-11` | `components/CRMDetail.tsx`, `components/LoadingSmart.tsx`, `components/WarRoom.tsx` |
| 12 | Hardening final | planned | warnings operacionais e guardrails fechados | `start-of-sprint-12` | `tests/*`, `utils/idbStorage.ts`, docs de closeout |
