# Master Plan - Refatoracao Estrutural

## Objetivo

Reduzir risco de regressao e acoplamento no fluxo principal do produto sem parar a
evolucao do app. A estrategia prioriza hotspots reais do runtime antes de fazer
limpeza transversal.

## Baseline de Partida

- Fonte de verdade de referencia: `origin/main` em `3c1412e3b19905abc843ceae36ba5399355f8d63`
- Working branch no inicio do programa: `codex/centralize-ai-model-config`
- Baseline conhecido em 2026-04-11:
  - `npm run test`: verde
  - `npm run typecheck`: verde
  - `npm run build`: verde
- Warnings aceitos no baseline inicial:
  - `fetch('/version.json')` em testes de `useUpdateNotification`
  - warnings de `act(...)` nos testes de `App`
  - warning de chunking envolvendo `utils/idbStorage.ts`

## Sequencia de Sprints

### Sprint 1 - Baseline e Fronteiras
- Congelar a arquitetura atual e impedir novos consumidores de legado.
- Declarar `App.tsx` como orquestracao ativa unica.
- Tratar `hooks/useChat.ts` como legado morto.

### Sprint 2 - Quebrar `services/geminiService.ts`
- Extrair submodulos em `services/gemini/`.
- Manter `services/geminiService.ts` como facade estavel.

### Sprint 3 - Extrair Chat de `App.tsx`
- Criar `features/chat/`.
- Mover sessao, envio, loading, feedback e save remoto.

### Sprint 4 - Extrair Dossie de `App.tsx`
- Criar `features/dossier/`.
- Mover waterfall, benchmark, retries e reconciliacao PORTA.

### Sprint 5 - Modularizar `components/ChatInterface.tsx`
- Criar `components/chat/`.
- Separar shell, timeline, composer e paineis.

### Sprint 6 - Sprint Dedicado a `prompts/megaPrompts.ts`
- Criar `prompts/mega/`.
- Remover `@ts-nocheck`.
- Preservar contratos `[[PORTA_*]]` e builders publicos.

### Sprint 7 - Constantes, Legado e Higiene
- Extrair partes de alto ROI de `constants.ts`.
- Remover `hooks/useChat.ts`.
- Fazer hardening leve em `services/apiConfig.ts`.
- Manter `types.ts` centralizado salvo ganho claro.

### Sprint 8 - War Room e Fechamento
- Criar `services/war-room/`.
- Modularizar `services/warRoomService.ts`.
- Atualizar documentacao final e consolidar arquitetura.

## Guardrails

- Nao quebrar `services/apiConfig.ts` por dominio neste programa.
- Nao dividir `types.ts` sem gatilho real de ROI.
- Durante Sprints 2-5, manter facades temporarias:
  - `services/geminiService.ts`
  - `components/ChatInterface.tsx`
  - `services/warRoomService.ts`
- Se `test`, `typecheck` ou `build` ficarem vermelhos, parar o programa e restaurar baseline antes do proximo sprint.

## Fora de Escopo

- Reescrever produto ou UX do zero
- Trocar stack principal
- Redesenhar regras comerciais do Scout
- Introduzir novas features no nome da refatoracao
