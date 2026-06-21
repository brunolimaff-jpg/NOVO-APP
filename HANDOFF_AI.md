# Handoff — PR #386 LiteLLM: Brave Grounding + finalizeRun em ajuste final

**Atualizado:** 2026-06-21 16:20 -04
**Branch:** `feat/litellm-experiment` | **HEAD remoto:** `4d17ff96` | **local:** ajustes pendentes de commit
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
**Preview atual:** `https://scoutagro-git-feat-litellm-ex-cad2dc-brunolimaff-3629s-projects.vercel.app`
**Produção:** `scoutagro.vercel.app` com `LLM_PROVIDER=gemini` sem mudança.

## Estado Atual

| Item | Status |
|------|--------|
| Gate LiteLLM preview local auth | OK |
| Brave endpoint preview | OK em `4d17ff96`: `rawCount=6`, `afterFinalLimitCount=4`, `degraded=false` |
| Web search no waterfall | Corrigido localmente: `webSearchService` agora lê `sources` do endpoint |
| `llm_experiment_runs` finalize | Corrigido localmente: `finalizeRun` envia `operatorEmail` no preview local auth |
| E2E histórico/modal | Corrigido localmente: helper clica `Nova investigação` no diálogo de histórico |
| R3 preview `cad2dc` | Render completou, painel completo não ficou vazio, mas NAO APROVADO |
| Merge | BLOQUEADO. Não mergear PR #386 |

## Validação Recente

- `npm run typecheck` — OK.
- `npm test -- tests/api-open-web-search.test.ts tests/utils/llm/webSearchService.test.ts tests/utils/llm/experimentGate.test.ts tests/utils/llm/modelRouter.test.ts` — OK, 36 testes.
- `npm run build` — OK.
- R3 no preview antigo `cad2dc`:
  - completou waterfall e renderizou dossiê de 7.696 chars;
  - `Ver relatório completo`: `panelEmpty=false`;
  - `NÃO encontrado`: 0;
  - `/api/open-web-search`: 5 chamadas, mas o frontend antigo lia `results` e recebeu `sources`, logo grounding efetivo ficou vazio;
  - `/api/llm-experiment`: `createRun` 200, `finalizeRun` 401;
  - conclusão: preview antigo é evidência de UI/render, não de Grok+Brave aprovado.

## Correções Locais Pendentes

- `utils/llm/webSearchService.ts`: aceita `sources` e `results` no contrato de busca.
- `utils/llm/types.ts`, `utils/llm/experiment.ts`, `features/dossier/waterfall-orchestrator.ts`: `FinalizeRunPayload.operatorEmail` para autenticar `finalizeRun` em preview local auth.
- `tests-e2e/helpers/onboarding.ts`: navega corretamente quando o histórico abre como diálogo.
- `tests-e2e/helpers/auth.ts` e `tests-e2e/helpers/scheffer-research.ts`: modo opcional `E2E_REAL_AUTH=1` com senha só via env `E2E_AUTH_PASSWORD`.
- `tests-e2e/scheffer-research-validation.spec.ts`: R3 captura Brave, fontes e `llm-experiment` sem logar segredo.
- `tests/utils/llm/webSearchService.test.ts`: regressão para endpoint que retorna `sources`.

## PR/CI

- PR #386: `mergeStateStatus=BLOCKED`.
- Checks no commit remoto `4d17ff96`: Typecheck, Tests, Coverage Gate, Build, Dossier Golden, Preview Smoke e jobs CodeQL internos OK.
- Status agregado `CodeQL` aparece FAILURE no rollup, apesar de jobs por linguagem estarem SUCCESS.

## Próximo Passo

1. Commitar/pushar ajustes locais.
2. Aguardar novo preview Vercel.
3. Reexecutar R3 Scheffer no preview novo.
4. Aprovar Grok+Brave somente se:
   - Brave tiver `rawCount > 0` e fontes curadas;
   - grounding block receber fontes;
   - `finalizeRun` 200;
   - `fallbackUsed=false`;
   - render final e `Ver relatório completo` sem painel vazio.

## Regras Críticas

- Não fazer merge.
- Não adicionar n8n.
- Não registrar credenciais.
- Não aceitar fallback Gemini como sucesso.
- Não prosseguir benchmark de outros modelos até R3 Grok+Brave passar.

## Vault

- Sessão anterior: `/Users/brunolima/Documents/Bruno Vault/20-SESSOES/2026-06/2026-06-21T22-00-00-pr386-gate-3-modelos-foundation-cache-brave.md`
- Sessão atual: criar nota compacta após commit/push dos ajustes finais.
