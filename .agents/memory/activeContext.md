# Active Context

Last updated: 2026-06-21 — Fase 1 + Fase 2 concluídas; branch-review PRONTO; push feito

## Prioridade Atual

**PR #386 — Fase 2 (paridade LiteLLM) concluída; aguardando Fase 3 (B1/B2 UI bugs)**

- **HEAD remoto:** `1ff11b2f` — TODO markers retry + Fase 2 completa.
- **4 commits ahead** de `0351441c` (docs, style, feat, docs).
- **Gates:** 1609/1609 testes ✅, typecheck ✅, build ✅, branch-review ✅.
- **Scheffer live (300s):** R1 CRM ❌, R2 mapa ❌, R3 waterfall+expand ✅; `/api/cnpj` live ✅ (H1 refutada).
- **Decisão Bruno:** 3 modelos rotacionando (Grok 4.1 Fast, DeepSeek V3.2, Grok 4 Fast Reasoning) — output ≤ $2/M.
- **Fase 2 entregue:** 5 desabilitações eliminadas (output tokens, retry, markers XML, grounding híbrido, leak shield).
- **MERGE:** exige Fase 3 (B1/B2) + deploy preview + validação E2E + critério B Supabase + token **MERGE**.

## Bloqueios

1. **B1:** `ClienteSeniorScore` + `SocietaryMap` não renderizam no waterfall live LiteLLM. ⏳ Hipótese: resolvido pela Fase 2 (8192 tokens + retry + grounding híbrido). Aguardando validação preview.
2. **B2 (P1):** expand "ver relatório completo" → painel vazio (~26k chars). ⏳ Aguardando Fase 3.
3. **Critério B:** Bruno ainda não escolheu `success` estrito vs `quality_failure` aceitável.
4. **SF1:** markers PORTA ausentes detectados mas sem retry — TODO anotado para Fase 3 (`investigation-orchestration.ts:653`).

## Próximo passo

Implementer retoma **B1** (`waterfall-orchestrator.ts`, `SocietaryMap.tsx`, `investigation-orchestration.ts`) → re-run R1/R2 → **B2** P1 → decisão critério B → gates finais.

## Preview

- https://scoutagro-2wcoh4w5m-brunolimaff-3629s-projects.vercel.app
- https://scoutagro-git-feat-litellm-ex-cad2dc-brunolimaff-3629s-projects.vercel.app

## PR #385 — Concluída

Mergeada 2026-06-19 — Ondas 0–3 estabilização pós-auditoria.
