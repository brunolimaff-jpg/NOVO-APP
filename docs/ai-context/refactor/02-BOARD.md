# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `main` -> `d514733f7ababa0a9dab4c4a26f133d39bc6e342` |
| Working branch | `codex/sprint7-constants-legacy-hygiene` |
| Last updated | `2026-04-22` |
| Current phase | `validation` |
| Current sprint | `7` |
| Overall status | `active` |
| Current baseline | `main` ja inclui Sprint 5 mergeada via PR `#229`, os docs do War Room via PR `#230`, o pacote adicional de regressao via PR `#233`, a camada versionada de Obsidian via PR `#234`, o fechamento documental da Sprint 5 via PR `#235` e a Sprint 6 mergeada via PR `#236`; Sprint 7 esta implementada localmente e ainda nao mergeada |

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
- Sprint 7 esta implementada localmente em `codex/sprint7-constants-legacy-hygiene`:
  - `constants.ts` permaneceu como facade publica
  - `constants/market-intelligence.ts` recebeu portais, rede de parceiros, budget, concorrentes e portfolio Senior
  - `hooks/useChat.ts` foi removido
  - `tests/architecture/useChatImportGuard.test.ts` agora bloqueia imports e valida que o arquivo legado nao existe
  - `tests/hooks/useChat.test.ts` foi substituido por `tests/utils/sessionTitleHeuristics.test.ts`
  - `services/apiConfig.ts` usa env fallback tipado e reexporta o mapa Senior de `utils/seniorLinks.ts`
  - `types.ts` permaneceu centralizado
- `mcp-server/` fica explicitamente fora da trilha de refactor ate o fim das Sprints 6-8

## Next Up

1. Revisar o diff da Sprint 7 e abrir PR sem incluir `mcp-server/`
2. Rodar a validacao manual final em Vercel: nova sessao, primeira mensagem, follow-up, dossie completo, save/reload/export e CRM
3. Apos review/merge e validacao manual aceita, marcar Sprint 7 como `done` e abrir Sprint 8

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
- Sprint 7 implementada localmente com gate automatizado verde em `2026-04-22`:
  - `npx vitest run tests/prompts/constantsPromptRules.test.ts tests/utils/constants.test.ts tests/utils/seniorLinks.test.ts tests/utils/linkFixer.test.ts tests/architecture/useChatImportGuard.test.ts tests/utils/sessionTitleHeuristics.test.ts`
  - `npm run test:dossier`
  - `npm run test`
  - `npm run typecheck`
  - `npm run build`
  - `npm run lint` passou com `0` erros e `182` warnings
  - `npm run docs:obsidian:check`
- Validacao manual final da Sprint 7 em Vercel ainda pendente

## Known Accepted Warnings

- `tests/components/SessionsSidebar.test.tsx` ainda emite o warning `Functions are not valid as a React child`
- Build ainda emite o warning de chunking envolvendo `utils/idbStorage.ts`
- `npm run lint` agora passa, mas ainda emite backlog de warnings; parte do ruido vem do `mcp-server/` diferido e nao deve entrar no PR da Sprint 7

## Sprint Tracker

| Sprint | Goal | Status | Exit Criteria | Rollback Point | Primary Files/Modules |
|---|---|---|---|---|---|
| 1 | Baseline e fronteiras | done | Clerk/auth removido, fronteiras documentadas, guardrail contra novos consumidores de legado, validacao da sprint registrada | `origin/main@3c1412e` | `App.tsx`, `components/ChatInterface.tsx`, `contexts/OperatorContext.tsx`, `hooks/useChat.ts`, `services/geminiService.ts` |
| 2 | Quebrar Gemini | done | `services/gemini/` criado com facade estavel | `origin/main@ef30b5d` | `services/geminiService.ts`, `services/gemini/*` |
| 3 | Extrair chat do App | done | `features/chat/` ativo; `App.tsx` reduzido; validacao manual integrada concluida em `2026-04-15` | `origin/main@510f91fa3653cbfa1552e7f3d4e3a43883a45e17` | `App.tsx`, `features/chat/*` |
| 4 | Extrair dossie do App | done | Onda 1 implementa `features/dossier/`; Onda 2 consolida `stores/*` e error boundaries | `start-of-sprint-4` | `App.tsx`, `features/dossier/*`, `stores/*` |
| 5 | Modularizar ChatInterface | done | `components/chat/` ativo com facade estavel em `ChatInterface.tsx`; PR `#229` mergeada e validacao manual aceita em `2026-04-20` | `origin/main@16c8f2e` | `components/ChatInterface.tsx`, `components/chat/*` |
| 6 | Dividir megaPrompts | done | `prompts/mega/` criado; facade estavel preservada; markers `[[PORTA_*]]` preservados; PR `#236` mergeada | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | validation | `hooks/useChat.ts` removido; `constants.ts` reduzido; guardrail atualizado; `apiConfig` endurecido; gates automatizados verdes; validacao manual/PR pendentes | `start-of-sprint-7` | `constants.ts`, `constants/market-intelligence.ts`, `services/apiConfig.ts`, `utils/seniorLinks.ts`, `tests/architecture/useChatImportGuard.test.ts` |
| 8 | War Room e docs finais | planned | `services/war-room/` ativo e docs consolidadas | `start-of-sprint-8` | `services/warRoomService.ts`, `docs/ai-context/*` |
