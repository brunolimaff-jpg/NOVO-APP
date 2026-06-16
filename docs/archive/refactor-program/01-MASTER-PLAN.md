# Master Plan - Refatoracao Estrutural

## Objetivo

Reduzir acoplamento, risco de regressao e custo de manutencao do fluxo principal do
produto sem interromper a evolucao funcional.

## Baseline historica (inicio da trilha)

- Fonte de verdade inicial do programa: `origin/main` em `3c1412e3b19905abc843ceae36ba5399355f8d63` (2026-04-11)
- Baseline inicial: `npm run test`, `npm run typecheck` e `npm run build` verdes
- Warnings aceitos no inicio: `useUpdateNotification` (`/version.json`), warnings de `act(...)` em testes de `App`, chunk warning em `utils/idbStorage.ts`

## Fase 1 (Sprints 1-8) - concluida

### Sequencia executada

1. Sprint 1 - baseline e fronteiras
2. Sprint 2 - quebra interna de `services/geminiService.ts`
3. Sprint 3 - extracao de chat para `features/chat/*`
4. Sprint 4 - extracao de dossie + `stores/*` + boundaries
5. Sprint 5 - modularizacao de `components/chat/*`
6. Sprint 6 - divisao de `prompts/megaPrompts.ts`
7. Sprint 7 - constantes, legado e higiene
8. Sprint 8 - modularizacao de War Room + stub de `features/radar/*`

### Fechamento da fase

- Sprint 8 mergeada em `main` via PR `#241` (`ccd2001518367961637b1a9488c2319aa83d0a21`)
- Sprints 1-8 consolidadas como `done`
- Boundaries principais estabilizadas: `services/gemini/*`, `services/war-room/*`, `features/chat/*`, `features/dossier/*`, `features/radar/*` (stub)

## Fase 2 (Sprints 9-12) - manutenibilidade

- O plano detalhado da nova fase esta em `08-PHASE2-MAINTAINABILITY-PLAN.md`.
- Escopo da fase: reduzir hotspots de manutencao sem quebrar as APIs publicas congeladas.
- Sequencia alvo:
  - Sprint 9: App shell decoupling + governanca
  - Sprint 10: Radar boundary completion
  - Sprint 11: componentes grandes + tipagem forte
  - Sprint 12: hardening final (warnings, guardrails, closeout)

## Guardrails

- Nao quebrar APIs publicas congeladas:
  - `services/geminiService.ts`
  - `services/warRoomService.ts`
  - `components/ChatInterface.tsx`
  - `constants.ts`
  - `prompts/megaPrompts.ts`
  - `types.ts` (centralizado, salvo ROI explicito)
- Nao remover facade publica no mesmo sprint em que submodulos internos nascem.
- Se `test`, `typecheck`, `build` ou `lint` ficarem vermelhos, bloquear avancos da sprint.

## Fora de Escopo da trilha

- Reescrever UX/produto do zero
- Trocar stack principal
- Reescrever regras comerciais por iniciativa de refactor
- Incluir `mcp-server/` na trilha sem repriorizacao explicita
