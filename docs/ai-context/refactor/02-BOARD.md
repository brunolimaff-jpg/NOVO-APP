# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `462913fdd0de182ebc206d704ac3f2e11bf68339` |
| Working branch | `codex/sprint4-wave1-dossier-runtime` |
| Last updated | `2026-04-15` |
| Current phase | `execution` |
| Current sprint | `4` |
| Overall status | `active` |
| Current baseline | `Sprint 4 / Onda 1 implementada em branch; test:dossier/test/typecheck/build green em 2026-04-15; lint backlog pre-existing` |

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
- A validacao manual integrada da Sprint 3 foi concluida em runtime real em `2026-04-15`
- Sprint 3 foi encerrada como `done` com board/handoff/memory sincronizados
- Sprint 4 foi aberta em duas ondas tecnicas:
  - Onda 1: extrair `features/dossier/*` sem reabrir o desenho de estado
  - Onda 2: introduzir `stores/*` com `Context + Reducer` tipado e error boundaries por feature
- Onda 1 da Sprint 4 foi implementada em branch:
  - `features/dossier/waterfall-orchestrator.ts` virou o novo dono de `runMegaPromptWaterfall`
  - `features/dossier/benchmark-stage.ts` encapsula benchmark isolado, timeout e falha opcional
  - `features/dossier/porta-reconciliation.ts` concentra retries de modulos, reconciliacao PORTA, fallback tecnico e integrity hold
- `App.tsx` deixou de conter o runtime do waterfall e caiu para `815` linhas neste corte
- `tests/App.portaRecovery.test.ts` foi migrado para `tests/features/dossier/porta-reconciliation.test.ts`
- `tests/features/dossier/benchmark-stage.test.ts` entrou para cobrir sucesso, falha nao-bloqueante e abort terminal do benchmark
- Escopo de validacao manual desta onda ficou explicitado para runtime real:
  - gerar um `Dossie completo` do inicio ao fim e conferir score PORTA + secoes finais
  - validar follow-up apos dossie completo
  - validar retry do ramo de envio/recuperacao sem quebrar a mensagem final
  - validar exportacao/continuity suggestions e persistencia remota sem regressao funcional

## Next Up

1. Abrir/revisar a PR da Onda 1, acompanhar checks e consolidar o merge
2. Executar a validacao manual em runtime real usando o escopo descrito acima, se o preview exigir checkpoint adicional
3. Onda 2: introduzir `stores/chatStore.ts`, `stores/dossierStore.ts`, `ChatErrorBoundary.tsx` e `DossierErrorBoundary.tsx`

## Blocked

- Nenhum bloqueio tecnico de runtime atual

## Validation Pending

- Nenhuma pendencia para o fechamento da Sprint 3; a validacao manual integrada foi concluida em `2026-04-15`
- O gate automatizado da Onda 1 fechou com `npm run test:dossier`, `npm run test`, `npm run typecheck` e `npm run build`
- Em runtime real, a rodada manual desta onda deve cobrir geracao de dossie, follow-up, retry, exportacao e persistencia sem regressao
- `npm run lint` continua vermelho por backlog anterior do repo (`37` erros, `217` warnings em `2026-04-11`) e segue fora do gate

## Known Accepted Warnings

- `tests/components/SessionsSidebar.test.tsx` ainda emite o warning `Functions are not valid as a React child`
- Build ainda emite o warning de chunking envolvendo `utils/idbStorage.ts`

## Sprint Tracker

| Sprint | Goal | Status | Exit Criteria | Rollback Point | Primary Files/Modules |
|---|---|---|---|---|---|
| 1 | Baseline e fronteiras | done | Clerk/auth removido, fronteiras documentadas, guardrail contra novos consumidores de legado, validacao da sprint registrada | `origin/main@3c1412e` | `App.tsx`, `components/ChatInterface.tsx`, `contexts/OperatorContext.tsx`, `hooks/useChat.ts`, `services/geminiService.ts` |
| 2 | Quebrar Gemini | done | `services/gemini/` criado com facade estavel | `origin/main@ef30b5d` | `services/geminiService.ts`, `services/gemini/*` |
| 3 | Extrair chat do App | done | `features/chat/` ativo; `App.tsx` reduzido; validacao manual integrada concluida em `2026-04-15` | `origin/main@510f91fa3653cbfa1552e7f3d4e3a43883a45e17` | `App.tsx`, `features/chat/*` |
| 4 | Extrair dossie do App | active | Onda 1 implementa `features/dossier/`; Onda 2 consolida `stores/*` e error boundaries | `start-of-sprint-4` | `App.tsx`, `features/dossier/*`, `stores/*` |
| 5 | Modularizar ChatInterface | planned | `components/chat/` ativo com facade em `ChatInterface.tsx` | `start-of-sprint-5` | `components/ChatInterface.tsx`, `components/chat/*` |
| 6 | Dividir megaPrompts | planned | `prompts/mega/` criado; `@ts-nocheck` removido | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | planned | `hooks/useChat.ts` removido; `constants.ts` reduzido | `start-of-sprint-7` | `constants.ts`, `hooks/useChat.ts`, `services/apiConfig.ts` |
| 8 | War Room e docs finais | planned | `services/war-room/` ativo e docs consolidadas | `start-of-sprint-8` | `services/warRoomService.ts`, `docs/ai-context/*` |
