# Handoff Curto

## Current Phase

Planejamento. Sprint 6 esta `done`. Sprint 7 e o proximo foco oficial.

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

## Next Safe Step

1. Abrir a Sprint 7 a partir do `main` pos-`#236`
2. Extrair primeiro o bloco de inteligencia de mercado de `constants.ts` para `market-intelligence.ts`
3. Depois validar imports/consumidores, remover `hooks/useChat.ts` sem quebrar o guardrail e fazer hardening leve em `services/apiConfig.ts`

## Files Most Relevant Now

- `docs/ai-context/refactor/01-MASTER-PLAN.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/05-VALIDATION.md`
- `docs/ai-context/refactor/06-HANDOFF.md`
- `prompts/megaPrompts.ts`
- `prompts/systemPrompts.ts`
- `HANDOFF_AI.md`

## Do Not Touch Yet

- Nao quebrar markers `[[PORTA_*]]` ou builders publicos ao modularizar prompts
- Nao quebrar `services/apiConfig.ts` por dominio
- Nao dividir `types.ts` sem gatilho real
- Nao remover facades futuras no mesmo sprint em que os submodulos nascerem
- Nao puxar `mcp-server/` para dentro das Sprints 6-8

## Historico de Validacao

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
- `npm run lint`: red em `2026-04-11` por backlog historico do repo (`37` erros, `217` warnings)

## Suggested Prompt For Next AI

Leia `docs/ai-context/refactor/00-README.md`, depois `01-MASTER-PLAN.md`,
`02-BOARD.md`, `03-OPEN-ITEMS.md`, `05-VALIDATION.md` e `06-HANDOFF.md`.
Considere a Sprint 5 encerrada via PR `#229`, com validacao manual aceita em `2026-04-20`.
Considere a Sprint 6 encerrada via PR `#236`.
Abra a Sprint 7 a partir do `main`, priorizando extrair `market-intelligence.ts` de `constants.ts`, depois validar imports/consumidores, remover `hooks/useChat.ts` sem quebrar o guardrail estrutural e fazer hardening leve em `services/apiConfig.ts`.
Preserve `types.ts` centralizado salvo ganho claro, mantenha `mcp-server/` fora das Sprints 7-8 e use `npm run test:dossier` quando a higiene tocar indiretamente o fluxo de dossie.
