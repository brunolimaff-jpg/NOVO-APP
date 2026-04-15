# Target Architecture

> Atualizado em 2026-04-14 — incorpora camadas aprovadas apos revisao Board Room:
> stores/ (estado global), error boundaries por feature e pre-esqueleto features/radar/.

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
    ChatErrorBoundary.tsx        ← NOVO (Sprint 4)
  dossier/
    waterfall-orchestrator.ts
    porta-reconciliation.ts
    benchmark-stage.ts
    DossierErrorBoundary.tsx     ← NOVO (Sprint 4)
  radar/                         ← NOVO (pre-esqueleto Sprint 8)
    README.md                    ← contrato de dominio e tipos base
    types.ts                     ← RadarAlert, RadarCategory, RadarEntry
    index.ts                     ← barrel stub (nao implementado)
components/
  chat/
    ChatShell.tsx
    MessageTimeline.tsx
    Composer.tsx
    ChatPanels.tsx
stores/                          ← NOVO (Sprint 4, junto com extracao dossier)
  chatStore.ts                   ← estado de sessao, mensagens, loading
  dossierStore.ts                ← waterfall stage, scores PORTA, benchmark
prompts/
  mega/
    foundation.ts
    modules.ts
    builders.ts
    contracts.ts
constants/
  loadingStages.ts
  app.ts
  market-intelligence.ts        ← prioridade Sprint 7 (dados mutaveis)
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

- `App.tsx` pode depender de `features/*` e `stores/*`, nunca de detalhes internos em cascata.
- `features/chat/*` pode depender de `services/geminiService.ts` e de `stores/chatStore.ts`; nao de submodulos internos no primeiro sprint de extracao.
- `features/dossier/*` pode depender de `services/geminiService.ts`, `utils/porta.ts` e `stores/dossierStore.ts`.
- `components/chat/*` pode depender de `types.ts`, hooks e componentes pequenos; nao deve chamar services diretamente.
- `prompts/mega/*` nao deve depender de componentes.
- `services/war-room/*` nao deve depender de UI.
- `stores/*` nao deve depender de componentes nem de features — apenas de types e utils.
- `features/radar/*` nao deve implementar logica de negocio ate ser formalmente iniciada no roadmap; o pre-esqueleto existe apenas como contrato de tipos.

## Regras de Organizacao

- Separar por responsabilidade, nao apenas por tamanho.
- Um modulo nao deve ter dois caminhos ativos para a mesma regra de negocio.
- Se o arquivo antigo continuar existindo, ele deve ser facade ou wrapper, nao uma segunda implementacao.
- Nomes devem refletir intencao: `message-orchestrator` e melhor que `chatUtils2`.
- Error boundaries sao responsabilidade da feature, nao do componente pai. Cada feature exporta seu proprio boundary.
- `stores/*` usa Zustand ou Context+Reducer tipado — nunca estado flutuando em props passadas pelo `App.tsx` pos-Sprint 4.

## Sequencia de Introducao das Novas Camadas

| Camada | Sprint de Introducao | Dependencia | Gate de Aceite |
|---|---|---|---|
| `stores/chatStore.ts` | Sprint 4 (junto com extracao dossier) | `message-orchestrator` concluido | Props de sessao somem do `App.tsx` |
| `stores/dossierStore.ts` | Sprint 4 | `waterfall-orchestrator` concluido | `App.tsx` nao segura mais score PORTA |
| `ChatErrorBoundary.tsx` | Sprint 4 | `features/chat/` estabilizada | Gemini 429/500 nao quebra tela |
| `DossierErrorBoundary.tsx` | Sprint 4 | `features/dossier/` estabilizada | Waterfall falho exibe fallback visual |
| `features/radar/` (stub) | Sprint 8 | Nenhuma — apenas tipos | `tsc --noEmit` verde |
| Validacao Zod em `[[PORTA_*]]` | Sprint 6 | `prompts/mega/contracts.ts` | 3 cenarios de alucinacao passam |
| `constants/market-intelligence.ts` | Sprint 7 (antes de `constants/app.ts`) | Nenhuma | Nenhuma constante de UI regride |
