# Handoff Curto

## Current Phase

Execucao. Sprint 2 foi concluida e mergeada.

O programa segue na ordem do roadmap, com proximo passo em Sprint 3.

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

## What Is In Progress

- Sprint 3 ainda nao iniciada em codigo
- Preparacao para extracao do fluxo de chat de `App.tsx` com risco controlado

## Next Safe Step

1. Iniciar Sprint 3 extraindo responsabilidades de chat de `App.tsx` para `features/chat/*` em fatias pequenas
2. Manter o contrato visual e funcional atual (score PORTA, fontes, perguntas de continuidade, sessao remota)
3. Validar por fatia com testes e checkpoint manual em preview Vercel antes de seguir

## Files Most Relevant Now

- `docs/ai-context/refactor/01-MASTER-PLAN.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/05-VALIDATION.md`
- `App.tsx`
- `features/chat/*` (novo destino da extracao)
- `components/ChatInterface.tsx`
- `services/geminiService.ts`

## Do Not Touch Yet

- Nao quebrar `services/apiConfig.ts` por dominio
- Nao dividir `types.ts` sem gatilho real
- Nao remover facades futuras no mesmo sprint em que os submodulos nascerem

## Validation Last Run

- `npm run test`: green em `2026-04-11` (ultima rodada valida registrada da sprint)
- `npm run typecheck`: green em `2026-04-11`
- `npm run build`: green em `2026-04-11`
- `npm run lint`: red em `2026-04-11` por backlog historico do repo (`37` erros, `217` warnings)

## Suggested Prompt For Next AI

Leia `docs/ai-context/refactor/00-README.md`, depois `01-MASTER-PLAN.md`,
`02-BOARD.md`, `03-OPEN-ITEMS.md`, `05-VALIDATION.md` e `06-HANDOFF.md`.
Continue exatamente no Sprint 3: extraia o fluxo de chat de `App.tsx` em fatias pequenas,
sem mudar contrato publico, valide cada fatia e atualize board/open-items/handoff/sprint-log sem replanejar.
