# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `478419c8f3d3028088a553da5ed53d6be5e2a2b5` |
| Working branch | `codex/sprint6-mega-prompts-modularization` |
| Last updated | `2026-04-22` |
| Current phase | `implementation` |
| Current sprint | `6` |
| Overall status | `active` |
| Current baseline | `main` ja inclui Sprint 5 mergeada via PR `#229`, os docs do War Room via PR `#230`, o pacote adicional de regressao via PR `#233`, a camada versionada de Obsidian via PR `#234`, e o fechamento documental da Sprint 5 via PR `#235`; a Sprint 6 agora esta ativa em branch propria |

## Current Focus

- Sprint 2 foi concluida e mergeada sem quebrar a fachada publica de `services/geminiService.ts`
- A extracao interna da camada Gemini ficou ativa em `services/gemini/` com compatibilidade preservada
- Sprint 3 foi concluida e mergeada em `main` atraves das PRs `#216`-`#221`, com a regressao offline do dossie canonico entrando via PR `#222`
- Sprint 4 foi concluida e mergeada em `main` via PR `#227` (Onda 1) e PR `#228` (Onda 2)
- Sprint 5 foi concluida em `main` via PR `#229`, com validacao manual aceita em `2026-04-20`
- Sprint 6 agora esta em implementacao:
  - `prompts/megaPrompts.ts` ja virou facade publica fina
  - `prompts/mega/*` ja foi aberto com `contracts.ts`, `foundation.ts`, `specialist-prompts.ts` e `builders.ts`
  - markers `[[PORTA_*]]`, builders publicos e contratos textuais precisam permanecer intactos
  - o item historico de remover `@ts-nocheck` ficou stale no baseline atual, porque o pragma ja nao existia no arquivo
  - `mcp-server/` fica explicitamente fora da trilha de refactor ate o fim das Sprints 6-8

## Next Up

1. Revisar e mergear a PR `#236` da Sprint 6
2. Preservar markers `[[PORTA_*]]`, builders publicos e contratos textuais; nao fazer cleanup cego de encoding sem defeito concreto
3. Sincronizar `main`/docs novamente com o estado real da sprint quando a PR `#236` avancar para merge

## Blocked

- Nenhum bloqueio tecnico de runtime atual

## Validation Pending

- Nenhuma pendencia residual para o fechamento da Sprint 5; a validacao manual foi aceita em `2026-04-20` com base na confirmacao do operador e no uso real sem reclamacoes
- Onda 1 da Sprint 6 ja validada em `2026-04-22` com:
  - `npm run typecheck`
  - `tests/prompts/megaPrompts.test.ts`
  - `tests/features/dossier/waterfall-orchestrator.test.ts`
  - `npm run test:dossier`
  - `npm run build`
- Nao ha validacao manual dedicada de Deep Dive pendente para a PR da Sprint 6; o usuario confirmou que o fluxo de Deep Dive esta atualmente oculto na superficie ativa do produto
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
| 6 | Dividir megaPrompts | active | `prompts/mega/` criado; facade estavel preservada; markers `[[PORTA_*]]` preservados; gate da Onda 1 verde | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | planned | `hooks/useChat.ts` removido; `constants.ts` reduzido | `start-of-sprint-7` | `constants.ts`, `hooks/useChat.ts`, `services/apiConfig.ts` |
| 8 | War Room e docs finais | planned | `services/war-room/` ativo e docs consolidadas | `start-of-sprint-8` | `services/warRoomService.ts`, `docs/ai-context/*` |
