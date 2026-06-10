# Active Context

Last updated: 2026-06-10 — ChatInterface refatorada (PR #359), infraestrutura anti-god-component criada

## Estado Atual

- **Status:** CHATINTERFACE REFACTORED — MERGEADO
- **PR #359:** Merge `ccf49eb` em `main`
- **Componente:** ChatInterface.tsx: 811 -> 331 linhas (-59%)
- **Hooks extraidos:** 6 (useChatTheme, usePanelState, useInvestigation, useChatActions, useStaticTimelineFallback) + 1 util (promptResolvers)
- **Bugs corrigidos:** 3 (loading proativo, contador de etapas, operatorName null safety)
- **Testes novos:** 28 (useStaticTimelineFallback TDD)
- **Infra:** Regras anti-god-component no CLAUDE.md, skill prevent-god-component, script component-health.sh

## Decisoes recentes

- **Dupla fonte de verdade eliminada:** `hasLargeBotMessage` removido de MessageTimeline
- **Watchdogs consolidados:** `useStaticTimelineFallback` contem todos os watchdogs
- **Limite de props:** 14 para componentes complexos, 8 para complexos
- **Copiloto:** Agora referencia wiki e ai-context ao iniciar sessao (passo 7 do copiloto-memory.md)

## Proximos passos

1. Revisar wiki e ai-context no inicio de cada sessao de codigo
2. Nenhum patch funcional pendente — componente saudavel
3. Continuar monitorando ChatInterface para novos ciclos de extracao se necessario
