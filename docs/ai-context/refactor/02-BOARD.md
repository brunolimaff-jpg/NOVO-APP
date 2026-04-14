# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `602380d7cb0d9dc26ad472032fc94233d5983744` |
| Working branch | `codex/sprint-3-app-import-session-controller` |
| Last updated | `2026-04-14` |
| Current phase | `execution` |
| Current sprint | `3` |
| Overall status | `active` |
| Current baseline | `test/typecheck/build green em 2026-04-14; lint backlog pre-existing` |

## Current Focus

- Sprint 2 foi concluida e mergeada sem quebrar a fachada publica de `services/geminiService.ts`
- A extracao interna da camada Gemini ficou ativa em `services/gemini/` com compatibilidade preservada
- Sprint 3 corte 1 foi mergeado: progresso/loading do chat extraido para `features/chat/loading-progress.ts` via PR `#216`
- Sprint 3 corte 2A foi mergeado: `useSessionManager` foi movido para `features/chat/session-controller.ts` via PR `#217`
- Sprint 3 corte 2B esta em execucao: trocar o import do `App.tsx` para `features/chat/session-controller`

## Next Up

1. Abrir e revisar o PR do corte 2B da Sprint 3 (`codex/sprint-3-app-import-session-controller`)
2. Depois do merge, seguir para o PR 2C: extrair save remoto para o mesmo modulo da feature
3. Depois do pacote de sessao integrado, rodar checkpoint manual em preview Vercel

## Blocked

- Nenhum bloqueio tecnico de runtime atual

## Validation Pending

- `npm run lint` continua vermelho por backlog anterior do repo (`37` erros, `217` warnings em `2026-04-11`)
- Reexecutar checklist manual completo no preview Vercel apos o pacote de sessao ficar integrado (`2B` + `2C` sobre `2A` ja mergeado) para confirmar paridade visual/funcional

## Known Accepted Warnings

- `tests/components/SessionsSidebar.test.tsx` ainda emite o warning `Functions are not valid as a React child`
- Build ainda emite o warning de chunking envolvendo `utils/idbStorage.ts`

## Sprint Tracker

| Sprint | Goal | Status | Exit Criteria | Rollback Point | Primary Files/Modules |
|---|---|---|---|---|---|
| 1 | Baseline e fronteiras | done | Clerk/auth removido, fronteiras documentadas, guardrail contra novos consumidores de legado, validacao da sprint registrada | `origin/main@3c1412e` | `App.tsx`, `components/ChatInterface.tsx`, `contexts/OperatorContext.tsx`, `hooks/useChat.ts`, `services/geminiService.ts` |
| 2 | Quebrar Gemini | done | `services/gemini/` criado com facade estavel | `origin/main@ef30b5d` | `services/geminiService.ts`, `services/gemini/*` |
| 3 | Extrair chat do App | active | `features/chat/` ativo; `App.tsx` reduzido | `origin/main@510f91fa3653cbfa1552e7f3d4e3a43883a45e17` | `App.tsx`, `features/chat/*` |
| 4 | Extrair dossie do App | planned | `features/dossier/` ativo; waterfall fora do App | `start-of-sprint-4` | `App.tsx`, `features/dossier/*` |
| 5 | Modularizar ChatInterface | planned | `components/chat/` ativo com facade em `ChatInterface.tsx` | `start-of-sprint-5` | `components/ChatInterface.tsx`, `components/chat/*` |
| 6 | Dividir megaPrompts | planned | `prompts/mega/` criado; `@ts-nocheck` removido | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | planned | `hooks/useChat.ts` removido; `constants.ts` reduzido | `start-of-sprint-7` | `constants.ts`, `hooks/useChat.ts`, `services/apiConfig.ts` |
| 8 | War Room e docs finais | planned | `services/war-room/` ativo e docs consolidadas | `start-of-sprint-8` | `services/warRoomService.ts`, `docs/ai-context/*` |
