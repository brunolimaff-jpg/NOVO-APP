# Active Context

Last updated: 2026-06-20 — Scheffer live E2E + Opção B (causa raiz); implementer bloqueado

## Prioridade Atual

**PR #386 — LiteLLM preview verde em gates; MERGE bloqueado por UI waterfall + Bug P1**

- **HEAD remoto:** `0351441c` — spec `scheffer-research-validation` + helper Scheffer.
- **Gates:** CI 14/14 ✅, PR Gate IA 16/16 ✅, typecheck/vitest/build ✅.
- **Scheffer live (300s):** R1 CRM ❌, R2 mapa ❌, R3 waterfall+expand ✅; `/api/cnpj` live ✅ (H1 refutada).
- **Decisão Bruno (DI-2026-06-20-02):** Opção B — fix causa raiz B1/B2; sem workaround E2E.
- **Implementer:** não executou (rate limit) — **nenhum fix B1/B2 commitado nesta sessão**.
- **MERGE:** exige P1 + critério B Supabase + token **MERGE**.

## Bloqueios

1. **B1:** `ClienteSeniorScore` + `SocietaryMap` não renderizam no waterfall live LiteLLM.
2. **B2 (P1):** expand "ver relatório completo" → painel vazio (~26k chars).
3. **Critério B:** Bruno ainda não escolheu `success` estrito vs `quality_failure` aceitável.

## Próximo passo

Implementer retoma **B1** (`waterfall-orchestrator.ts`, `SocietaryMap.tsx`, `investigation-orchestration.ts`) → re-run R1/R2 → **B2** P1 → decisão critério B → gates finais.

## Preview

- https://scoutagro-2wcoh4w5m-brunolimaff-3629s-projects.vercel.app
- https://scoutagro-git-feat-litellm-ex-cad2dc-brunolimaff-3629s-projects.vercel.app

## PR #385 — Concluída

Mergeada 2026-06-19 — Ondas 0–3 estabilização pós-auditoria.
