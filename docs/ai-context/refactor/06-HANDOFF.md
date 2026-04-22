# Handoff Curto

## Current Phase

Planejamento. Sprint 5 esta `done`. Sprint 6 e o proximo foco oficial.

Sprint 3 foi mergeada em `main` via PRs `#216`-`#221`, com o golden regression offline do dossie entrando pela PR `#222`.
Sprint 4 foi mergeada em `main` via PR `#227` (Onda 1) e PR `#228` (Onda 2).
Sprint 5 foi mergeada em `main` via PR `#229` em `2026-04-17`.
A validacao manual da Sprint 5 foi aceita em `2026-04-20` com base na confirmacao do operador e no uso continuo sem reclamacoes.

## What Was Finished

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

## What Is In Progress

- Preparacao da Sprint 6 para modularizar `prompts/megaPrompts.ts` sem quebrar markers `[[PORTA_*]]` nem builders publicos
- Nenhuma branch de implementacao da Sprint 6 foi aberta ainda

## Next Safe Step

1. Abrir a Sprint 6 em branch propria a partir do `main`
2. Dividir `prompts/megaPrompts.ts` em `prompts/mega/*`, remover `@ts-nocheck` e preservar markers `[[PORTA_*]]` e builders publicos
3. Rodar o gate automatizado/contratos da Sprint 6 e, depois, sincronizar `board`/`handoff`/`memory` novamente

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

## Validation Last Run

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
Continue a partir da abertura/implementacao da Sprint 6, focada em modularizar `prompts/megaPrompts.ts` em `prompts/mega/*`.
Preserve markers `[[PORTA_*]]`, builders publicos e use `npm run test:dossier` como fast-check quando tocar o fluxo de dossie.
