# Active Context

**Last updated:** 2026-06-21 16:50 -04 — PR #386 Grok + Brave R3 aprovado no preview

## Prioridade Atual

**PR #386 — validar LiteLLM/Grok com Brave Search real antes de qualquer benchmark novo**

- Branch: `feat/litellm-experiment`
- HEAD remoto: `49505a29`
- PR: https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
- Preview validado: `https://scoutagro-m8rhm7656-brunolimaff-3629s-projects.vercel.app`
- Produção: `LLM_PROVIDER=gemini`, sem mudança.

## Estado Técnico

- Brave no waterfall R3: 5 chamadas, todas `source=Brave Search API`, `rawCount=6`, `resultCount=4`, `afterFinalLimitCount=4`, `degraded=false`.
- `llm_experiment_runs`: `createRun` 200, `finalizeRun` 200, `fallbackUsed=false`, `runStatus=success`.
- Render R3: dossiê 8.068 chars, `Ver relatório completo` com `panelEmpty=false`, 0 ocorrências de "NÃO encontrado".
- Correções entregues: contrato `sources/results`, `operatorEmail` no `finalizeRun`, helper E2E para diálogo de histórico, captura R3 de Brave/experimento.

## Validação

- `npm run typecheck` — OK.
- Testes focados — OK, 36 testes.
- `npm test` — OK, 1620/1620.
- `npm run build` — OK.
- R3 no preview novo `m8rhm7656` — OK em 3.9 min.

## Próximo Passo

1. Revisar status agregado CodeQL que ainda aparece FAILURE no rollup.
2. Decidir se encerra benchmark em Grok 4 Fast + Brave ou continua candidatos baratos.
3. Não mergear sem token MERGE explícito.

## Regras Críticas

- NAO mergear PR #386.
- NAO adicionar n8n.
- NAO registrar credenciais.
- NAO aceitar fallback Gemini como sucesso.
