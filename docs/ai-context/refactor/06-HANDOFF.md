# Handoff Curto

## Current Phase

Execucao. Sprint 6 esta `done`. Sprint 7 foi encerrada via PR `#239` mergeada em `2026-04-23`, com closeout em `main` via PR `#240` no mesmo dia. Sprint 8 esta implementada localmente e aguarda apenas validacao manual/PR.

Sprint 3 foi mergeada em `main` via PRs `#216`-`#221`, com o golden regression offline do dossie entrando pela PR `#222`.
Sprint 4 foi mergeada em `main` via PR `#227` (Onda 1) e PR `#228` (Onda 2).
Sprint 5 foi mergeada em `main` via PR `#229` em `2026-04-17`.
A Sprint 6 foi mergeada em `main` via PR `#236` em `2026-04-22`.
A validacao manual da Sprint 5 foi aceita em `2026-04-20` com base na confirmacao do operador e no uso continuo sem reclamacoes.

## Sprint 8 Working State

- `services/warRoomService.ts` segue como facade publica estavel
- `services/war-room/contracts.ts`, `config.ts`, `history.ts`, `intent.ts`, `retrieval.ts`, `prompting.ts`, `sources.ts` e `query.ts` agora concentram a implementacao do War Room
- `components/WarRoom.tsx` deixou de carregar parser local e importa `extractCompetitorFromMessage`, `isBlockedIntent` e `resolveWarRoomIntent` de `services/war-room/intent.ts`
- `tests/components/warRoomTargetExtract.test.ts` passou a testar o helper compartilhado, em vez de manter uma copia da regex
- `features/radar/README.md`, `features/radar/types.ts` e `features/radar/index.ts` formalizam o boundary do Radar sem mover `hooks/useRadar.ts`, `services/radarService.ts` ou os componentes Radar ainda
- `types.ts` continua como fonte de verdade dos contratos Radar

## What Was Finished

- `origin/main` ja inclui o fechamento documental da Sprint 7 via PR `#240`
- A implementacao local da Sprint 8 concluiu a modularizacao do War Room com facade preservada
- O parser de intencao/alvo duplicado foi removido de `components/WarRoom.tsx`
- O stub arquitetural de `features/radar/` foi criado e fecha o OI-044
- `mcp-server/` continuou fora do escopo

## Sprint 7 Implementation

- `constants.ts` foi reduzido para facade publica de constantes/prompts principais
- `constants/market-intelligence.ts` recebeu portais, rede de parceiros, budget, concorrentes e portfolio Senior
- `hooks/useChat.ts` foi removido
- `tests/architecture/useChatImportGuard.test.ts` agora bloqueia imports e valida que o arquivo legado nao existe
- `tests/hooks/useChat.test.ts` foi substituido por `tests/utils/sessionTitleHeuristics.test.ts`
- `services/apiConfig.ts` usa helper tipado com referencias estaticas `import.meta.env.VITE_*` para env fallback e preserva seus exports publicos
- `SENIOR_PRODUCT_URLS` e `findSeniorProductUrl` agora sao reexportados de `utils/seniorLinks.ts`
- `types.ts`, `services/geminiService.ts` e `mcp-server/` ficaram fora do escopo
- Feedback do Gemini na PR foi enderecado: env Vite estatico e `mcp-server/src/index.ts` fora do diff
- PR `#239` foi mergeada em `main` em `2026-04-23`
- Validacao manual final foi aceita em `2026-04-23`

## Next Safe Step

1. Rodar a validacao manual da Sprint 8 em preview/Vercel para War Room e Radar
2. Abrir/revisar a PR da Sprint 8 com `services/warRoomService.ts` como facade publica
3. Manter o runtime atual do Radar fora da nova boundary ate a proxima fatia funcional

## Files Most Relevant Now

- `docs/ai-context/refactor/01-MASTER-PLAN.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/05-VALIDATION.md`
- `docs/ai-context/refactor/06-HANDOFF.md`
- `services/warRoomService.ts`
- `services/war-room/contracts.ts`
- `services/war-room/intent.ts`
- `services/war-room/query.ts`
- `services/war-room/retrieval.ts`
- `features/radar/README.md`
- `features/radar/types.ts`
- `docs/ai-context/ROADMAP_WAR_ROOM.md`
- `docs/ai-context/WAR_ROOM_EXECUTIVE_SUMMARY.md`
- `docs/ai-context/ARCHITECTURE_MAP.md`
- `HANDOFF_AI.md`

