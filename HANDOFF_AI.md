# Handoff — PR #386 LiteLLM + fix freeze consolidação

**Atualizado:** 2026-06-19 (env Preview + debug freeze link-status)
**Produção:** `scoutagro.vercel.app`
**Branch ativa:** `feat/litellm-experiment` (PR #386)

## Estado Atual

| PR       | Branch                    | Status                                                                |
| -------- | ------------------------- | --------------------------------------------------------------------- |
| **#385** | `fix/onda-1-raf-persist`  | ✅ **MERGEADA** 2026-06-19                                            |
| **#386** | `feat/litellm-experiment` | 🟡 **Aguardando validação Bruno** — fix freeze deployado, debug ativo |

**Preview com fix freeze (validar aqui):**
https://scoutagro-d47bkguue-brunolimaff-3629s-projects.vercel.app

**Preview anterior (V4-only, sem fix freeze):** `scoutagro-90mpwvvhr`

## Sessão 2026-06-19 — Entregas

### LiteLLM / Vercel Preview

- **18 vars** configuradas no Vercel Preview (branch `feat/litellm-experiment`); Bruno forneceu só `LITELLM_API_KEY`.
- **Allowlist corrigida:** email real `bruno.ferreira@senior.com.br` (não `bruno@senior.com.br` — era email de teste unitário).
- **Modelos:** R1 (`huawei/deepseek-r1-250528`) e Kimi K2 retornam **404** no LiteLLM; só `huawei/deepseek-v4-flash` funciona.
- **Experimento restrito a V4 Flash only:** `LLM_EXPERIMENT_MODELS`, `VITE_LLM_*`, defaults e `TRAFFIC_SPLIT=100`.
- **Limitação conhecida:** o path LiteLLM v1 não usa Google Search grounding; comparar qualidade estrutural separadamente de `valid_sources_count` até existir grounding alternativo.
- `GEMINI_FOUNDATION_CACHE_ENABLED=0` no Preview.
- Migration `20260620_llm_experiment.sql` ✅ aplicada no Supabase `vmqfcaoirjcfucvlnpig`.

### Fix freeze "Consolidando informações…" (debug `c352f8`)

**Sintoma:** UI ~2 min em "Consolidando informações…", Chrome "Página sem resposta", overlay bloqueia cliques.

**Evidência:** `scout_diagnostics` sessão `0ea8ed46` — pipeline para em `inline-validation:fetch:start` (6 URLs), ~116s sem eventos até reload.

| Hipótese                         | Veredito                                                         |
| -------------------------------- | ---------------------------------------------------------------- |
| H1 PORTA reconciliation          | ❌ REJEITADA (pre/pós instantâneo)                               |
| H2 resolvePortaScore             | ❌ REJEITADA (extract 2ms)                                       |
| H3 link-status vs budget cliente | ✅ **CONFIRMADA** — `/api/link-status` ~6.7s, timeout cliente 5s |

**Fix implementado** (instrumentação debug **ainda presente** — não remover até Bruno confirmar):

| Arquivo                                                      | Mudança                                                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `api/link-status.ts`                                         | `REQUEST_TIMEOUT_MS` 5000→**2500**                                                                    |
| `vercel.json`                                                | `maxDuration` **15s** para `api/link-status.ts`                                                       |
| `features/dossier/waterfall-orchestrator.ts`                 | `VALIDATE_INLINE_TOTAL_TIMEOUT_MS` 5s→**12s**, `AbortSignal.timeout`, hard-cap **14s** → retorna `[]` |
| `utils/agentDebugLog.ts`                                     | Criado (sessão debug)                                                                                 |
| `porta-reconciliation.ts`, `geminiProxy.ts`                  | Instrumentação `agentDebugLog`                                                                        |
| `tests/features/validate-inline-sources-freeze-diag.test.ts` | +1 teste hard-cap; **15/15** passando                                                                 |

**Medição pós-deploy:** link-status ~**3.5s** no preview d47bkguue (antes ~6.7s).

### E2E / testes

- `litellm-live-parallel` falhou CNPJ no preview (stub/route) — **NÃO VALIDADO** end-to-end LiteLLM.
- Scheffer stub no preview passou ~27s.
- Waterfall completo com LiteLLM real no preview d47bkguue: **pendente Bruno**.

## Env Preview — matriz LiteLLM (configurado)

| Server (`api/*`)                       | Browser (`VITE_*`)           | Valor atual Preview            |
| -------------------------------------- | ---------------------------- | ------------------------------ |
| `LLM_PROVIDER`                         | `VITE_LLM_PROVIDER`          | `litellm`                      |
| `LLM_EXPERIMENT_MODE`                  | `VITE_LLM_EXPERIMENT_MODE`   | `fixed`                        |
| `LLM_MODEL_DEFAULT`                    | `VITE_LLM_MODEL_DEFAULT`     | `huawei/deepseek-v4-flash`     |
| `LLM_EXPERIMENT_MODELS`                | `VITE_LLM_EXPERIMENT_MODELS` | `huawei/deepseek-v4-flash`     |
| `LLM_TRAFFIC_SPLIT`                    | `VITE_LLM_TRAFFIC_SPLIT`     | `100`                          |
| `LLM_ALLOWLIST`                        | `VITE_LLM_ALLOWLIST`         | `bruno.ferreira@senior.com.br` |
| `LITELLM_BASE_URL` + `LITELLM_API_KEY` | —                            | server only                    |
| `LLM_FALLBACK_ENABLED`                 | `VITE_LLM_FALLBACK_ENABLED`  | `true`                         |
| `GEMINI_FOUNDATION_CACHE_ENABLED`      | —                            | `0`                            |

**Produção:** omitir ou `LLM_PROVIDER=gemini` — zero mudança de comportamento.

## Pendências

| Item                                                              | Risco | Ação                                                                                                      |
| ----------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| Bruno validar consolidação completa no preview **d47bkguue**      | Alto  | Waterfall Scheffer/Cofre sem freeze                                                                       |
| Remover instrumentação debug (`agentDebugLog`, regiões agent log) | Médio | Só após confirmação Bruno                                                                                 |
| Token **MERGE** para integrar #386                                | Alto  | Palavra MERGE na mensagem                                                                                 |
| `gh-resolve` PR #386                                              | Baixo | Token `gh` sem scope `AddPullRequestReviewComment`; usar `scripts/resolve-pr-threads.py` ou renovar scope |
| Configurar R1/Kimi no servidor LiteLLM                            | Baixo | Antes de reativar rotação 3 modelos                                                                       |
| `litellm-live-parallel` CNPJ no preview                           | Médio | Investigar stub/route                                                                                     |

## Próximo passo único

**Bruno:** rodar waterfall completo (CNPJ real) no preview https://scoutagro-d47bkguue-brunolimaff-3629s-projects.vercel.app e confirmar que passa de "Consolidando informações…" sem freeze.

## Links

- PR #386: https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
- Vault sessão: `Bruno Vault/20-SESSOES/2026-06/2026-06-19T23-45-00-litellm-env-freeze-link-status.md`
- Decisões: DI-2026-06-19-03 (V4-only), DI-2026-06-19-04 (budget link-status)
