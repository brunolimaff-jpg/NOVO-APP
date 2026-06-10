# Handoff — ChatInterface Refactored (PR #359)

- **PR #359** (merge `ccf49eb`): ChatInterface refactoring — extraiu 6 hooks, removeu dupla fonte de verdade
- **Branch de trabalho:** `fix+chatinterface-refactor` (worktree)
- **Projeto ativo:** NOVO-APP (Senior Scout 360)
- **Status:** MERGEADO — componente saudavel, monitoramento passivo

---

## Entrada rapida para proximo agente

1. Este arquivo (resumo executivo e estado do componente)
2. `.agents/memory/activeContext.md` — estado detalhado
3. `.agents/memory/decisions.md` — decisoes ativas
4. `docs/wiki/pages/29-chatinterface-refactor.md` — arquitetura resultante
5. `docs/wiki/pages/30-loading-stages.md` — sistema de etapas de loading
6. `docs/ai-context/refactor/02-BOARD.md` — board de refatoracao

---

## O que foi feito — PR #359

### ChatInterface.tsx: 811 -> 331 linhas (-59%)

Extracao de 6 hooks e 1 util:

| Hook | Responsabilidade | Linhas |
|------|-----------------|--------|
| `useChatTheme` | Tema (dark/light), classes CSS, debug mode | 24 |
| `usePanelState` | Painel de contexto (operador, sessao, abrir/fechar painel lateral) | 48 |
| `useInvestigation` | Disparo de investigacao, callback de sucesso, controle de loading | 63 |
| `useChatActions` | Acoes de chat (nova investigacao, nova pesquisa, follow-up) | 83 |
| `useStaticTimelineFallback` | Watchdog de timeline estatica, consolidacao de dupla fonte de verdade | 111 |
| `promptResolvers` (util) | Resolucao de prompts por tipo de mensagem, resolucao de etapa | 44 |

### 28 testes novos (TDD)

- `tests/hooks/useStaticTimelineFallback.test.ts` — 6 blocos de teste
- Cobre: watchdogs, fontes de verdade, efeitos colaterais, cleanup, estados de loading

### Mudancas estruturais

- `MessageTimeline.tsx`: removeu `hasLargeBotMessage` (era dupla fonte de verdade duplicada com ChatInterface)
- `ChatInterface.tsx`: dupla fonte de verdade UNSHIFTED — consolidada no `useStaticTimelineFallback`
- `useStaticTimelineFallback`: hook unico de watchdog, contem Efeito #5 (antigo `forceStaticTimelineFallback`) e `showEmptyStateFallback`

### Infraestrutura anti-god-component criada

- 8 regras no CLAUDE.md contra god components
- Skill `prevent-god-component` (carregada automaticamente ao editar TSX)
- Script `component-health.sh` — dashboard de saude de componentes
- `GOD_COMPONENT_SKIP`: max 3 por arquivo, tracking persistente
- `.claude/god-component-debt.json` — divida tecnica rastreada

---

## Bugs corrigidos durante a sessao

### Bug 1: forceStaticTimelineFallback proativo durante loading

- **Sintoma:** etapas de loading "pulavam" — o fallback estatico ativava durante o loading inline
- **Causa:** Efeito #5 (`forceStaticTimelineFallback`) nao tinha guard `if (isLoading) return`
- **Correcao:** adicionado guard `if (isLoading) return` no inicio do Efeito #5 do `useStaticTimelineFallback`
- **Testado:** TDD validou que fallback nao ativa durante loading inline

### Bug 2: Contador global vs. por etapa no loading

- **Sintoma:** `resetLoadingProgress` descartava a etapa inicial com `completedStages: []`
- **Causa:** o contador de etapas era global, nao preservava estado anterior
- **Correcao:** `resetLoadingProgress` agora preserva a etapa anterior como concluida. O tempo entre inicio do loading e primeira etapa do waterfall e atribuido a etapa "Iniciando analise"
- **Testado:** TDD validou progresso correto por etapa

### Bug 3: operatorName null safety

- **Sintoma:** potencial crash com `operatorName` null/undefined
- **Causa:** `usePanelState` nao protegia contra valores nulos
- **Correcao:** adicionado `(operatorName || '')` no hook
- **Origem:** reportado pelo Gemini Code Assist

---

## Decisoes arquiteturais ativas

### DI-2026-06-10-01: Dupla fonte de verdade eliminada

- **Decisao:** `hasLargeBotMessage` removido de `MessageTimeline.tsx` — agora so `useStaticTimelineFallback` controla estado de fallback
- **Motivo:** Watchdog duplicado causava comportamento imprevisivel e bugs de renderizacao
- **Impacto:** Um unico ponto de verdade para decisao de fallback

### DI-2026-06-10-02: Limite de props ajustado (8 -> 14)

- **Decisao:** Componentes complexos podem ter ate 14 props, complexos ate 8
- **Motivo:** ChatInterface tinha 9+ props naturais devido a natureza do componente. Limite de 8 era artificial e forcava agrupamentos contra-intuitivos
- **Excecao:** `GOD_COMPONENT_SKIP` com tracking no `god-component-debt.json`

### DI-2026-06-10-03: Watchdogs consolidados em hook unico

- **Decisao:** `useStaticTimelineFallback` contem todos os watchdogs de timeline (Efeito #5 antes espalhado)
- **Motivo:** Antes o watchdog `forceStaticTimelineFallback` estava no ChatInterface e `hasLargeBotMessage` no MessageTimeline — dois lugares, duas logicas
- **Impacto:** 3 watchdogs consolidados em 1 hook, testados em TDD

### DI-2026-06-10-04: Copiloto deve referenciar wiki e ai-context

- **Decisao:** Passo 7 do copiloto-memory.md agora inclui leitura de wiki e ai-context ao iniciar sessao
- **Motivo:** Sessao atual mostrou que wiki e docs/ai-context/ sao essenciais para contexto completo
- **Impacto:** Todo handoff de encerramento de sessao deve atualizar wiki (passo 5)

---

## Arquivos alterados (PR #359)

| Arquivo | Mudanca | Status |
|---------|---------|--------|
| `components/ChatInterface.tsx` | 811 -> 331 linhas, extraiu 6 hooks | MERGED |
| `components/chat/MessageTimeline.tsx` | Removeu `hasLargeBotMessage` (dupla fonte) | MERGED |
| `hooks/chat/useChatTheme.ts` | Novo hook | MERGED |
| `hooks/chat/usePanelState.ts` | Novo hook + fix operatorName null safety | MERGED |
| `hooks/chat/useInvestigation.ts` | Novo hook | MERGED |
| `hooks/chat/useChatActions.ts` | Novo hook | MERGED |
| `hooks/chat/useStaticTimelineFallback.ts` | Novo hook + guard de loading | MERGED |
| `hooks/chat/promptResolvers.ts` | Nova util | MERGED |
| `tests/hooks/useStaticTimelineFallback.test.ts` | 28 testes TDD | MERGED |

---

## Prompt de retomada

```text
▎ Retome a sessao no NOVO-APP a partir de main.
▎ PR #359 mergeada: ChatInterface refatorada (811->331 linhas, -59%).
▎ 6 hooks extraidos, dupla fonte de verdade eliminada.
▎ 28 testes TDD em useStaticTimelineFallback.test.ts.
▎ 3 bugs corrigidos: loading proativo, contador de etapas, null safety.
▎ Infraestrutura anti-god-component criada (8 regras, skill, tracking).
▎ Proximo passo: revisar wiki e ai-context no inicio de cada sessao.
▎ Ver docs/wiki/pages/29-chatinterface-refactor.md para arquitetura.
```
