# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `c2b51444d6f7a42476b07677303cf61a6cdc098e` |
| Working branch | `main` (branch da Sprint 6 ainda nao aberta) |
| Last updated | `2026-04-20` |
| Current phase | `planning` |
| Current sprint | `6` |
| Overall status | `active` |
| Current baseline | `main` ja inclui Sprint 5 mergeada via PR `#229`, os docs do War Room via PR `#230`, o pacote adicional de regressao via PR `#233`, e a camada versionada de Obsidian via PR `#234`; a validacao manual da Sprint 5 foi aceita em `2026-04-20` com base na confirmacao do operador e no uso continuo sem reclamacoes; Sprint 6 é o proximo foco oficial |

## Current Focus

- Sprint 2 foi concluida e mergeada sem quebrar a fachada publica de `services/geminiService.ts`
- A extracao interna da camada Gemini ficou ativa em `services/gemini/` com compatibilidade preservada
- Sprint 3 foi concluida e mergeada em `main` atraves das PRs `#216`-`#221`, com a regressao offline do dossie canonico entrando via PR `#222`
- Sprint 4 foi concluida e mergeada em `main` via PR `#227` (Onda 1) e PR `#228` (Onda 2)
- Sprint 5 foi concluida em `main` via PR `#229`:
  - `components/ChatInterface.tsx` segue como facade publica estavel
  - `components/chat/ChatShell.tsx` concentra sidebar, header e composicao de areas
  - `components/chat/MessageTimeline.tsx` concentra gate, home, timeline virtualizada e wiring de `MessageRow`
  - `components/chat/Composer.tsx` concentra input, prefill, processing indicator e retry toast
  - `components/chat/ChatPanels.tsx` concentra os overlays lazy do chat
  - `components/chat/contracts.ts` virou o contrato interno compartilhado dessa camada
  - `ChatInterfaceProps` e a fachada publica de `services/geminiService.ts` foram preservados
  - a validacao manual foi aceita em `2026-04-20` com base na confirmacao do operador e no uso continuo sem reclamacoes
- O follow-up de UX da Sprint 5 tambem ja esta em `main`:
  - `components/SessionsSidebar.tsx` anima apenas `transform` em `200ms` no mobile
  - a transicao de largura foi removida no desktop
  - `App.tsx` passou a usar functional update no toggle de `isSidebarOpen`
- Sprint 6 agora e o proximo foco oficial:
  - dividir `prompts/megaPrompts.ts` em `prompts/mega/*`
  - remover `@ts-nocheck`
  - preservar markers `[[PORTA_*]]` e builders publicos

## Next Up

1. Abrir a Sprint 6 a partir do `main`, em branch propria, mantendo o escopo dedicado a `prompts/megaPrompts.ts`
2. Dividir `prompts/megaPrompts.ts` em `prompts/mega/*`, remover `@ts-nocheck` e preservar markers `[[PORTA_*]]` e builders publicos
3. Rodar o gate automatizado/contratos da Sprint 6 e, depois, sincronizar `main`/docs novamente com o estado real da sprint

## Blocked

- Nenhum bloqueio tecnico de runtime atual

## Validation Pending

- Nenhuma pendencia residual para o fechamento da Sprint 5; a validacao manual foi aceita em `2026-04-20` com base na confirmacao do operador e no uso real sem reclamacoes
- O gate automatizado da Sprint 5 fechou com:
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
| 5 | Modularizar ChatInterface | done | `components/chat/` ativo com facade estavel em `ChatInterface.tsx`; PR `#229` mergeada e validacao manual aceita em `2026-04-20` | `origin/main@16c8f2e` | `components/ChatInterface.tsx`, `components/chat/*` |
| 6 | Dividir megaPrompts | planned | `prompts/mega/` criado; `@ts-nocheck` removido; markers `[[PORTA_*]]` preservados | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | planned | `hooks/useChat.ts` removido; `constants.ts` reduzido | `start-of-sprint-7` | `constants.ts`, `hooks/useChat.ts`, `services/apiConfig.ts` |
| 8 | War Room e docs finais | planned | `services/war-room/` ativo e docs consolidadas | `start-of-sprint-8` | `services/warRoomService.ts`, `docs/ai-context/*` |
