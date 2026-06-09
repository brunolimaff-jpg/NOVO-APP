# Handoff Histórico — Auditoria Visual e Consolidação da Wiki

**Data:** 2026-06-08
**Branch:** `docs/wiki-auditoria-final`
**Base:** `origin/main` (cbffab54)
**PR:** [#350](https://github.com/brunolimaff-jpg/NOVO-APP/pull/350)

---

## Contexto

Após a conclusão das PRs #347 (safety net display:none), #348 (docs) e #349 (RAF safety net + LoadingStuckProbes), uma auditoria completa foi executada para verificar se o handoff visual pós-waterfall ainda continha bugs ativos.

Paralelamente, a Wiki técnica do projeto foi gerada pelo Grok Wiki (28 páginas) e precisava ser versionada.

---

## Metodologia da Auditoria

Sete exploradores independentes foram disparados em paralelo, cada um com território específico:

| # | Território | Arquivos |
|---|-----------|---------| 
| 1 | Wiki e drift documental | docs/wiki/*, HANDOFF_AI.md, CALIBER_LEARNINGS.md, .agents/memory/* |
| 2 | Estado global e ciclo de loading | chatStore, loading-progress, loadingVariant, finalizeWaterfallUI, App.tsx |
| 3 | Orquestração assíncrona | message-orchestrator, waterfall-orchestrator, waterfall-guard, services/gemini/* |
| 4 | Renderização e geometria | ChatInterface, LoadingSmart, ChatShell, MessageTimeline, Composer, MessageRow |
| 5 | Observabilidade e safety nets | diagnosticLog, blankPanelTelemetry, layoutTraceTelemetry, finalizeWaterfallUI |
| 6 | Testes e contratos | tests/, tests-e2e/ (22 arquivos relevantes) |
| 7 | Busca transversal de riscos | grep em 12 padrões por todo o repositório |

Cada explorador retornou resultados estruturados, que foram consolidados pelo coordenador.

---

## Resultado da Primeira Passagem

Foram identificados 7 achados que pareciam graves:

1. **BUG-01 (P0):** Static fallback invisível (display:none)
2. **BUG-02 (P2):** `showEmptyStateFallback` dead code
3. **PROV-01 (P1):** `saveDossier` fire-and-forget após sessão deletada
4. **PROV-02 (P2):** `setTimeout` sem cleanup em `finalizeWaterfallUI`
5. **RISCO-01 (P2):** Janela overlay → viewport suspenso → conteúdo
6. **RISCO-02 (P2):** `handleStopGeneration` não limpar loading
7. **RISCO-03 (P3):** `setTimeout` sem cleanup em `printExport`

---

## Validação Adversarial

Uma segunda rodada reconstruiu as cadeias alcançáveis e refutou 6 dos 7 achados:

| Achado | Resultado | Motivo |
|--------|----------|--------|
| BUG-01 | **Mantido (reclassificado)** | Incidente mitigado, recovery funcional, sem reincidência. Reclassificado de P0 ativo para P1 monitorado. |
| BUG-02 | **Mantido (reclassificado)** | Código morto, não bug. P3. |
| PROV-01 | **Refutado** | Zero listeners de `dossier:completed`. Evento inócuo. |
| PROV-02 | **Refutado** | Timer é puramente diagnóstico. Snapshot read-only e null-safe. |
| RISCO-01 | **Refutado** | Overlay e suspensão usam o mesmo gate. Ambos mudam no mesmo render. |
| RISCO-02 | **Refutado** | Bloco `if (isLoading)` é independente do `activeBotId` — sempre executa. |
| RISCO-03 | **Dívida P3** | Mantido como dívida menor, sem impacto funcional. |

---

## Estado Atual do Incidente display:none

| Dimensão | Situação |
|----------|----------|
| Observado | Sim — sessão `ac5890b0` (pré-PR #347) |
| Recovery funcional | Sim — `none → block !important` |
| Reincidência pós-PR #347 | Nenhuma registrada |
| Causa raiz | Aberta — MutationObserver não capturou |
| Severidade atual | P1 (monitorado) |
| Ação imediata | Nenhuma — monitorar produção |

---

## Decisão Final

**MONITORAR PRODUÇÃO. Não implementar correção funcional sem reincidência ou evidência objetiva.**

Gatilhos de reabertura registrados no HANDOFF_AI.md.

---

## Escopo Desta PR

Esta PR é exclusivamente documental:

- ✅ Versiona a Wiki técnica (docs/wiki/, 28 páginas)
- ✅ Atualiza o README.md com navegação para documentação
- ✅ Atualiza o HANDOFF_AI.md com conclusões da auditoria
- ✅ Atualiza o CALIBER_LEARNINGS.md com lições da auditoria
- ✅ Atualiza as memórias duráveis (.agents/memory/*)
- ✅ Cria este handoff histórico

Não inclui:
- ❌ Alterações de runtime
- ❌ Migrations ou tracking de custo
- ❌ Testes funcionais
- ❌ Instrumentação adicional
- ❌ Arquivos locais (.mcp.json, .superpowers/)
