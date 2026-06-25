# Handoff — Sessao 2026-06-25: Experimento Haiku + Remocao Cofre + Bug Fixes UI

**Atualizado:** 2026-06-25
**Branch:** `feat/litellm-experiment`
**PR:** Nenhuma aberta

---

## ESTADO ATUAL

### 3 experimentos de modelo realizados

| Experimento | Modulos | Score | Custo | Chars | Resultado |
|-------------|---------|-------|-------|-------|-----------|
| DeepSeek V3.2 100% | 0/6 (timeout) | -- | -- | -- | FALHOU |
| Sonnet 4.6 (hibrido) | 6/6 | 20-80 | $0.59-0.61 | -- | OK |
| **Haiku 4.5 100%** | **6-7/7** | **64-78** | **$0.38-0.44** | **84-101K** | **MELHOR** |

**Decisao:** Haiku 4.5 como modelo default. HYBRID_MODEL_MAP atualizado.

### CofreOverlay removido

- `App.tsx`: -70 linhas, CofreOverlay removido do JSX
- `hooks/useCofreTransition.ts`: safety nets removidos (3s dissolve timer, COFRE_ABSOLUTE_MAX_MS, onForceReleaseLoading)
- `showFullscreenLoadingSmart`: simplificado (sem guard generationKind)
- Motivo: Cofre escondia bugs do usuario — melhor erro visivel que loading infinito

### Inline loading restaurado

- Feature flag `inlineLoading` ja era default=true, App.tsx ja usava `resolveEffectiveLoadingVariant()`
- InlineLoadingBubble ja funciona (le chatStore direto)
- Design = progresso visivel no chat, sem overlay fullscreen

### Virtuoso — correcao parcial

| O que | Antes | Depois |
|-------|-------|--------|
| followOutput | false sempre | `isLoading ? false : 'auto'` |
| content-visibility | auto (SectionalBotMessage) | removido |
| computeItemKey | com sufixo :thinking | **BUG PERSISTE** — causa remount |

### Contato adicionado
- `bruno.ferreira@senior.com.br` em ErrorMessageCard, ModuleErrorCards, ChatErrorBoundary
- Mailto bug corrigido (aspas duplas → template literal)

---

## BUGS CONHECIDOS

| Bug | Prioridade | Status |
|-----|-----------|--------|
| Virtuoso computeItemKey com :thinking → remount quebra scroll | P1 | Nao resolvido |
| BrasilAPI HTTP 403 + CNPJ.ws HTTP 429 | P2 | APIs bloqueadas |
| Waterfall sequencial (nao paralelo) | P4 | Documentado |
| Modulos opcionais timeouteiam silenciosamente | P3 | Nao resolvido |
| "Ver relatorio completo" nao expande | P2 | Pre-existente |

## O QUE NAO FUNCIONOU

1. **DeepSeek V3.2 100%:** timeout em DEV + HOMOLOG. Modulos nunca completam.
2. **Virtuoso followOutput='auto':** sozinho nao resolveu render do dossie final.
3. **Static fallback:** removido anteriormente porque quebrava dossie completo.

## ENV VARS Preview (feat/litellm-experiment)

| Variavel | Valor |
|----------|-------|
| LITELLM_BASE_URL | homolog |
| LLM_MODEL_DEFAULT | Haiku 4.5 |
| HYBRID_PIPELINE_ENABLED | true |
| inlineLoading | true (default) |

## PROXIMOS PASSOS

| # | Prioridade | Tarefa |
|---|-----------|--------|
| 1 | **P1** | Resolver Virtuoso computeItemKey — key estavel sem :thinking ou abordagem alternativa |
| 2 | P2 | "Ver relatorio completo" expandir |
| 3 | P3 | Modulos opcionais timeout sem quebrar waterfall |
| 4 | P4 | Waterfall paralelo (6 modulos simultaneos) |

## PROMPT DE RETOMADA

"Sessao 2026-06-25: Haiku 4.5 aprovado como modelo default (score 64-78, $0.38-0.44). CofreOverlay removido — erros agora sao visiveis. Inline loading ja ativo. Virtuoso PARCIAL — dossie final nao renderiza (computeItemKey com :thinking causa remount). Branch feat/litellm-experiment. Proximo passo: resolver Virtuoso computeItemKey ou adotar abordagem alternativa sem remount."
