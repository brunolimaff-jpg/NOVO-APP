# Active Context

**Last updated:** 2026-06-21 16:20 -04 — PR #386 Brave grounding + finalizeRun em ajuste final

## Prioridade Atual

**PR #386 — validar LiteLLM/Grok com Brave Search real antes de qualquer benchmark novo**

- Branch: `feat/litellm-experiment`
- HEAD remoto: `4d17ff96`
- Estado local: ajustes pendentes de commit para contrato `sources`, `finalizeRun`, helper E2E e docs.
- PR: https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
- Preview atual: `https://scoutagro-git-feat-litellm-ex-cad2dc-brunolimaff-3629s-projects.vercel.app`
- Produção: `LLM_PROVIDER=gemini`, sem mudança.

## Estado Técnico

- Brave endpoint preview em `4d17ff96`: OK, `rawCount=6`, `afterFinalLimitCount=4`, `degraded=false`.
- Causa raiz do grounding vazio no waterfall: `api/open-web-search` retorna `sources`; `webSearchService` lia só `results`.
- Causa raiz do `llm_experiment_runs` sem finalização: `finalizeRun` não enviava `x-experiment-operator-email` em preview local auth.
- E2E real com histórico cheio travava no diálogo "Histórico de investigações"; helper local agora clica `Nova investigação` dentro do diálogo.

## Validação

- `npm run typecheck` — OK.
- Testes focados — OK, 36 testes.
- `npm run build` — OK.
- R3 no preview antigo `cad2dc`: render completou, `Ver relatório completo` sem painel vazio, mas NAO APROVADO por grounding vazio e `finalizeRun` 401.

## Próximo Passo

1. Commitar/pushar ajustes locais.
2. Aguardar novo preview.
3. Reexecutar R3 Scheffer no preview novo.
4. Só aprovar Grok+Brave com fontes curadas, `finalizeRun` 200, `fallbackUsed=false` e render final OK.

## Regras Críticas

- NAO mergear PR #386.
- NAO adicionar n8n.
- NAO registrar credenciais.
- NAO aceitar fallback Gemini como sucesso.
