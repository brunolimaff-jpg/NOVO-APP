---
grok_wiki: false
title: 'Refatoracao do ChatInterface'
id: page-chatinterface-refactor
description: 'Extracao de hooks, eliminacao de dupla fonte de verdade, infraestrutura anti-god-component e arquitetura resultante do ChatInterface.tsx'
sourceFiles:
  - components/ChatInterface.tsx
  - components/chat/MessageTimeline.tsx
  - hooks/chat/useChatTheme.ts
  - hooks/chat/usePanelState.ts
  - hooks/chat/useInvestigation.ts
  - hooks/chat/useChatActions.ts
  - hooks/chat/useStaticTimelineFallback.ts
  - hooks/chat/promptResolvers.ts
  - CLAUDE.md
  - .claude/god-component-debt.json
  - scripts/component-health.sh
---

# Refatoracao do ChatInterface

## Resumo

O `ChatInterface.tsx` foi reduzido de **811 para 331 linhas** (-59%) na PR #359. Seis hooks foram extraidos, uma dupla fonte de verdade foi eliminada, e 28 testes TDD foram criados.

## Arquitetura resultante

O ChatInterface deixou de ser um "god component" e passou a orquestrar hooks especializados:

```
ChatInterface.tsx (331 linhas)
  ├─ useChatTheme       — tema, classes CSS, debug mode (24 linhas)
  ├─ usePanelState      — painel de contexto, operador, sessao (48 linhas)
  ├─ useInvestigation   — disparo de investigacao, callback, loading (63 linhas)
  ├─ useChatActions     — nova investigacao, nova pesquisa, follow-up (83 linhas)
  ├─ useStaticTimelineFallback — watchdog de timeline, fonte unica (111 linhas)
  └─ promptResolvers (util)   — resolucao de prompts por tipo (44 linhas)
```

### Mapa de hooks

#### useChatTheme

- **Arquivo:** `hooks/chat/useChatTheme.ts`
- **Props:** nenhuma (usa contexto global)
- **Retorno:** `chatClasses`, `debugMode`, `isDark`, `chatContainerClass`
- **Responsabilidade:** tema dark/light, classes CSS condicionais, indicacao visual de debug

#### usePanelState

- **Arquivo:** `hooks/chat/usePanelState.ts`
- **Props:** `operatorName` | `sessionId`
- **Retorno:** `session`, `operatorNameSafe`, `isContextSidebarOpen`, toggle
- **Responsabilidade:** estado do painel lateral de contexto, protecao contra null
- **Bug corrigido:** `operatorName` null safety — adicionado `|| ''`

#### useInvestigation

- **Arquivo:** `hooks/chat/useInvestigation.ts`
- **Props:** `sessionId`
- **Retorno:** `isLoading`, `handleInvestigation`, `handleInvestigationSuccess`
- **Responsabilidade:** disparo de investigacao por CNPJ/empresa, callback de sucesso, controle de estado de loading

#### useChatActions

- **Arquivo:** `hooks/chat/useChatActions.ts`
- **Props:** variadas (8-10 props)
- **Retorno:** `handleNewInvestigation`, `handleNewSearch`, `handleFollowUp`, `handleStopGeneration`
- **Responsabilidade:** acoes de chat do usuario — nova investigacao, nova pesquisa, follow-up, parar geracao
- **Nota:** hook mais denso em props

#### useStaticTimelineFallback

- **Arquivo:** `hooks/chat/useStaticTimelineFallback.ts`
- **Props:** `isLoading`, `messages`, `sessions`
- **Retorno:** `showStaticFallback`, `showEmptyStateFallback`
- **Responsabilidade:** watchdog unico de timeline estatica, contem Efeito #5 (antigo `forceStaticTimelineFallback`)
- **Efeitos:**
  1. Atualiza `showStaticFallback` quando o numero de mensagens muda
  2. Reage a mudancas de sessao (fallback estatico para sessoes sem mensagens)
  3. Previne ativacao do fallback durante loading inline (`if (isLoading) return`)
  4. Atualiza `showEmptyStateFallback` quando sessao fica vazia apos delecao

#### promptResolvers

- **Arquivo:** `hooks/chat/promptResolvers.ts`
- **Funcoes:** `resolvePromptForMessage`, `resolveLoadingStageLabel`
- **Responsabilidade:** resolver prompts de acordo com o tipo de mensagem, rotular etapas de loading

## Dupla fonte de verdade eliminada

**Problema:** `hasLargeBotMessage` existia em dois lugares:

1. `ChatInterface.tsx` — calculava e passava como prop para `MessageTimeline`
2. `MessageTimeline.tsx` — tinha logica propria de `hasLargeBotMessage` que podia divergir

**Consequencia:** Watchdog de fallback estatico podia tomar decisoes contraditorias — `ChatInterface` achava que devia mostrar fallback, `MessageTimeline` nao, ou vice-versa.

**Solucao:** Removido `hasLargeBotMessage` de `MessageTimeline.tsx`. O `useStaticTimelineFallback` hook e a unica fonte de verdade para decisao de fallback.

## Bugs corrigidos

### Bug 1: forceStaticTimelineFallback proativo durante loading

- Efeito #5 ativava `showStaticFallback = true` durante loading inline
- Adicionado guard `if (isLoading) return`
- Causava "etapas pulando" visualmente

### Bug 2: Contador global vs. por etapa

- `resetLoadingProgress` usava `completedStages: []` — descartava etapa anterior
- Agora preserva etapa anterior como concluida
- Tempo entre inicio do loading e primeira etapa do waterfall atribuido a "Iniciando analise"

### Bug 3: operatorName null safety

- `usePanelState` protege contra null/undefined
- Reportado pelo Gemini Code Assist

## Infraestrutura anti-god-component

### 8 regras no CLAUDE.md

1. Todo componente >300 linhas deve ser revisado para extracao
2. Nao criar hooks com mais de 3 responsabilidades
3. Nao duplicar estado entre pai e filho — fonte unica de verdade
4. Hooks de efeito colateral nao devem estar no componente
5. Props devem ser tipadas e documentadas
6. Logica de apresentacao separada de logica de negocios
7. useEffect cleanup obrigatorio
8. Componentes >500 linhas exigem GOD_COMPONENT_SKIP

### Skill prevent-god-component

- Carregada automaticamente ao editar arquivos `.tsx`
- Verifica tamanho do componente e sugere extracao
- Documentada em `docs/SKILLS-GOVERNANCE.md`

### Script component-health.sh

- Dashboard de saude: linhas por componente, props, hooks
- Alerta componentes acima do limite
- Uso: `bash scripts/component-health.sh`

### GOD_COMPONENT_SKIP e debt.json

- Maximo 3 GOD_COMPONENT_SKIP por arquivo
- Tracking persistente em `.claude/god-component-debt.json`
- Cada skip documenta: componente, linhas, props, motivo, data

## Metricas da refatoracao

| Metrica                 | Antes | Depois |
| ----------------------- | ----- | ------ |
| Linhas do ChatInterface | 811   | 331    |
| Hooks extraidos         | 0     | 6      |
| Utils extraidas         | 0     | 1      |
| Dupla fonte de verdade  | Sim   | Nao    |
| Testes do fallback      | 0     | 28     |
| Bugs conhecidos         | 3     | 0      |

## Proximos passos

- Nenhum patch funcional pendente
- ChatInterface pode ainda ser candidata a extracao de submissoes visuais (ex: `InvestigationShell`, `HeroLoadingOverlay`)
- Monitorar componente para novos ciclos de extracao se necessario
