---
grok_wiki: false
title: 'Sistema de Etapas de Loading'
id: page-loading-stages
description: 'Arquitetura do sistema de etapas de loading, contador global vs. por etapa, waterfall de etapas e estados de transicao'
sourceFiles:
  - constants/loadingStages.ts
  - components/ChatInterface.tsx
  - hooks/chat/useStaticTimelineFallback.ts
  - hooks/chat/useInvestigation.ts
  - utils/loadingStatus.ts
  - components/LoadingSmart.tsx
---

# Sistema de Etapas de Loading

## Visao geral

O NOVO-APP usa um sistema de etapas (stages) para comunicar visualmente o progresso da investigacao ao usuario. Cada etapa representa uma fase da pipeline de dossie, exibida no componente `LoadingSmart.tsx` como uma sequencia de passos.

## Contador de etapas

### Arquitetura

O contador vive no `ChatInterface.tsx` e gerencia:

- `completedStages`: array de etapas ja concluidas
- `currentStage`: etapa atual em execucao
- `isLoading`: booleano que controla visibilidade do loading

### Bug corrigido: Contador global vs. por etapa

**Problema:** `resetLoadingProgress` usava `completedStages: []`, descartando completamente o estado anterior. Isso fazia com que:
- A etapa inicial fosse perdida sempre que um novo ciclo de loading comecava
- O tempo entre inicio do loading e primeira etapa do waterfall nao era atribuido a nenhuma etapa
- Visualmente, as etapas "pulavam" — sumiam e reapareciam

**Solucao:** `resetLoadingProgress` agora preserva a etapa anterior como concluida:

```
Antes: completedStages: []  (descarta tudo)
Depois: completedStages: [etapaAnterior]  (preserva ultima etapa)
```

O tempo entre o inicio do loading e a primeira etapa do waterfall e atribuido a etapa "Iniciando analise".

### Efeito no useStaticTimelineFallback

O hook `useStaticTimelineFallback` contem um guard `if (isLoading) return` no Efeito #5 para prevenir que o fallback estatico seja ativado durante o loading inline. Isso evita que as etapas de loading sejam interrompidas pelo watchdog.

## Pipeline de etapas

O fluxo completo de etapas e definido em `constants/loadingStages.ts` e orquestrado pelo `waterfall-orchestrator.ts`:

1. **Iniciando analise** — preparacao, lookup CNPJ
2. **Buscando dados cadastrais** — Brasil API, dados publicos
3. **Analisando porte e operacao** — modulo PORTA
4. **Investigando mercado** — pesquisa web, noticias
5. **Mapeando estrutura societaria** — teia societaria
6. **Analisando concorrencia** — benchmarking
7. **Gerando recomendacoes** — sintese final
8. **Finalizando** — consolidacao e salvamento

Cada etapa pode ter subtarefas que sao executadas em paralelo dentro do waterfall.

## Estados de transicao

| Estado | Descricao | Componente |
|--------|-----------|------------|
| `idle` | Aguardando acao do usuario | GreetingWelcomeScreen |
| `loading` | Investigacao em andamento | LoadingSmart + MessageTimeline |
| `streaming` | Resposta sendo gerada | MessageTimeline (bot message) |
| `complete` | Investigacao concluida | MessageTimeline (mensagens finais) |
| `error` | Erro na investigacao | ErrorMessageCard |

## Loading inline

O loading inline (introduzido na PR #353) substituiu o overlay fullscreen. Durante o loading inline:

- O `LoadingSmart` ainda e exibido, mas como parte do fluxo de mensagens
- O `MessageTimeline` continua visivel com mensagens anteriores
- Novas mensagens sao adicionadas a timeline conforme cada etapa e concluida
- O watchdog `useStaticTimelineFallback` fica inibido (`if (isLoading) return`)

## Referencias

- `constants/loadingStages.ts` — definicao das etapas
- `components/LoadingSmart.tsx` — componente visual de progresso
- `utils/loadingStatus.ts` — estados de loading
- `hooks/chat/useStaticTimelineFallback.ts` — watchdog de timeline
- `features/dossier/waterfall-orchestrator.ts` — pipeline de dossie
- `docs/wiki/pages/29-chatinterface-refactor.md` — arquitetura dos hooks
