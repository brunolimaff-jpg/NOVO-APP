# Active Context

Last updated: 2026-06-21 — Fase 1 + Fase 2 concluidas; branch-review PRONTO; push feito; deploy preview

## Prioridade Atual

**PR #386 — Fase 2 (paridade LiteLLM) concluida; aguardando validacao Playwright no preview**

- **HEAD remoto:** `a9b2417a` — fix inline retry (FUNCTION_INVOCATION_FAILED).
- **6 commits ahead** de `0351441c` (docs, style, feat, docs, fix, fix).
- **Gates:** 1609/1609 testes OK, typecheck OK, build OK, branch-review OK (PRONTO).
- **Fase 2 entregue:** 5 desabilitacoes eliminadas (catalogo 3 modelos, output tokens 8192, retry inline 5x, markers PORTA XML, grounding hibrido, leak shield).
- **FUNCTION_INVOCATION_FAILED** diagnosticado: `import ../utils/retry.js` quebrava bundle serverless. Fix: retry inline no proprio `api/_llm-client.ts`.
- **3 deploys preview:** `qxmx4lrtn` (inicial), `2wcoh4w5m` (2o), `mpc5evjf7` (fix FUNCTION_INVOCATION_FAILED).
- **Env vars atualizadas:** `LLM_EXPERIMENT_MODELS` e `VITE_LLM_EXPERIMENT_MODELS` com os 3 novos modelos, `TRAFFIC_SPLIT=40,30,30`.
- **gh-resolve PR #386:** 2 threads CodeRabbit resolvidas. ~80 threads resolvidas no total.
- **Login Playwright:** feito no preview `mpc5evjf7`. Guest vinculado: `bruno.ferreira@senior.com.br`. Scheffer iniciada, aguardando waterfall.
- **MERGE:** exige validacao Playwright (B1/B2) + criterio B Supabase + token **MERGE**.

## Bloqueios

1. **B1:** `ClienteSeniorScore` + `SocietaryMap` nao renderizam no waterfall live LiteLLM. Hipoteses: resolvido pela Fase 2 (8192 tokens + retry + grounding hibrido). Aguardando validacao preview.
2. **B2 (P1):** expand "ver relatorio completo" -> painel vazio (~26k chars). Aguardando Fase 3.
3. **Criterio B:** Bruno ainda nao escolheu `success` estrito vs `quality_failure` aceitavel.
4. **SF1:** markers PORTA ausentes detectados mas sem retry — TODO anotado para Fase 3 (`investigation-orchestration.ts:653`).

## Proximo passo

Validacao Playwright no preview com os 3 modelos. Se B1/B2 resolvidos pela Fase 2 -> fechar PR #386. Senao -> Fase 3 (fix UI bugs).

## Preview

- https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app
