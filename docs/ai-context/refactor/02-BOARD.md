# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `3c1412e3b19905abc843ceae36ba5399355f8d63` |
| Working branch | `codex/centralize-ai-model-config` |
| Last updated | `2026-04-11` |
| Current phase | `execution` |
| Current sprint | `1` |
| Overall status | `active` |
| Current baseline | `test/typecheck/build green; lint backlog pre-existing` |

## Current Focus

- Sprint 1 esta ativa
- Clerk/auth foi removido sem mudar o roadmap: agora existe apenas perfil local obrigatorio do operador
- Ainda falta fechar o guardrail de `hooks/useChat.ts` e registrar as fronteiras congeladas dos hotspots

## Next Up

1. Adicionar guardrail estrutural que bloqueie novos consumidores de producao de `hooks/useChat.ts`
2. Documentar explicitamente as fronteiras reais de `App.tsx`, `components/ChatInterface.tsx` e `services/geminiService.ts`
3. Reexecutar a validacao da sprint apos o guardrail e fechar o checklist manual viavel

## Blocked

- Nenhum bloqueio tecnico de runtime atual

## Validation Pending

- `npm run lint` continua vermelho por backlog anterior do repo (`37` erros, `217` warnings em `2026-04-11`)
- Checklist manual de Sprint 1 ainda nao foi fechado apos a troca completa de auth por perfil local

## Known Accepted Warnings

- `tests/components/SessionsSidebar.test.tsx` ainda emite o warning `Functions are not valid as a React child`
- Build ainda emite o warning de chunking envolvendo `utils/idbStorage.ts`

## Sprint Tracker

| Sprint | Goal | Status | Exit Criteria | Rollback Point | Primary Files/Modules |
|---|---|---|---|---|---|
| 1 | Baseline e fronteiras | active | Clerk/auth removido, fronteiras documentadas, guardrail contra novos consumidores de legado, validacao da sprint registrada | `origin/main@3c1412e` | `App.tsx`, `components/ChatInterface.tsx`, `contexts/OperatorContext.tsx`, `hooks/useChat.ts`, `services/geminiService.ts` |
| 2 | Quebrar Gemini | planned | `services/gemini/` criado com facade estavel | `start-of-sprint-2` | `services/geminiService.ts`, `services/gemini/*` |
| 3 | Extrair chat do App | planned | `features/chat/` ativo; `App.tsx` reduzido | `start-of-sprint-3` | `App.tsx`, `features/chat/*` |
| 4 | Extrair dossie do App | planned | `features/dossier/` ativo; waterfall fora do App | `start-of-sprint-4` | `App.tsx`, `features/dossier/*` |
| 5 | Modularizar ChatInterface | planned | `components/chat/` ativo com facade em `ChatInterface.tsx` | `start-of-sprint-5` | `components/ChatInterface.tsx`, `components/chat/*` |
| 6 | Dividir megaPrompts | planned | `prompts/mega/` criado; `@ts-nocheck` removido | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | planned | `hooks/useChat.ts` removido; `constants.ts` reduzido | `start-of-sprint-7` | `constants.ts`, `hooks/useChat.ts`, `services/apiConfig.ts` |
| 8 | War Room e docs finais | planned | `services/war-room/` ativo e docs consolidadas | `start-of-sprint-8` | `services/warRoomService.ts`, `docs/ai-context/*` |
