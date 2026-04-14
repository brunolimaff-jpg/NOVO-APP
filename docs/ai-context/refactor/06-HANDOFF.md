# Handoff Curto

## Current Phase

Execucao. Sprint 3 esta ativa.

O primeiro corte conservador da Sprint 3 ja foi mergeado em `main` via PR `#216`.
O segundo corte conservador da Sprint 3 tambem ja foi mergeado em `main` via PR `#217`.
O terceiro corte conservador da Sprint 3 tambem ja foi mergeado em `main` via PR `#218`.
O quarto corte conservador da Sprint 3 tambem ja foi mergeado em `main` via PR `#219`.
O corte atual em preparacao e `codex/sprint-3-feedback-actions`.

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

## What Is In Progress

- PR do corte 3 da Sprint 3 em preparacao/review
- `useChatFeedbackActions` foi adicionado a `features/chat/feedback-actions`
- `App.tsx` agora consome os handlers de feedback a partir da feature
- o pacote de sessao ja foi validado manualmente; agora o foco e feedback

## Next Safe Step

1. Revisar e mergear o PR `codex/sprint-3-feedback-actions`
2. Rodar checkpoint manual curto do feedback: like/dislike, comentario, section feedback, toggle de fontes e report de erro
3. Depois seguir para o ultimo corte da Sprint 3: `features/chat/message-orchestrator.ts`

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
- `tests/features/chat/loading-progress.test.tsx`
- `tests/features/chat/session-controller.test.ts`
- `tests/features/chat/feedback-actions.test.ts`

## Do Not Touch Yet

- Nao quebrar `services/apiConfig.ts` por dominio
- Nao dividir `types.ts` sem gatilho real
- Nao remover facades futuras no mesmo sprint em que os submodulos nascerem

## Validation Last Run

- `npm run test`: green em `2026-04-14` (`91` arquivos, `745` testes)
- `npm run typecheck`: green em `2026-04-14`
- `npm run build`: green em `2026-04-14`
- `npm run lint`: red em `2026-04-11` por backlog historico do repo (`37` erros, `217` warnings)
- Warning aceito no build: chunking envolvendo `utils/idbStorage.ts`, ja registrado como OI-003

## Suggested Prompt For Next AI

Leia `docs/ai-context/refactor/00-README.md`, depois `01-MASTER-PLAN.md`,
`02-BOARD.md`, `03-OPEN-ITEMS.md`, `05-VALIDATION.md` e `06-HANDOFF.md`.
Continue exatamente no Sprint 3. Se o PR `codex/sprint-3-session-controller-move` ja estiver mergeado,
o PR `codex/sprint-3-app-import-session-controller` tambem ja estiver mergeado
e o PR `codex/sprint-3-session-remote-save` tambem ja estiver mergeado
e o PR `codex/sprint-3-feedback-actions` tambem ja estiver mergeado, faca o ultimo corte da Sprint 3
em `features/chat/message-orchestrator.ts`, ainda sem mexer no waterfall de dossie.
Valide com `npm run test`, `npm run typecheck` e `npm run build`.
