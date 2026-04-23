# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `main` -> `e9ca55088d2ede31be101d1f37e1f2729788c16d` |
| Working branch | `main` |
| Last updated | `2026-04-23` |
| Current phase | `planning` |
| Current sprint | `8` |
| Overall status | `active` |
| Current baseline | `main` ja inclui Sprint 5 mergeada via PR `#229`, os docs do War Room via PR `#230`, o pacote adicional de regressao via PR `#233`, a camada versionada de Obsidian via PR `#234`, o fechamento documental da Sprint 5 via PR `#235`, a Sprint 6 mergeada via PR `#236`, o closeout documental via PR `#238` e a Sprint 7 mergeada via PR `#239` |

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
- Sprint 7 foi concluida em `main` via PR `#239` em `2026-04-23`:
  - `constants.ts` permaneceu como facade publica
  - `constants/market-intelligence.ts` recebeu portais, rede de parceiros, budget, concorrentes e portfolio Senior
  - `hooks/useChat.ts` foi removido
  - `tests/architecture/useChatImportGuard.test.ts` agora bloqueia imports e valida que o arquivo legado nao existe
  - `tests/hooks/useChat.test.ts` foi substituido por `tests/utils/sessionTitleHeuristics.test.ts`
  - `services/apiConfig.ts` usa env fallback tipado com referencias estaticas `import.meta.env.VITE_*` e reexporta o mapa Senior de `utils/seniorLinks.ts`
  - feedback do Gemini na PR foi enderecado: env Vite estatico e `mcp-server/src/index.ts` removido do diff
  - validacao manual em runtime real foi aceita em `2026-04-23`
  - `types.ts` permaneceu centralizado
- Sprint 8 agora e o proximo foco oficial:
  - criar `services/war-room/`
  - modularizar `services/warRoomService.ts` com facade publica preservada
  - consolidar a documentacao final e a arquitetura do War Room
- `mcp-server/` fica explicitamente fora da trilha de refactor ate o fim das Sprints 6-8

## Next Up

1. Abrir a Sprint 8 a partir do `main` pos-`#239`
2. Criar `services/war-room/` e mover as responsabilidades internas de `services/warRoomService.ts` mantendo a facade publica
3. Consolidar a documentacao final da trilha e manter OI-044 em vista se Radar voltar a encostar em `App.tsx`

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
- Sprint 7 fechada sem pendencias de validacao:
  - PR `#239` mergeada em `main` em `2026-04-23`
  - validacao manual aceita em `2026-04-23`
- Nenhuma validacao ativa pendente ate a abertura da Sprint 8

## Known Accepted Warnings

- `tests/components/SessionsSidebar.test.tsx` ainda emite o warning `Functions are not valid as a React child`
- Build ainda emite o warning de chunking envolvendo `utils/idbStorage.ts`
- `npm run lint` agora passa em `main` pos-`#239`, mas ainda emite backlog de warnings; parte do ruido vem do `mcp-server/` diferido e nao deve entrar na trilha

## Sprint Tracker

| Sprint | Goal | Status | Exit Criteria | Rollback Point | Primary Files/Modules |
|---|---|---|---|---|---|
| 1 | Baseline e fronteiras | done | Clerk/auth removido, fronteiras documentadas, guardrail contra novos consumidores de legado, validacao da sprint registrada | `origin/main@3c1412e` | `App.tsx`, `components/ChatInterface.tsx`, `contexts/OperatorContext.tsx`, `hooks/useChat.ts`, `services/geminiService.ts` |
| 2 | Quebrar Gemini | done | `services/gemini/` criado com facade estavel | `origin/main@ef30b5d` | `services/geminiService.ts`, `services/gemini/*` |
| 3 | Extrair chat do App | done | `features/chat/` ativo; `App.tsx` reduzido; validacao manual integrada concluida em `2026-04-15` | `origin/main@510f91fa3653cbfa1552e7f3d4e3a43883a45e17` | `App.tsx`, `features/chat/*` |
| 4 | Extrair dossie do App | done | Onda 1 implementa `features/dossier/`; Onda 2 consolida `stores/*` e error boundaries | `start-of-sprint-4` | `App.tsx`, `features/dossier/*`, `stores/*` |
| 5 | Modularizar ChatInterface | done | `components/chat/` ativo com facade estavel em `ChatInterface.tsx`; PR `#229` mergeada e validacao manual aceita em `2026-04-20` | `origin/main@16c8f2e` | `components/ChatInterface.tsx`, `components/chat/*` |
| 6 | Dividir megaPrompts | done | `prompts/mega/` criado; facade estavel preservada; markers `[[PORTA_*]]` preservados; PR `#236` mergeada | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | done | `hooks/useChat.ts` removido; `constants.ts` reduzido; guardrail atualizado; `apiConfig` endurecido; PR `#239` mergeada; validacao manual aceita em `2026-04-23` | `start-of-sprint-7` | `constants.ts`, `constants/market-intelligence.ts`, `services/apiConfig.ts`, `utils/seniorLinks.ts`, `tests/architecture/useChatImportGuard.test.ts` |
| 8 | War Room e docs finais | planned | `services/war-room/` ativo e docs consolidadas | `start-of-sprint-8` | `services/warRoomService.ts`, `docs/ai-context/*` |
