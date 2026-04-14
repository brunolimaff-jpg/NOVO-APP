# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `5d963f74dad84f49838790d56125e6db24269cae` |
| Working branch | `codex/sprint-3-feedback-actions` |
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
- Sprint 3 corte 2B foi mergeado: `App.tsx` passou a importar `features/chat/session-controller` via PR `#218`
- Sprint 3 corte 2C foi mergeado: save remoto extraido para `features/chat/session-controller` via PR `#219`
- Pacote de sessao (`2A` + `2B` + `2C`) foi validado manualmente em 2026-04-14
- Sprint 3 corte 3 esta em execucao: extrair feedback actions para `features/chat/feedback-actions.ts`

## Next Up

1. Abrir e revisar o PR do corte 3 da Sprint 3 (`codex/sprint-3-feedback-actions`)
2. Depois do merge, rodar checkpoint manual curto do fluxo de feedback
3. Em seguida, seguir para o ultimo corte da Sprint 3: envio padrao/message orchestration

## Blocked

- Nenhum bloqueio tecnico de runtime atual

## Validation Pending

- `npm run lint` continua vermelho por backlog anterior do repo (`37` erros, `217` warnings em `2026-04-11`)
- Reexecutar checklist manual curto do fluxo de feedback apos o merge do corte 3
- Para fechar a Sprint 3, ainda falta extrair o fluxo de envio padrao para `features/chat/message-orchestrator.ts`

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
