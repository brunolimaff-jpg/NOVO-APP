# Handoff Curto

## Current Phase

Validacao. Sprint 6 esta `done`. Sprint 7 esta implementada localmente em `codex/sprint7-constants-legacy-hygiene` e ainda depende de PR/review e validacao manual em Vercel antes de virar `done`.

Sprint 3 foi mergeada em `main` via PRs `#216`-`#221`, com o golden regression offline do dossie entrando pela PR `#222`.
Sprint 4 foi mergeada em `main` via PR `#227` (Onda 1) e PR `#228` (Onda 2).
Sprint 5 foi mergeada em `main` via PR `#229` em `2026-04-17`.
A Sprint 6 foi mergeada em `main` via PR `#236` em `2026-04-22`.
A validacao manual da Sprint 5 foi aceita em `2026-04-20` com base na confirmacao do operador e no uso continuo sem reclamacoes.

## Sprint 6 Closeout

- `components/ChatInterface.tsx` segue como facade publica estavel
- `components/chat/contracts.ts` concentra os contratos internos da camada
- `components/chat/ChatShell.tsx` concentra sidebar/header/composicao
- `components/chat/MessageTimeline.tsx` concentra gate, home, timeline virtualizada e wiring de `MessageRow`
- `components/chat/Composer.tsx` concentra input, prefill, processamento e retry toast
- `components/chat/ChatPanels.tsx` concentra os overlays lazy do chat
- `ChatInterfaceProps` foi preservado
- `services/geminiService.ts` permaneceu intocado
- o follow-up de UX da sidebar tambem ja esta em `main`:
  - `components/SessionsSidebar.tsx` usa `transition-transform duration-200` no mobile
  - o desktop deixou de animar largura da sidebar
  - `App.tsx` usa functional update no toggle de `isSidebarOpen`
- `docs/obsidian/00-MASTER.md` entrou em `main` via PR `#234` como camada visual de navegacao, sem substituir as fontes canonicas

## What Was Finished

- `prompts/megaPrompts.ts` virou facade publica fina para `prompts/mega/*`
- `prompts/mega/contracts.ts`, `prompts/mega/foundation.ts`, `prompts/mega/specialist-prompts.ts` e `prompts/mega/builders.ts` ja existem
- O item de remover `@ts-nocheck` estava stale no baseline atual
- a PR `#236` foi mergeada com gate tecnico green
- o Deep Dive nao exigiu validacao manual dedicada porque o fluxo esta atualmente oculto na superficie ativa do produto
- `mcp-server/` foi explicitamente adiado para depois das Sprints 6-8

## Sprint 7 Implementation

- `constants.ts` foi reduzido para facade publica de constantes/prompts principais
- `constants/market-intelligence.ts` recebeu portais, rede de parceiros, budget, concorrentes e portfolio Senior
- `hooks/useChat.ts` foi removido
- `tests/architecture/useChatImportGuard.test.ts` agora bloqueia imports e valida que o arquivo legado nao existe
- `tests/hooks/useChat.test.ts` foi substituido por `tests/utils/sessionTitleHeuristics.test.ts`
- `services/apiConfig.ts` usa helper tipado para env fallback e preserva seus exports publicos
- `SENIOR_PRODUCT_URLS` e `findSeniorProductUrl` agora sao reexportados de `utils/seniorLinks.ts`
- `types.ts`, `services/geminiService.ts` e `mcp-server/` ficaram fora do escopo

## Next Safe Step

1. Revisar o diff local da Sprint 7 e abrir PR sem incluir `mcp-server/`
2. Rodar validacao manual final em Vercel: nova sessao, primeira mensagem, follow-up, dossie completo, save/reload/export e CRM
3. Apos review/merge e validacao manual aceita, marcar Sprint 7 como `done` e apontar Sprint 8

## Files Most Relevant Now

- `docs/ai-context/refactor/01-MASTER-PLAN.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/05-VALIDATION.md`
- `docs/ai-context/refactor/06-HANDOFF.md`
- `constants.ts`
- `constants/market-intelligence.ts`
- `services/apiConfig.ts`
- `utils/seniorLinks.ts`
- `tests/architecture/useChatImportGuard.test.ts`
- `tests/utils/sessionTitleHeuristics.test.ts`
- `HANDOFF_AI.md`

## Do Not Touch Yet

- Nao quebrar markers `[[PORTA_*]]` ou builders publicos ja estabilizados
- Nao quebrar `services/apiConfig.ts` por dominio
- Nao dividir `types.ts` sem gatilho real
- Nao remover facades futuras no mesmo sprint em que os submodulos nascerem
- Nao recriar `hooks/useChat.ts`
- Nao puxar `mcp-server/` para dentro das Sprints 6-8

## Historico de Validacao

### Sprint 7 (implementada localmente em 2026-04-22)

- focused Sprint 7 suite: green em `2026-04-22`
- `npm run test:dossier`: green em `2026-04-22`
- `npm run test`: green em `2026-04-22` (`102` arquivos, `785` testes)
- `npm run typecheck`: green em `2026-04-22`
- `npm run build`: green em `2026-04-22`, com warning aceito de chunking em `utils/idbStorage.ts`
- `npm run lint`: green em `2026-04-22` com `0` erros e `182` warnings
- `npm run docs:obsidian:check`: green em `2026-04-22`
- validacao manual em Vercel: pendente

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
Considere a Sprint 5 encerrada via PR `#229`, com validacao manual aceita em `2026-04-20`.
Considere a Sprint 6 encerrada via PR `#236`.
Considere a Sprint 7 implementada localmente em `codex/sprint7-constants-legacy-hygiene`, com gates automatizados verdes e validacao manual em Vercel ainda pendente.
Revise o diff, abra PR sem incluir `mcp-server/`, rode a validacao manual final em Vercel e so entao marque Sprint 7 como `done`.
