# Handoff — PR #386 LiteLLM Fase 2 (paridade)

**Atualizado:** 2026-06-21 (Fase 1 + Fase 2 concluídas; branch-review PRONTO; deploy preview com 3 modelos)
**Producao:** `scoutagro.vercel.app` — `LLM_PROVIDER=gemini` (sem mudanca)
**Branch:** `feat/litellm-experiment` | **HEAD remoto:** `a9b2417a`
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
**Preview:** `https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app`
**CNPJ teste:** Scheffer `04733767000180`

## Estado atual

| Item                                                     | Status                       |
| -------------------------------------------------------- | ---------------------------- |
| CI GitHub SHA `a9b2417a`                                 | 14/14 (pending re-run)       |
| Gates locais (1609 testes, typecheck, build)             | OK                           |
| Branch-review (5 dimensoes)                              | PRONTO — 2 findings SF1/SF2  |
| Fase 1: limpeza WIP (18 arquivos, 2 commits)             | OK                           |
| Fase 2: paridade LiteLLM (6 arquivos, +197/-52)          | OK                           |
| gh-resolve PR #386 (80 threads)                          | OK                           |
| Deploy preview (3 deploys)                               | OK — qxmx4lrtn -> mpc5evjf7  |
| Env vars atualizadas (3 modelos, traffic split 40/30/30) | OK                           |
| Login Playwright no preview (guest vinculado)            | OK                           |
| `mergeStateStatus`                                       | **UNSTABLE** — CI re-running |

## O que foi entregue nesta sessao

**Fase 1 — Limpeza WIP:**

- 18 arquivos consolidados em 2 commits (docs + formatacao)
- `.gitignore` atualizado com `supabase/.temp/` e screenshots de sessao

**Fase 2 — Paridade LiteLLM (5 desabilitacoes eliminadas):**

- **Catalogo:** 3 novos modelos na rotacao (Grok 4.1 Fast, DeepSeek V3.2, Grok 4 Fast Reasoning); V4 Flash deprecated
- **Output tokens:** 4096 -> 8192 (paridade com Gemini)
- **Retry inline:** backoff exponencial 5 tentativas, 2s-30s em `api/_llm-client.ts`
- **Markers PORTA:** XML estruturado (`instrucao_obrigatoria`) + validação pos-resposta com `parsePortaMarkerV2`
- **Grounding hibrido:** novo modulo `utils/llm/groundingHybrid.ts` (CRM + Brasil API) via `groundingContextBlock`
- **Leak shield:** `preserveInternalMarkersWhenSafe=true` em todos os call sites
- **Novo modelo:** `oracle/xai.grok-4-fast-reasoning` (variant F)

**Branch-review:** 5 dimensoes inspecionadas. Veredito: PRONTO. 2 findings nao bloqueantes:

- SF1: markers PORTA sem retry — TODO anotado `investigation-orchestration.ts:653`
- SF2: `extractWebSourcesFromGroundingResponse` dead code

**gh-resolve-pr-comments:** PR #386 — 2 threads CodeRabbit resolvidas (watchCnpjLookup wrapper + useless assignments). Todas as ~80 threads resolvidas.

**Deploy preview:** 3 deploys. Debug: `import ../utils/retry.js` quebrava serverless com `FUNCTION_INVOCATION_FAILED` — resolvido com retry inline no proprio `_llm-client.ts`.

**Playwright:** Login no preview `mpc5evjf7` feito; guest vinculado (`bruno.ferreira@senior.com.br`). Scheffer iniciada, aguardando waterfall.

## Mudancas arquivadas (arquivos criticos)

| Arquivo                                              | Mudanca                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `utils/llm/modelCatalog.ts`                          | 3 novos modelos, V4 Flash deprecated                           |
| `api/_llm-client.ts`                                 | Retry inline 5x com backoff (evita import externo)             |
| `services/gemini/investigation-orchestration.ts`     | Markers PORTA XML, tokens 8192, grounding hibrido, leak shield |
| `services/gemini/contracts.ts`                       | `groundingContextBlock` integrado                              |
| `utils/llm/groundingHybrid.ts`                       | NOVO — modulo de grounding hibrido                             |
| `tests-e2e/helpers/scheffer-research.ts`             | Fix CodeRabbit (watchCnpjLookup wrapper)                       |
| `tests/services/investigation-orchestration.test.ts` | 4096->8192, XML markers                                        |

## Bloqueios MERGE (ordem)

1. **B1** — CRM + SocietaryMap no waterfall live LiteLLM. Hipoteses: resolvido pela Fase 2 (8192 tokens + retry + grounding hibrido). Aguardando validacao Playwright no preview.
2. **B2 (P1)** — expand "ver relatorio completo" -> painel vazio (~26k chars). Aguardando Fase 3.
3. **Criterio B** — Bruno ainda nao escolheu `success` estrito vs `quality_failure` aceitavel no `llm_experiment_runs`.
4. **SF1** — markers PORTA sem retry (TODO em `investigation-orchestration.ts:653`). Nao bloqueante para merge atual.

## O que NAO funcionou

- `import ../utils/retry.js` em `api/_llm-client.ts` quebrava serverless function Vercel com `FUNCTION_INVOCATION_FAILED`. Causa: bundle serverless nao resolve o import corretamente. Solucao: implementar retry inline no mesmo arquivo.

## Proximo passo

Validacao Playwright no preview com os 3 modelos. Se B1/B2 resolvidos pela Fase 2 -> fechar PR #386. Senao -> Fase 3 (fix UI bugs).

## Links

- Vault: `Bruno Vault/20-SESSOES/2026-06/2026-06-21T*-pr386-litellm-fase2-paridade.md`
- Decisao: DI-2026-06-21-01 (retry inline vs import externo)
- Licao: `Bruno Vault/30-LICOES/imports-externos-serverless-vercel.md`

## Prompt de retomada

▎ PR #386 `feat/litellm-experiment` HEAD `a9b2417a`. Fase 1 + Fase 2 concluidas: catalogo com 3 novos modelos, output tokens 8192, retry inline 5x, markers PORTA XML, grounding hibrido, leak shield. Branch-review PRONTO (2 findings SF1/SF2). 3 deploys preview (mpc5evjf7 fixou FUNCTION_INVOCATION_FAILED). Env vars atualizadas (3 modelos, 40/30/30). Login Playwright feito no preview. CI pending re-run. Bloqueios: B1 (aguardando validacao Playwright), B2 (Fase 3), Criterio B, SF1 (TODO). Proximo: validacao Playwright waterfall -> se passar, preparar merge.
