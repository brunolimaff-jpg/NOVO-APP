# Handoff — PR #386 LiteLLM: Grok + Brave R3 aprovado no preview

**Atualizado:** 2026-06-21 16:50 -04
**Branch:** `feat/litellm-experiment` | **HEAD remoto:** `49505a29`
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
**Preview validado:** `https://scoutagro-m8rhm7656-brunolimaff-3629s-projects.vercel.app`
**Produção:** `scoutagro.vercel.app` com `LLM_PROVIDER=gemini` sem mudança.

## Estado Atual

| Item | Status |
|------|--------|
| Gate LiteLLM preview local auth | OK |
| Brave endpoint preview | OK em `4d17ff96`: `rawCount=6`, `afterFinalLimitCount=4`, `degraded=false` |
| Web search no waterfall | OK: `webSearchService` lê `sources` e injeta fontes Brave |
| `llm_experiment_runs` finalize | OK: `finalizeRun` 200 no preview local auth |
| E2E histórico/modal | OK: helper clica `Nova investigação` no diálogo de histórico |
| R3 preview `m8rhm7656` | APROVADO |
| Merge | BLOQUEADO. Não mergear PR #386 |

## Validação Recente

- `npm run typecheck` — OK.
- `npm test -- tests/api-open-web-search.test.ts tests/utils/llm/webSearchService.test.ts tests/utils/llm/experimentGate.test.ts tests/utils/llm/modelRouter.test.ts` — OK, 36 testes.
- `npm test` — OK, 1620/1620.
- `npm run build` — OK.
- R3 no preview novo `m8rhm7656`:
  - passou em 3.9 min;
  - renderizou dossiê de 8.068 chars;
  - `Ver relatório completo`: `panelEmpty=false`, `textLength=8068`;
  - `NÃO encontrado`: 0;
  - `/api/open-web-search`: 5 chamadas, todas `source=Brave Search API`, `rawCount=6`, `resultCount=4`, `afterFinalLimitCount=4`, `degraded=false`;
  - `/api/llm-experiment`: `createRun` 200, `finalizeRun` 200, `fallbackUsed=false`, `runStatus=success`;
  - conclusão: Grok 4 Fast + Brave está validado no preview para R3 Scheffer.

## Correções Entregues

- `utils/llm/webSearchService.ts`: aceita `sources` e `results` no contrato de busca.
- `utils/llm/types.ts`, `utils/llm/experiment.ts`, `features/dossier/waterfall-orchestrator.ts`: `FinalizeRunPayload.operatorEmail` para autenticar `finalizeRun` em preview local auth.
- `tests-e2e/helpers/onboarding.ts`: navega corretamente quando o histórico abre como diálogo.
- `tests-e2e/helpers/auth.ts` e `tests-e2e/helpers/scheffer-research.ts`: modo opcional `E2E_REAL_AUTH=1` com senha só via env `E2E_AUTH_PASSWORD`.
- `tests-e2e/scheffer-research-validation.spec.ts`: R3 captura Brave, fontes e `llm-experiment` sem logar segredo.
- `tests/utils/llm/webSearchService.test.ts`: regressão para endpoint que retorna `sources`.

## PR/CI

- PR #386: `mergeStateStatus=BLOCKED`.
- Checks no commit `49505a29`: Typecheck, Tests, Coverage Gate, Build, Dossier Golden, Smoke preview, GitGuardian e Analyze jobs OK.
- Status agregado `CodeQL` aparece FAILURE no rollup; revisar antes de qualquer merge.

## Próximo Passo

1. Revisar status agregado CodeQL.
2. Decidir se encerra benchmark em Grok 4 Fast + Brave ou continua candidatos baratos.
3. Não mergear sem token **MERGE** explícito.

## Regras Críticas

- Não fazer merge.
- Não adicionar n8n.
- Não registrar credenciais.
- Não aceitar fallback Gemini como sucesso.
- Não prosseguir benchmark de outros modelos até R3 Grok+Brave passar.

## Vault

- Sessão anterior: `/Users/brunolima/Documents/Bruno Vault/20-SESSOES/2026-06/2026-06-21T22-00-00-pr386-gate-3-modelos-foundation-cache-brave.md`
- Sessão atual: `/Users/brunolima/Documents/Bruno Vault/20-SESSOES/2026-06/2026-06-21T16-20-00-pr386-brave-grounding-finalize.md`
