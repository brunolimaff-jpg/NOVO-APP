# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `3ebccf616472ec8618c49a09d8f442ed15bd4bc3` |
| Working branch | `main` |
| Last updated | `2026-04-15` |
| Current phase | `execution` |
| Current sprint | `3` |
| Overall status | `active` |
| Current baseline | `test/typecheck/build/test:dossier green em 2026-04-15; lint backlog pre-existing` |

## Current Focus

- Sprint 2 foi concluida e mergeada sem quebrar a fachada publica de `services/geminiService.ts`
- A extracao interna da camada Gemini ficou ativa em `services/gemini/` com compatibilidade preservada
- Sprint 3 corte 1 foi mergeado: progresso/loading do chat extraido para `features/chat/loading-progress.ts` via PR `#216`
- Sprint 3 corte 2A foi mergeado: `useSessionManager` foi movido para `features/chat/session-controller.ts` via PR `#217`
- Sprint 3 corte 2B foi mergeado: `App.tsx` passou a importar `features/chat/session-controller` via PR `#218`
- Sprint 3 corte 2C foi mergeado: save remoto extraido para `features/chat/session-controller` via PR `#219`
- Pacote de sessao (`2A` + `2B` + `2C`) foi validado manualmente em 2026-04-14
- Sprint 3 corte 3 foi mergeado: feedback actions extraidas para `features/chat/feedback-actions.ts` via PR `#220`
- Sprint 3 corte final foi mergeado: envio padrao extraido para `features/chat/message-orchestrator.ts` via PR `#221`
- `features/chat/message-helpers.ts` concentra utilitarios de deteccao/continuidade compartilhados pelo orchestrator
- PR `#222` foi mergeada: regression harness offline do dossie canonico Scheffer entrou em `main`
- `npm run test:dossier` virou o fast-check recomendado para o fluxo canonico de dossie
- `App.tsx` caiu para `1521` linhas no corte final da Sprint 3 (`-302` vs baseline `1823`)
- Checkpoint manual de feedback foi reportado como validado em `2026-04-15`; ainda falta a rodada manual integrada para encerrar a sprint

## Next Up

1. Rodar a validacao manual integrada do fechamento da Sprint 3 em runtime real
2. Se a validacao passar, marcar Sprint 3 como `done` e sincronizar board/handoff/memory
3. Em seguida, planejar Sprint 4 (`features/dossier/*`) sem reabrir o corte de chat

## Blocked

- Nenhum bloqueio tecnico de runtime atual

## Validation Pending

- Rodar a validacao manual integrada do fechamento da Sprint 3 antes de marcar a sprint como concluida
- O checkpoint manual de feedback foi reportado como concluido em `2026-04-15`, mas nao substitui a rodada integrada completa
- `npm run lint` continua vermelho por backlog anterior do repo (`37` erros, `217` warnings em `2026-04-11`) e segue fora do gate

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
