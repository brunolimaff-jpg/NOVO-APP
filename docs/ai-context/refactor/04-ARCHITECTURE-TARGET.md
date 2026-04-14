# Target Architecture

## Estrutura Alvo

```text
docs/ai-context/refactor/
services/
  gemini/
    context-builder.ts
    continuity.ts
    porta.ts
    dossier-modules.ts
    fallbacks.ts
  war-room/
    context.ts
    classifiers.ts
    query.ts
features/
  chat/
    session-controller.ts
    message-orchestrator.ts
    loading-progress.ts
    feedback-actions.ts
  dossier/
    waterfall-orchestrator.ts
    porta-reconciliation.ts
    benchmark-stage.ts
components/
  chat/
    ChatShell.tsx
    MessageTimeline.tsx
    Composer.tsx
    ChatPanels.tsx
prompts/
  mega/
    foundation.ts
    modules.ts
    builders.ts
    contracts.ts
constants/
  loadingStages.ts
  app.ts
  market-intelligence.ts
  competitive.ts
```

## Facades Temporarias

- `services/geminiService.ts`
  - permanece como fachada durante Sprints 2-4
  - importadores de producao continuam usando este caminho

- `components/ChatInterface.tsx`
  - permanece como fachada durante Sprint 5
  - props publicas nao mudam neste sprint

- `services/warRoomService.ts`
  - permanece como fachada durante Sprint 8
  - chamadas existentes nao mudam no mesmo sprint de extracao

## Regras de Dependencia

- `App.tsx` pode depender de `features/*`, nunca de detalhes internos em cascata.
- `features/chat/*` pode depender de `services/geminiService.ts`, nao de submodulos internos no primeiro sprint de extracao.
- `features/dossier/*` pode depender de `services/geminiService.ts` e `utils/porta.ts`.
- `components/chat/*` pode depender de `types.ts`, hooks e componentes pequenos; nao deve chamar services diretamente.
- `prompts/mega/*` nao deve depender de componentes.
- `services/war-room/*` nao deve depender de UI.

## Regras de Organizacao

- Separar por responsabilidade, nao apenas por tamanho.
- Um modulo nao deve ter dois caminhos ativos para a mesma regra de negocio.
- Se o arquivo antigo continuar existindo, ele deve ser facade ou wrapper, nao uma segunda implementacao.
- Nomes devem refletir intencao: `message-orchestrator` e melhor que `chatUtils2`.
