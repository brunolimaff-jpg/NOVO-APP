# Handoff Curto

## Current Phase

Execucao. Sprint 1 esta ativa.

O cleanup de Clerk/auth foi concluido sem reordenar o programa:
o app agora usa apenas um perfil local obrigatorio do operador.

## What Was Finished

- `contexts/OperatorContext.tsx` criado com `name`, `operatorId`, `loading`, `setName` e `clearName`
- `index.tsx` passou a usar `OperatorProvider`
- `App.tsx`, `components/ChatInterface.tsx`, `components/EmptyStateHome.tsx`, `components/SystemHealthCheck.tsx`, `components/SectionalBotMessage.tsx` e `hooks/useChat.ts` deixaram de depender de auth/admin
- `utils/featureAccess.ts` passou a depender so de flags de ambiente; dashboard/miniCRM/integrity/war room nao dependem mais de admin
- Arquivos mortos removidos: `components/LoginPage.tsx`, `components/AuthModal.tsx`, `components/UserMenuClerkBridge.tsx`, `contexts/AuthContext.tsx`
- Dependencia `@clerk/react` removida de `package.json` e `package-lock.json`
- Testes atualizados para o novo perfil local, incluindo gate de nome do operador e acesso de dashboard sem papel admin

## What Is In Progress

- Sprint 1 ainda nao esta concluida
- Falta fechar o guardrail que bloqueia novos consumidores de producao de `hooks/useChat.ts`
- Falta registrar formalmente as fronteiras congeladas dos hotspots no pacote da sprint

## Next Safe Step

1. Adicionar um teste estrutural que falhe se algum arquivo de producao importar `hooks/useChat.ts`
2. Congelar/documentar as fronteiras reais de `App.tsx`, `components/ChatInterface.tsx` e `services/geminiService.ts`
3. Reexecutar a validacao da sprint e so entao avaliar marcar Sprint 1 como `done`

## Files Most Relevant Now

- `docs/ai-context/refactor/01-MASTER-PLAN.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/05-VALIDATION.md`
- `App.tsx`
- `components/ChatInterface.tsx`
- `contexts/OperatorContext.tsx`
- `hooks/useChat.ts`

## Do Not Touch Yet

- Nao quebrar `services/apiConfig.ts` por dominio
- Nao dividir `types.ts` sem gatilho real
- Nao remover facades futuras no mesmo sprint em que os submodulos nascerem

## Validation Last Run

- `npm run test`: green (`85` arquivos, `703` testes) em `2026-04-11`
- `npm run typecheck`: green em `2026-04-11`
- `npm run build`: green em `2026-04-11`
- `npm run lint`: red em `2026-04-11` por backlog historico do repo (`37` erros, `217` warnings)

## Suggested Prompt For Next AI

Leia `docs/ai-context/refactor/00-README.md`, depois `01-MASTER-PLAN.md`,
`02-BOARD.md`, `03-OPEN-ITEMS.md`, `05-VALIDATION.md` e `06-HANDOFF.md`.
Continue exatamente no Sprint 1: implemente o guardrail de `hooks/useChat.ts`,
valide novamente e atualize board/open-items/handoff/sprint-log sem replanejar.
