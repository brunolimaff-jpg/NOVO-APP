# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `16c8f2e001e92e4830415506d7406ca236ed91f8` |
| Working branch | `codex/sprint5-chatinterface-modularization` |
| Last updated | `2026-04-17` |
| Current phase | `execution` |
| Current sprint | `5` |
| Overall status | `active` |
| Current baseline | `main` ja inclui Sprint 4 completa via PR `#228`; Sprint 5 foi implementada no branch `codex/sprint5-chatinterface-modularization` com gates automatizados green em `2026-04-17`; lint backlog pre-existing |

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
- Onda 1 da Sprint 4 foi mergeada em `main` via PR `#227`:
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
- Onda 2 foi mergeada em `main` via PR `#228`:
  - `stores/chatStore.tsx` concentra sessao, mensagens, loading e refs operacionais
  - `stores/dossierStore.tsx` concentra export/save state
  - `App.tsx` e `index.tsx` agora usam providers/hooks de store
  - `features/chat/ChatErrorBoundary.tsx` protege o shell do chat
  - `features/dossier/DossierErrorBoundary.tsx` protege renderizacao de dossie e overlay hero
  - `components/ErrorBoundary.tsx` passou a compartilhar auditoria com `utils/errorBoundaryAudit.ts`
  - `components/MessageRow.tsx` agora envolve o subtree de dossie com boundary local
  - a suite ganhou cobertura para stores e boundaries
- Sprint 5 foi aberta no branch atual:
  - `components/ChatInterface.tsx` segue como facade publica estavel
  - `components/chat/ChatShell.tsx` concentra sidebar, header e composicao de areas
  - `components/chat/MessageTimeline.tsx` concentra gate, home, timeline virtualizada e wiring de `MessageRow`
  - `components/chat/Composer.tsx` concentra input, prefill, processing indicator e retry toast
  - `components/chat/ChatPanels.tsx` concentra os overlays lazy do chat
  - `components/chat/contracts.ts` virou o contrato interno compartilhado dessa camada
  - `ChatInterfaceProps` e a fachada publica de `services/geminiService.ts` foram preservados
  - entraram testes focados para `Composer`, `MessageTimeline` e `ChatPanels`
  - um patch de UX tambem reduziu o atraso perceptivel da sidebar:
    - `components/SessionsSidebar.tsx` agora anima apenas `transform` em `200ms` no mobile
    - a transicao de largura foi removida no desktop
    - `App.tsx` passou a usar functional update no toggle de `isSidebarOpen`

## Next Up

1. Abrir/revisar a PR da Sprint 5 (`codex/sprint5-chatinterface-modularization`)
2. Rodar a validacao manual em preview/Vercel para gate inicial, home, timeline ativa, header actions, responsividade de abrir/fechar da sidebar e composer send/stop/retry
3. Depois do merge, sincronizar `main`/docs novamente e preparar Sprint 6

## Blocked

- Nenhum bloqueio tecnico de runtime atual

## Validation Pending

- Nenhuma pendencia para o fechamento da Sprint 3; a validacao manual integrada foi concluida em `2026-04-15`
- O gate automatizado da Onda 1 fechou com `npm run test:dossier`, `npm run test`, `npm run typecheck` e `npm run build`
- O gate automatizado da Onda 2 fechou com `npm run test:dossier`, `npm run test`, `npm run typecheck` e `npm run build` em `2026-04-16`
- A Sprint 5 fechou o gate automatizado com:
  - `tests/components/ChatInterface.test.tsx`
  - `tests/components/chat/Composer.test.tsx`
  - `tests/components/chat/MessageTimeline.test.tsx`
  - `tests/components/chat/ChatPanels.test.tsx`
  - `npm run test`
  - `npm run typecheck`
  - `npm run build`
- O patch de responsividade da sidebar fechou com:
  - `tests/components/SessionsSidebar.test.tsx`
  - `tests/components/ChatInterface.test.tsx`
- Em runtime real, a rodada manual da Sprint 5 deve cobrir gate inicial, home, timeline, header actions e composer sem regressao visual/funcional
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
| 4 | Extrair dossie do App | done | Onda 1 implementa `features/dossier/`; Onda 2 consolida `stores/*` e error boundaries | `start-of-sprint-4` | `App.tsx`, `features/dossier/*`, `stores/*` |
| 5 | Modularizar ChatInterface | active | `components/chat/` ativo com facade estavel em `ChatInterface.tsx`; smoke manual pendente antes do merge | `origin/main@16c8f2e` | `components/ChatInterface.tsx`, `components/chat/*` |
| 6 | Dividir megaPrompts | planned | `prompts/mega/` criado; `@ts-nocheck` removido | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | planned | `hooks/useChat.ts` removido; `constants.ts` reduzido | `start-of-sprint-7` | `constants.ts`, `hooks/useChat.ts`, `services/apiConfig.ts` |
| 8 | War Room e docs finais | planned | `services/war-room/` ativo e docs consolidadas | `start-of-sprint-8` | `services/warRoomService.ts`, `docs/ai-context/*` |
