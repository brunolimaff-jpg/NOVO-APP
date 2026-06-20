# Handoff — Ship-loop encerrado · LiteLLM #386 pronta para merge

**Atualizado:** 2026-06-19 (ship-loop + gh-resolve)  
**Produção:** `scoutagro.vercel.app`  
**Branch ativa:** `feat/litellm-experiment` (PR #386)

## Estado Atual

| PR       | Branch                       | Status                                                                          |
| -------- | ---------------------------- | ------------------------------------------------------------------------------- |
| **#385** | `fix/onda-1-raf-persist-e2e` | ✅ **MERGEADA** 2026-06-19T23:55:42Z — Playwright **16/16** preview             |
| **#386** | `feat/litellm-experiment`    | 🟢 **MERGE_READY** — CI verde, Playwright **16/16**, review fixes em `67ff465c` |

- **Backup ship-loop:** tag `backup/pre-ship-loop-20260619-200620` + stash local.
- **gh-resolve:** threads de review #385 e #386 respondidas/resolvidas no commit `67ff465c`.

## PR #386 — LiteLLM (escopo + review fixes `67ff465c`)

**Arquivos críticos:** `api/_llm-client.ts`, `api/llm-experiment.ts`, `utils/llm/*`, patches em `gemini/` / `waterfall` / `investigation-orchestration`.

**Review fixes (67ff465c):** auth allowlist (`LLM_ALLOWLIST`), `VITE_LLM_*` no browser via `readConfigEnv`, gate server-side LiteLLM (`api/llm-experiment.ts` 403 se `LLM_PROVIDER=gemini`), leak shield fallback, finalize fire-and-forget, status enum.

**Fixes deploy Vercel:** `.npmrc` legacy-peer-deps → fetch nativo (sem SDK openai) → consolidar relatório em `api/llm-experiment.ts` GET `?format=markdown` (limite **12 functions** Hobby).

**Produção inalterada:** `LLM_PROVIDER=gemini` (default) — experimento só com env explícita.

## Pendências (antes do merge #386)

| Item                                                        | Risco                                                        | Ação                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| Token **MERGE** do Bruno                                    | Alto — bloqueia integração                                   | Confirmar com palavra MERGE na mensagem              |
| Migration `supabase/migrations/20260620_llm_experiment.sql` | ✅ **Aplicada** 2026-06-20 no projeto `vmqfcaoirjcfucvlnpig` |
| Env Vercel **Preview**: `LLM_*` + `VITE_LLM_*` espelhados   | ⚠️ Configurar no dashboard (ver matriz abaixo)               |
| Rebase em `origin/main` pós-#385                            | Médio                                                        | Confirmar branch atualizada; rebase se HEAD divergir |

## Env Preview — matriz LiteLLM (configurar no Vercel)

| Server (`api/*`) | Browser (`VITE_*`) | Exemplo preview |
| --- | --- | --- |
| `LLM_PROVIDER=litellm` | `VITE_LLM_PROVIDER=litellm` | Ativa experimento |
| `LLM_EXPERIMENT_MODE=fixed` ou `random` | `VITE_LLM_EXPERIMENT_MODE=…` | `fixed` = 1 modelo; `random` = rotação |
| `LLM_MODEL_DEFAULT=huawei/deepseek-r1-250528` | `VITE_LLM_MODEL_DEFAULT=…` | Modelo fixo fase 3.1 |
| `LLM_EXPERIMENT_MODELS=…` (3 modelos) | `VITE_LLM_EXPERIMENT_MODELS=…` | Catálogo em `utils/llm/modelCatalog.ts` |
| `LLM_ALLOWLIST=bruno@senior.com.br` | `VITE_LLM_ALLOWLIST=…` | Gate operador |
| `LITELLM_BASE_URL` + `LITELLM_API_KEY` | — | Só server |
| `LLM_FALLBACK_ENABLED=true` | `VITE_LLM_FALLBACK_ENABLED=true` | Fallback Gemini |

**Produção:** omitir ou `LLM_PROVIDER=gemini` — zero mudança de comportamento.

## Próximo passo único

1. Aplicar migration `20260620_llm_experiment.sql` no Supabase.
2. Configurar env Vercel Preview (`LLM_*` + `VITE_LLM_*` espelhados).
3. PR Gate IA **16/16** no preview do SHA final → Bruno confirma com token **MERGE**.

## Links

- PR #385: https://github.com/brunolimaff-jpg/NOVO-APP/pull/385 (merged)
- PR #386: https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
- Vault: `Bruno Vault/20-SESSOES/2026-06/2026-06-19T20-06-00-ship-loop-pr385-litellm.md`
- Plano estabilização: `.cursor/plans/avaliação_auditoria_50_prs_f7ced8ea.plan.md`
