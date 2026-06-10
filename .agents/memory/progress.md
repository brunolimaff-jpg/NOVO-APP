# Progress

Last updated: 2026-06-10 — ChatInterface refatorada, infraestrutura anti-god-component

## Timeline

### 2026-06-10

- **PR #359** (merge `ccf49eb`): ChatInterface refactoring completo
  - Extraiu 6 hooks (useChatTheme, usePanelState, useInvestigation, useChatActions, useStaticTimelineFallback)
  - 1 util (promptResolvers)
  - Removeu `hasLargeBotMessage` (dupla fonte de verdade)
  - 811 -> 331 linhas (-59%)
- **28 testes TDD:** useStaticTimelineFallback.test.ts
- **3 bugs corrigidos:** forceStaticTimelineFallback loading guard, contador de etapas, operatorName null safety
- **Infraestrutura anti-god-component:** 8 regras no CLAUDE.md, skill prevent-god-component, script component-health.sh, tracking god-component-debt.json
- **Decisao arquitetural:** Limite de props expandido para 14 (complexos: 8)
- **Copiloto:** Passo 7 do copiloto-memory.md inclui leitura de wiki e ai-context