## Do Not Touch Yet

- Nao quebrar markers `[[PORTA_*]]` ou builders publicos ja estabilizados
- Nao quebrar `services/apiConfig.ts` por dominio
- Nao dividir `types.ts` sem gatilho real
- Nao remover facades futuras no mesmo sprint em que os submodulos nascerem
- Nao recriar `hooks/useChat.ts`
- Nao puxar `mcp-server/` para dentro das Sprints 6-8

## Historico de Validacao

### Sprint 8 (implementada localmente em 2026-04-23)

- focused Sprint 8 suite: green em `2026-04-23`
- `npm run test`: green em `2026-04-23` (`102` arquivos, `785` testes)
- `npm run typecheck`: green em `2026-04-23`
- `npm run build`: green em `2026-04-23`, com warning aceito de chunking em `utils/idbStorage.ts`
- `npm run lint`: green em `2026-04-23` com `0` erros e `180` warnings
- validacao manual em Vercel: pendente

### Sprint 7 (concluida em 2026-04-23)

- focused Sprint 7 suite: green em `2026-04-22`
- `npm run test:dossier`: green em `2026-04-22`
- `npm run test`: green em `2026-04-22` (`102` arquivos, `785` testes)
- `npm run typecheck`: green em `2026-04-22`
- `npm run build`: green em `2026-04-22`, com warning aceito de chunking em `utils/idbStorage.ts`
- `npm run lint`: green em `2026-04-22` com `0` erros e `182` warnings
- `npm run docs:obsidian:check`: green em `2026-04-22`
- PR `#239`: mergeada em `2026-04-23`
- validacao manual em Vercel: aceita em `2026-04-23`

### Sprint 6 (concluida em 2026-04-22)

- `npm run typecheck`: green em `2026-04-22`
- `tests/prompts/megaPrompts.test.ts`: green em `2026-04-22`
- `tests/features/dossier/waterfall-orchestrator.test.ts`: green em `2026-04-22`
- `npm run test:dossier`: green em `2026-04-22`
- `npm run build`: green em `2026-04-22`
- `npm run test:e2e:smoke`: green em `2026-04-22` apos endurecer `tests-e2e/smoke.chat-shell.spec.ts`
- Deep Dive nao exigiu validacao manual dedicada para o fechamento da Sprint 6, porque o usuario confirmou que o fluxo esta atualmente oculto na superficie ativa do produto

### Sprint 5 e anteriores

- validacao manual da Sprint 5 aceita em `2026-04-20` com base na confirmacao do operador e no uso continuo sem reclamacoes
- `tests/components/ChatInterface.test.tsx`: green em `2026-04-17`
- `tests/components/chat/Composer.test.tsx`: green em `2026-04-17`
- `tests/components/chat/MessageTimeline.test.tsx`: green em `2026-04-17`
- `tests/components/chat/ChatPanels.test.tsx`: green em `2026-04-17`
- `tests/components/SessionsSidebar.test.tsx`: green em `2026-04-17`
- `npm run test`: green em `2026-04-17`
- `npm run typecheck`: green em `2026-04-17`
- `npm run build`: green em `2026-04-17`
- `npm run docs:obsidian:check`: green em `2026-04-19`
- `npm run typecheck`: green em `2026-04-19`
- `npm run lint`: o baseline historico vermelho foi superado no branch Sprint 7; ainda resta backlog de warnings (`182` em `2026-04-22`)

## Suggested Prompt For Next AI

Leia `docs/ai-context/refactor/00-README.md`, depois `01-MASTER-PLAN.md`,
`02-BOARD.md`, `03-OPEN-ITEMS.md`, `05-VALIDATION.md` e `06-HANDOFF.md`.
Considere a Sprint 7 encerrada via PRs `#239` e `#240`.
Considere a Sprint 8 implementada localmente em `codex/sprint7-closeout-sprint8-open`, com `services/war-room/` ativo, facade publica preservada e `features/radar/` criado como stub.
Valide manualmente em preview/Vercel os fluxos de War Room e Radar antes de abrir/mergear a PR.
