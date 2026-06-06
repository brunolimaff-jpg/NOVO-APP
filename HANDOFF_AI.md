# Handoff — Investigação Freeze Intermitente Pós-Waterfall + PR #345

**Branch atual:** `fix/diagnostic-render-freeze` (6 commits apos `main` em `8526982f`)
**PR #345:** ABERTA em `fix/static-fallback-layout-collapse` (CSS fix, validada)

## Estado Atual

| Item                               | Status                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| PR #344 truncamento dossiê         | MERGEADA em main (`8526982f`)                                                          |
| Foundation Cache Produção          | HABILITADO (`GEMINI_FOUNDATION_CACHE_ENABLED`, `VITE_GEMINI_FOUNDATION_CACHE_ENABLED`) |
| PR #345 CSS static fallback        | ABERTA, validada (2/2 manual SUCESSO, Playwright inconclusivo)                         |
| Freeze intermitente                | INVESTIGANDO — branch `fix/diagnostic-render-freeze`                                   |
| Requisição órfã continuityQuestion | NÃO CORRIGIDO (fetch sem AbortController após timeout)                                 |

## O que foi feito

1. **PR #344 mergeada** (`8526982f`): truncamento frontend de dossiê — preview 3 secoes + "Ver relatorio completo". 7 arquivos alterados.
2. **Foundation Cache habilitado em producao** como mitigacao de latencia Gemini (reduz chance de timeout/abort que contribui para o freeze).
3. **PR #345 criada e validada**: fix CSS do static fallback — `absolute inset-0` revertido para `flex-1 min-h-0 w-full`. Regressao introduzida na PR #343. 2 execucoes manuais SUCESSO. 2 Playwright INCONCLUSIVAS (browser congelou — provavelmente o mesmo bug intermitente). E2E Critical Browser e falha pre-existente.
4. **Branch `fix/diagnostic-render-freeze` criada**: instrumentacao com `performance.mark()` + `console.info()` + `PerformanceObserver(longtask)` + watchdog heartbeat + render storm detector em:
   - `utils/freezeDiag.ts` — modulo central (m, mQuiet, installLongTaskObserver, watchdogHeartbeat, rc)
   - `utils/finalizeWaterfallUI.ts` — 2 marks (before/after setIsLoading) + observers
   - `features/chat/message-orchestrator.ts` — 3 marks (finally:start, before-setState, after-setState)
   - `components/MarkdownRenderer.tsx` — marks por secao (renderer:start, processedContent, renderer:return)
   - `components/SectionalBotMessage.tsx` — rc() + after-parse + commit tracking + secao individual
   - `components/chat/MessageTimeline.tsx` — rc() + render mark
5. **Execucao diagnostica no preview**: sessao saudavel com static fallback 1502x526, bot 1423x7925 — sem congelamento. Intermitencia nao reproduzida.

## Causa raiz do freeze (hipotese)

Mesmo mecanismo da **Camada 5** (PR #343): bloqueio da main thread durante React re-render apos `setIsLoading(false)`.

Diferenca: o timeout de 60s do `setTimeout(() => setIsLoading(false), 60000)` expira, mas o React re-render que processa as ~8k+ chars de markdown por secao no `react-markdown` (sincrono) nunca termina de commitar. Evidencias:

- `post-render-scheduled` ocorreu (finally block completou)
- `post-render-fired` NUNCA ocorreu (setTimeout nunca executou)
- DOM permaneceu em 93% + botao Interromper (React nunca commitou)
- Comentario no codigo (message-orchestrator.ts:653) confirma que `setIsLoading(false)` dispara render sincrono que pode travar

**Trigger:** provavelmente react-markdown processando sessoes grandes (~8k chars) em unico bloco sincrono na main thread.

## Arquivos alterados (vs main)

| Arquivo                                                     | Tipo     | Mudanca                                                                              |
| ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `utils/freezeDiag.ts`                                       | NOVO     | Modulo de diagnostico: performance.mark, longtask observer, watchdog, render counter |
| `utils/finalizeWaterfallUI.ts`                              | ALTERADO | Adiciona marks [FreezeDiag] + observers                                              |
| `utils/layoutTraceTelemetry.ts`                             | ALTERADO | Ajuste (PR #344)                                                                     |
| `features/chat/message-orchestrator.ts`                     | ALTERADO | 3 marks [FreezeDiag] no finally                                                      |
| `components/MarkdownRenderer.tsx`                           | ALTERADO | Marks por secao renderizada                                                          |
| `components/SectionalBotMessage.tsx`                        | ALTERADO | rc() + after-parse + commit + secao marks                                            |
| `components/chat/MessageTimeline.tsx`                       | ALTERADO | rc() + render mark                                                                   |
| `services/gemini/auxiliary.ts`                              | ALTERADO | Apenas formatting (chaves)                                                           |
| `tests/fixtures/scheffer-healthy-markdown.md`               | NOVO     | Fixture de baseline saudavel                                                         |
| `tests/components/MessageTimeline.static-fallback.test.tsx` | NOVO     | Testes do fix CSS PR #345                                                            |
| `.agents/memory/*`                                          | ALTERADO | Atualizado                                                                           |
| `CALIBER_LEARNINGS.md`                                      | ALTERADO | Atualizado                                                                           |
| `docs/handoffs/*`                                           | ALTERADO | Handoffs anteriores                                                                  |

## Decisoes ativas (novas)

1. Foundation Cache habilitado em producao — reduz latencia Gemini como mitigacao
2. `freezeDiag.ts` e TEMPORARIO — deve ser removido ou condicionado a flag antes de PR
3. PR #345 deve ser mergeada (fix CSS e correto, mas nao suficiente para o freeze)

## Pendencias

| Item                               | Status        | Proximo passo                                                       |
| ---------------------------------- | ------------- | ------------------------------------------------------------------- |
| Freeze intermitente                | INVESTIGANDO  | Reproduzir com [FreezeDiag] ativo para capturar a secao/bloco exato |
| PR #345 merge                      | VALIDADA      | Decidir merge (fix CSS necessario mas nao suficiente)               |
| Requisicao orfa continuityQuestion | NAO CORRIGIDO | Adicionar AbortController ao fetch apos timeout                     |
| Instrumentacao freezeDiag          | TEMPORARIA    | Remover ou condicionar a flag `__DEV__` antes de PR                 |
| Foundation Cache null name         | INVESTIGAR    | Bug separado: foundationCacheName null em producao                  |

## Proximo passo exato

1. Reproduzir o freeze com `[FreezeDiag]` ativo — identificar qual secao/bloco do react-markdown bloqueia
2. Merge PR #345
3. Decidir se accordion + renderizacao progressiva e a solucao definitiva
4. Limpar instrumentacao diagnostica antes de PR da branch `fix/diagnostic-render-freeze`

## Links

- PR #344: https://github.com/brunolimaff-jpg/NOVO-APP/pull/344
- PR #345: https://github.com/brunolimaff-jpg/NOVO-APP/pull/345 (ABERTA)
- Vault sessoes: `Bruno Vault/20-SESSOES/2026-06/2026-06-06T10-00-00-NOVO-APP-freeze-investigacao-diag.md`
