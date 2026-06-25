---
type: session
tags:
  - refactor
  - chatinterface
  - god-component
  - hooks
  - tdd
---

# Sessao: Refatoracao do ChatInterface — PR #359

**Data:** 2026-06-10
**Branch:** `fix+chatinterface-refactor` (worktree)
**PR:** [#359](https://github.com/brunolimaff-jpg/NOVO-APP/pull/359) — merge `ccf49eb`
**Duracao:** Sessao completa de refatoracao + TDD

---

## Resumo

O `ChatInterface.tsx` foi reduzido de **811 para 331 linhas** (-59%). Seis hooks foram extraidos, uma dupla fonte de verdade foi eliminada, e 28 testes TDD foram criados para o watchdog de timeline.

---

## O que foi feito

### Extracao de hooks

| Hook                        | Arquivo                                   | Linhas |
| --------------------------- | ----------------------------------------- | ------ |
| `useChatTheme`              | `hooks/chat/useChatTheme.ts`              | 24     |
| `usePanelState`             | `hooks/chat/usePanelState.ts`             | 48     |
| `useInvestigation`          | `hooks/chat/useInvestigation.ts`          | 63     |
| `useChatActions`            | `hooks/chat/useChatActions.ts`            | 83     |
| `useStaticTimelineFallback` | `hooks/chat/useStaticTimelineFallback.ts` | 111    |
| `promptResolvers` (util)    | `hooks/chat/promptResolvers.ts`           | 44     |

### Dupla fonte de verdade eliminada

- `hasLargeBotMessage` removido de `MessageTimeline.tsx`
- `useStaticTimelineFallback` e agora o unico watchdog
- Antes: ChatInterface calculava e passava como prop, MessageTimeline tinha logica propria

### 28 testes TDD

- `tests/hooks/useStaticTimelineFallback.test.ts`
- 6 blocos de teste cobrindo watchdogs, fontes de verdade, efeitos colaterais, cleanup, estados de loading

---

## Bugs corrigidos

| Bug                                   | Causa                                    | Correcao                                |
| ------------------------------------- | ---------------------------------------- | --------------------------------------- | --- | ---- |
| Fallback estatico durante loading     | Efeito #5 sem guard `isLoading`          | Adicionado `if (isLoading) return`      |
| Contador de etapas descartando inicio | `resetLoadingProgress` usava `[]`        | Preservar etapa anterior como concluida |
| operatorName null safety              | `usePanelState` nao protegia contra null | Adicionado `(operatorName               |     | '')` |

---

## Infraestrutura criada

- **8 regras** anti-god-component no `CLAUDE.md`
- **Skill `prevent-god-component`** — carregada automaticamente ao editar `.tsx`
- **Script `component-health.sh`** — dashboard de saude
- **Tracking `god-component-debt.json`** — divida tecnica rastreada
- **GOD_COMPONENT_SKIP:** max 3 por arquivo

---

## Decisoes tomadas

1. **Dupla fonte de verdade eliminada** (DI-2026-06-10-01) — `hasLargeBotMessage` removido
2. **Limite de props ajustado** (DI-2026-06-10-02) — 14 para componentes complexos, 8 para complexos
3. **Watchdogs consolidados** (DI-2026-06-10-03) — hook unico `useStaticTimelineFallback`
4. **Copiloto referencia wiki e ai-context** (DI-2026-06-10-04) — passo 7 do copiloto-memory.md

---

## Licoes aprendidas

| #   | Licao                                                              | Anti-padrao                                                                        | Onde aplicar                                                                       |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | **Extrair hooks antes de criar testes para o componente original** | Tentar testar god component e mais dificil que testar hooks extraidos isoladamente | Toda extracao de hook deve vir com TDD do hook, nao do componente original         |
| 2   | **Dupla fonte de verdade entre pai e filho e fragil**              | Componente filho tinha logica duplicada do pai para decidir fallback               | Um unico hook de watchdog. Nao duplicar estado entre pai e filho                   |
| 3   | **Guard de loading em watchdogs previne regressao visual**         | Watchdog sem `if(isLoading)return` ativava fallback durante loading inline         | Todo efeito colateral que modifica estado visual deve verificar se esta em loading |
| 4   | **Reset de estado deve preservar contexto anterior**               | `resetLoadingProgress` com `[]` descartava etapa inicial                           | Reset deve preservar ultimo estado conhecido como concluido                        |
| 5   | **Checkpoints proativos nao seguidos geram retrabalho**            | CHECKPOINT 1-2-3 do copiloto-proativo.md nao foram seguidos nesta sessao           | Seguir checkpoints para evitar acumulo de mudancas nao verificadas                 |

---

## Arquivos alterados

- `components/ChatInterface.tsx` — 811 -> 331 linhas
- `components/chat/MessageTimeline.tsx` — removeu `hasLargeBotMessage`
- `hooks/chat/useChatTheme.ts` — novo
- `hooks/chat/usePanelState.ts` — novo
- `hooks/chat/useInvestigation.ts` — novo
- `hooks/chat/useChatActions.ts` — novo
- `hooks/chat/useStaticTimelineFallback.ts` — novo
- `hooks/chat/promptResolvers.ts` — novo
- `tests/hooks/useStaticTimelineFallback.test.ts` — novo (28 testes)

## Referencias

- [[ARCH-Chat-Experience]] (arquitetura do chat)
- [[LICOES-APRENDIDAS-TELA-BRANCA-PR307-2026-05-28]] (sessao anterior de watchdog)
- `docs/wiki/pages/29-chatinterface-refactor.md`
- `docs/wiki/pages/30-loading-stages.md`
- `docs/ai-context/refactor/02-BOARD.md`
