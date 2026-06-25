# Handoff — Sessao 2026-06-25: Auditoria P0 + Validacao Cruzada

**Atualizado:** 2026-06-25
**Branch:** `feat/litellm-experiment` (PR #386 ja mergeada na main)
**PR:** Nenhuma aberta (PR #387 fechada — era duplicata de teste)

---

## ESTADO ATUAL

### PR #387 fechada

PR `feat/litellm-experiment-code-review` (#387) era copia de teste da PR #386 para code review automatizado. Fechada com comentario. PR #386 ja estava mergeada na main desde 25-jun.

### Auditoria externa — 3 arquivos analisados

Auditoria read-only feita por terceiro contra ZIP do repo. Resultados em:

- `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/RELATORIO_AUDITORIA_NOVO_APP.md` (88KB)
- `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/INCIDENTE_P0_UI_PRESA.md` (52KB)
- `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/TESTE_PREVIEW_P0.md` (38KB)
- `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/p0-evidence/` (6 screenshots + console log)

### P0 Bug confirmado: UI congela apos waterfall completar

**Sintoma:** Dossie gerado com sucesso (83KB, 6/6 modulos, `waterfallEndStatus: completed`) mas UI permanentemente congelada em loading. InlineBubble visivel, composer disabled, botao Interromper visivel. Main thread bloqueada — CDP `Runtime.evaluate` timeout 5+ minutos.

**Causa raiz (3 camadas):**

1. Render sincrono de 83KB markdown via `react-markdown` bloqueia main thread
2. `tryDispatchCofreReady` gated em `isBotMessageContentVisible()` retorna false (React nao commitou re-render)
3. `generationKind` nao resetado para dossier success (`message-orchestrator.ts:737-739` pula)

**Evidencia:** Reproduzido no preview Vercel real. Console log em `p0-evidence/final-console.txt`. Screenshots mostram estado congelado.

### Validacao cruzada: Auditoria vs Codigo Real

Fiz cross-reference de cada achado da auditoria com o codigo real em `main`. Resultado:

**5 Divergencias Graves (auditoria referencia codigo que nao existe):**

| #   | Auditoria diz                                        | Codigo real                                                                |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | `handleCofreForceReleaseLoading` em App.tsx:154-159  | NAO EXISTE no repo inteiro                                                 |
| 2   | `handleCofreHidden` em App.tsx:150-152               | So existe na worktree `feat+fase-d-ci-quality-gates`                       |
| 3   | `flushWaterfallPreviewToStore` tem parametro `force` | Assinatura real: `(previewText: string)` — sem `force`                     |
| 4   | `useDeferredValue` "causa expansao quebrada"         | `useDeferredValue` NUNCA foi implementado — o que existe e `useTransition` |
| 5   | `console.time('parseMarkdownSections')` no codigo    | Nao existe no codigo atual                                                 |

**Hipotese:** Auditor analisou codigo da worktree `feat+fase-d-ci-quality-gates`, nao do `main`.

**8 Achados confirmados:**

- `setGenerationKind(null)` condicional — pula dossier success ✅
- `flushWaterfallPreviewToStore` sempre `isThinking: true` ✅
- `tryDispatchCofreReady` gate: `isBotMessageContentVisible()` sem check de `waterfall-thinking-preview` ✅
- `useDeferredValue` ausente no SectionalBotMessage ✅
- Waterfall sequencial (docs dizem paralelo) ✅
- `isFallbackEnabled()` hardcoded `false` ✅
- `data-testid="bot-message-content"` emitido por MessageRow.tsx:303 (nao SectionalBotMessage) ✅
- `finalizeWaterfallUI` ja tem polling 300ms × 40 tentativas ✅

---

## PLANO DE EXECUCAO (aprovado pelo reviewer)

```
FASE 0 — CONTRATOS (~2h)
├── 9 testes do auditor (contratos + unitarios)
├── +2 testes do freeze P0:
│   ├── tests/contracts/sectional-bot-message-large-input.contract.test.tsx
│   └── tests/features/dossier/waterfall-ui-finalize.contract.test.ts
├── Objetivo: failing-first — reproduzir bugs ANTES de corrigir
└── ZERO mudanca em codigo de producao

FASE 0.5 — CORRECAO P0 FREEZE (~3h)
├── Patch 1: waterfall-orchestrator.ts — pushWaterfallPreviewToStore(force:true)
│   seta isThinking:false e loadingVariant:undefined
├── Patch 2: message-orchestrator.ts — setGenerationKind(null) incondicional
│   + protecao: verificar se Cofre visivel antes de resetar
├── Patch 3: finalizeWaterfallUI.ts — tryDispatchCofreReady aceita
│   waterfall-thinking-preview OU bot-message-content
├── Patch 4: SectionalBotMessage.tsx — useDeferredValue para >10KB
│   + fallback com data-testid="bot-message-content" data-deferred="true"
└── SEM patch handleCofreForceReleaseLoading (nao existe)

FASE 1 → 5: Conforme auditoria original
```

### 3 Riscos adicionais encontrados pelo reviewer:

1. **Corrida `updateSessionById` vs `finalizeWaterfallUI`**: Zustand sincrono dispara 2 re-renders independentes. React pode commitar `isThinking:false` antes de `isLoading:false`, iniciando render sincrono de 83KB antes do RAF do `tryDispatchCofreReady`.

2. **Cofre dependency unica em `generationKind === 'dossier'`**: `useCofreTransition.ts:83` so entra quando `generationKind === 'dossier'`. Se Patch 2 resetar cedo demais, Cofre dissolve antes do dossier aparecer → tela branca.

3. **`isCofreRenderReady` leniente vs `isBotMessageContentVisible` estrita**: Duas funcoes com mesmo proposito — uma usada (`finalizeWaterfallUI.ts:120`), outra ignorada (`cofreLifecycle.ts:33-51`).

---

## O QUE NAO FUNCIONOU

1. **Auditoria usou base de codigo errada**: 3 funcoes referenciadas (handleCofreForceReleaseLoading, handleCofreHidden, flushWaterfallPreviewToStore com force) nao existem em main. Provavelmente analisou worktree `feat+fase-d-ci-quality-gates`.

2. **Plano original de 5 patches**: Patch 3 (handleCofreForceReleaseLoading) e inviavel — funcao nao existe. Precisa ser removido do plano.

3. **Patch 1 mal direcionado**: Auditoria referencia `flushWaterfallPreviewToStore` com parametro `force`, mas a funcao correta para o fix e `pushWaterfallPreviewToStore` (que tem o parametro `force`).

---

## ARQUIVOS DE REFERENCIA

| Arquivo                  | Localizacao                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| Relatorio auditoria      | `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/RELATORIO_AUDITORIA_NOVO_APP.md` |
| Incidente P0             | `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/INCIDENTE_P0_UI_PRESA.md`        |
| Teste preview P0         | `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/TESTE_PREVIEW_P0.md`             |
| Evidencias (screenshots) | `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/p0-evidence/`                    |
| Console log (48 linhas)  | `~/Downloads/workspace-e04d0c1e-679b-4408-ad5c-e2f5d292f9f2/audit/p0-evidence/final-console.txt`   |
| Memoria ativa            | `.agents/memory/activeContext.md`                                                                  |
| Decisoes                 | `.agents/memory/decisions.md`                                                                      |
| Progresso                | `.agents/memory/progress.md`                                                                       |
| Aprendizados             | `CALIBER_LEARNINGS.md`                                                                             |

---

## PROXIMA SESSAO

1. Ler este HANDOFF
2. Rodar Fase 0: criar 11 testes failing-first (zero mudanca em producao)
3. Validar que testes reproduzem bugs
4. Fase 0.5: 4 patches cirurgicos
5. `npm test && npm run typecheck && npm run build`

**NAO fazer:** refatorar god components, mexer em modelo/LLM/router/Supabase/prompts, criar branch nova sem avisar.
