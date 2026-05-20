# Target Architecture

> Atualizado em 2026-05-16 — incorpora Sprint 10 com runtime do Radar movido para `features/radar/*`
> e facades de compatibilidade preservadas.

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
  radar/
    README.md                    ← contrato de dominio e escopo
    types.ts                     ← reexports de contratos estaveis de `types.ts`
    service.ts                   ← cliente frontend de `/api/radar-scan`
    useRadar.ts                  ← estado, persistencia e scan orchestration
    index.ts                     ← barrel publico da feature
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

- `hooks/useRadar.ts` e `services/radarService.ts`
  - permanecem como facades de compatibilidade durante a Sprint 10
  - novos imports de producao devem usar `features/radar`

## Regras de Dependencia

- `App.tsx` pode depender de `features/*` e `stores/*`, nunca de detalhes internos em cascata.
- `features/chat/*` pode depender de `services/geminiService.ts` e de `stores/chatStore.ts`; nao de submodulos internos no primeiro sprint de extracao.
- `features/dossier/*` pode depender de `services/geminiService.ts`, `utils/porta.ts` e `stores/dossierStore.ts`. **Nao pode importar internos de `features/chat/*`** — utilitarios compartilhados devem estar em `utils/` ou `features/_shared/`.
- `components/chat/*` pode depender de `types.ts`, hooks e componentes pequenos; nao deve chamar services diretamente.
- `prompts/mega/*` nao deve depender de componentes.
- `services/war-room/*` nao deve depender de UI.
- `stores/*` nao deve depender de componentes nem de features — apenas de types e utils.
- `features/radar/*` concentra o runtime de Radar. `hooks/useRadar.ts` e `services/radarService.ts` existem apenas como facades temporarias de compatibilidade.

## Estado Atual vs Alvo (2026-05-16)

| Regra | Estado Atual | Sprint de Resolucao |
|---|---|---|
| `features/dossier/*` nao importa de `features/chat/*` | **Resolvido** (Sprint 9 / PR `#254`) | done |
| `features/radar/*` contem runtime completo | **Resolvido** (Sprint 10; facades antigas preservadas) | done |
| `VITE_PINECONE_API_KEY` nao exposto no bundle | **Risco aceito** para app interno/fechado (OI-055) | reavaliar se app virar externo |
| Componentes < 500 linhas | **Parcialmente resolvido** (`LoadingSmart` 672 após Onda 1B; `WarRoom` 279 após Onda 1C; CRMDetail removido com Mini CRM local) | Sprint 11 |

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
| `features/radar/` (runtime) | Sprint 10 | Sprint 8 stub | hook/service movidos + imports novos via barrel + guardrail arquitetural |
| Validacao Zod em `[[PORTA_*]]` | Sprint 6 | `prompts/mega/contracts.ts` | 3 cenarios de alucinacao passam |
| `constants/market-intelligence.ts` | Sprint 7 (antes de `constants/app.ts`) | Nenhuma | Nenhuma constante de UI regride |
