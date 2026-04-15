# Handoff Curto

## Current Phase

Execucao. Sprint 3 esta ativa.

O primeiro corte conservador da Sprint 3 ja foi mergeado em `main` via PR `#216`.
O segundo corte conservador da Sprint 3 tambem ja foi mergeado em `main` via PR `#217`.
O terceiro corte conservador da Sprint 3 tambem ja foi mergeado em `main` via PR `#218`.
O quarto corte conservador da Sprint 3 tambem ja foi mergeado em `main` via PR `#219`.
O quinto corte conservador da Sprint 3 tambem ja foi mergeado em `main` via PR `#220`.
O corte final da Sprint 3 tambem ja foi mergeado em `main` via PR `#221`.
A PR `#222` tambem ja foi mergeada e adicionou o golden regression offline do dossie canonico.
O sprint continua `active` apenas porque ainda falta a validacao manual integrada antes de marcar `done`.

## What Was Finished

- `contexts/OperatorContext.tsx` criado com `name`, `operatorId`, `loading`, `setName` e `clearName`
- `index.tsx` passou a usar `OperatorProvider`
- `App.tsx`, `components/ChatInterface.tsx`, `components/EmptyStateHome.tsx`, `components/SystemHealthCheck.tsx`, `components/SectionalBotMessage.tsx` e `hooks/useChat.ts` deixaram de depender de auth/admin
- `utils/featureAccess.ts` passou a depender so de flags de ambiente; dashboard/miniCRM/integrity/war room nao dependem mais de admin
- Arquivos mortos removidos: `components/LoginPage.tsx`, `components/AuthModal.tsx`, `components/UserMenuClerkBridge.tsx`, `contexts/AuthContext.tsx`
- Dependencia `@clerk/react` removida de `package.json` e `package-lock.json`
- Testes atualizados para o novo perfil local, incluindo gate de nome do operador e acesso de dashboard sem papel admin
- `services/geminiService.ts` preservado como fachada publica estavel
- Orquestracao interna extraida para `services/gemini/` (porta, sources, recovery, status, sanitization e pipeline)
- Guardrail estrutural de `hooks/useChat.ts` adicionado para bloquear novos imports de producao
- Hotfixes aplicados no fluxo PORTA para reduzir fallback indevido e manter integridade contextual
- Sprint 3 / corte 1: progresso e estado de loading do chat extraidos para `features/chat/loading-progress.ts`
- `App.tsx` passou a consumir `useChatLoadingProgress` sem alterar `ChatInterfaceProps`, waterfall de dossie ou contrato de IA
- `features/**/*` foi incluido no `tsconfig.json`
- Guardrail de `hooks/useChat.ts` agora cobre tambem `features/`
- Sprint 3 / corte 3: feedback actions extraidas para `features/chat/feedback-actions.ts`
- Sprint 3 / corte final: criado `features/chat/message-helpers.ts` com utilitarios compartilhados de deteccao/continuidade
- Sprint 3 / corte final: criado `features/chat/message-orchestrator.ts` com `useChatMessageOrchestrator`
- `App.tsx` agora usa `useChatMessageOrchestrator` para envio padrao e retry, mantendo waterfall/dossie no componente
- Cobertura adicionada em `tests/features/chat/message-orchestrator.test.ts`
- `App.tsx` caiu para `1521` linhas no branch final da Sprint 3 (`-302` vs baseline `1823`)
- Patch de review aplicado na PR `#221`: `App.tsx` voltou para UTF-8 canonico sem BOM, helpers duplicados sairam do `App.tsx`, e o orchestrator passou a detectar o mega prompt via texto normalizado + `sessionsRef.current`
- PR `#222` mergeada: `npm run test:dossier` agora executa uma regressao offline deterministica do caso Scheffer (`CNPJ 04.733.767/0001-80`)
- Checkpoint manual de feedback foi reportado como validado em `2026-04-15`

## What Is In Progress

- fechamento operacional da Sprint 3
- falta a validacao manual integrada em runtime real para poder marcar o sprint como `done`
- o proximo planejamento tecnico continua sendo Sprint 4 (`features/dossier/*`), mas so depois do fechamento manual da Sprint 3

## Next Safe Step

1. Rodar a validacao manual final da Sprint 3:
   - investigacao inicial
   - follow-up
   - retry de envio
   - dossie completo
   - save remoto
   - feedback
2. Se a validacao manual passar, marcar Sprint 3 como `done` e sincronizar `02-BOARD.md`, `.agents/memory/*` e este handoff
3. Depois planejar Sprint 4 (`features/dossier/*`)
4. Ao tocar comportamento real de dossie, usar `npm run test:dossier` antes de abrir nova rodada manual de export

## Files Most Relevant Now

- `docs/ai-context/refactor/01-MASTER-PLAN.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/05-VALIDATION.md`
- `App.tsx`
- `features/chat/*` (novo destino da extracao)
- `components/ChatInterface.tsx`
- `services/geminiService.ts`
- `features/chat/loading-progress.ts`
- `features/chat/session-controller.ts`
- `features/chat/feedback-actions.ts`
- `features/chat/message-helpers.ts`
- `features/chat/message-orchestrator.ts`
- `tests/App.dossierGolden.test.tsx`
- `tests/helpers/dossierGolden.ts`
- `tests/features/chat/loading-progress.test.tsx`
- `tests/features/chat/session-controller.test.ts`
- `tests/features/chat/feedback-actions.test.ts`
- `tests/features/chat/message-orchestrator.test.ts`

## Do Not Touch Yet

- Nao quebrar `services/apiConfig.ts` por dominio
- Nao dividir `types.ts` sem gatilho real
- Nao remover facades futuras no mesmo sprint em que os submodulos nascerem

## Validation Last Run

- `npm run test:dossier`: green em `2026-04-15`
- `npm run test`: green em `2026-04-15` (`93` arquivos, `755` testes)
- `npm run typecheck`: green em `2026-04-15`
- `npm run build`: green em `2026-04-15`
- `npm run lint`: red em `2026-04-11` por backlog historico do repo (`37` erros, `217` warnings)
- Warning aceito no build: chunking envolvendo `utils/idbStorage.ts`, ja registrado como OI-003

## Suggested Prompt For Next AI

Leia `docs/ai-context/refactor/00-README.md`, depois `01-MASTER-PLAN.md`,
`02-BOARD.md`, `03-OPEN-ITEMS.md`, `05-VALIDATION.md` e `06-HANDOFF.md`.
Continue a partir do fechamento da Sprint 3 em `main`.
Use `npm run test:dossier` como fast-check do caso canonico de dossie e conduza a validacao manual integrada da sprint.
Se a validacao manual passar, atualize o board para marcar Sprint 3 como `done`
e inicie o planejamento da Sprint 4 (`features/dossier/*`).
