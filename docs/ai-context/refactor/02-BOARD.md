# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `main` -> `d514733f7ababa0a9dab4c4a26f133d39bc6e342` |
| Working branch | `main` |
| Last updated | `2026-04-22` |
| Current phase | `planning` |
| Current sprint | `7` |
| Overall status | `active` |
| Current baseline | `main` ja inclui Sprint 5 mergeada via PR `#229`, os docs do War Room via PR `#230`, o pacote adicional de regressao via PR `#233`, a camada versionada de Obsidian via PR `#234`, o fechamento documental da Sprint 5 via PR `#235` e a Sprint 6 mergeada via PR `#236` |

## Current Focus

- Sprint 2 foi concluida e mergeada sem quebrar a fachada publica de `services/geminiService.ts`
- A extracao interna da camada Gemini ficou ativa em `services/gemini/` com compatibilidade preservada
- Sprint 3 foi concluida e mergeada em `main` atraves das PRs `#216`-`#221`, com a regressao offline do dossie canonico entrando via PR `#222`
- Sprint 4 foi concluida e mergeada em `main` via PR `#227` (Onda 1) e PR `#228` (Onda 2)
- Sprint 5 foi concluida em `main` via PR `#229`, com validacao manual aceita em `2026-04-20`
- Sprint 6 foi concluida em `main` via PR `#236`:
  - `prompts/megaPrompts.ts` virou facade publica fina
  - `prompts/mega/*` agora concentra `contracts.ts`, `foundation.ts`, `specialist-prompts.ts` e `builders.ts`
  - markers `[[PORTA_*]]`, builders publicos e contratos textuais foram preservados
  - o item historico de remover `@ts-nocheck` ficou confirmado como stale no baseline real
- Sprint 7 agora e o proximo foco oficial:
  - extrair partes de alto ROI de `constants.ts`, priorizando `market-intelligence.ts`
  - remover `hooks/useChat.ts`
  - fazer hardening leve em `services/apiConfig.ts`
  - manter `types.ts` centralizado salvo ganho claro
- `mcp-server/` fica explicitamente fora da trilha de refactor ate o fim das Sprints 6-8

## Next Up

1. Abrir a Sprint 7 a partir do `main` pos-`#236`
2. Extrair o bloco de inteligencia de mercado de `constants.ts` para `market-intelligence.ts` antes de tocar `app.ts`
3. Depois validar imports/consumidores, remover `hooks/useChat.ts` sem quebrar o guardrail, e fazer hardening leve em `services/apiConfig.ts`

## Blocked

- Nenhum bloqueio tecnico de runtime atual

## Validation Pending

- Nenhuma pendencia residual para o fechamento da Sprint 5; a validacao manual foi aceita em `2026-04-20` com base na confirmacao do operador e no uso real sem reclamacoes
- Sprint 6 fechada com o gate aceito da PR `#236` em `2026-04-22`:
  - `npm run typecheck`
  - `tests/prompts/megaPrompts.test.ts`
  - `tests/features/dossier/waterfall-orchestrator.test.ts`
  - `npm run test:dossier`
  - `npm run build`
- Nao houve validacao manual dedicada de Deep Dive para o fechamento da Sprint 6; o usuario confirmou que o fluxo esta atualmente oculto na superficie ativa do produto
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
| 6 | Dividir megaPrompts | done | `prompts/mega/` criado; facade estavel preservada; markers `[[PORTA_*]]` preservados; PR `#236` mergeada | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | planned | `hooks/useChat.ts` removido; `constants.ts` reduzido | `start-of-sprint-7` | `constants.ts`, `hooks/useChat.ts`, `services/apiConfig.ts` |
| 8 | War Room e docs finais | planned | `services/war-room/` ativo e docs consolidadas | `start-of-sprint-8` | `services/warRoomService.ts`, `docs/ai-context/*` |
