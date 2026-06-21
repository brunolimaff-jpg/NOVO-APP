# Active Context

Last updated: 2026-06-21 — PR #386 3 modelos validados, descoberta foundation cache, Brave Search

## Prioridade Atual

**PR #386 — validar alternativas ao Gemini via LiteLLM + web search**

- Branch: `feat/litellm-experiment`
- HEAD local: `78a7805c` (6 commits: gate fix + Grok + web search)
- PR: https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
- Preview c/ web search: `scoutagro-no9vz1mwu-brunolimaff-3629s-projects.vercel.app` (deploy pendente)

## Validacao 3 Modelos (Fase 6)

| Modelo              | Modulos | Erros      | Tempo   | Qualidade           |
| ------------------- | ------- | ---------- | ------- | ------------------- |
| DeepSeek V4 Flash   | 2/6     | 4 timeouts | 62-119s | Inviavel (lento)    |
| Grok 4.20 Reasoning | 6/6     | 0          | 12-22s  | Rapido mas generico |
| DeepSeek V4 Pro     | 1/6     | lento      | 44s     | Inviavel (lento)    |

## Descoberta Critica — Foundation Cache Gap

Gemini produz dossies excelentes porque recebe **foundation cache (~43k chars)** + **Google Search grounding**. Modelos via LiteLLM recebem apenas ~15k chars sem web search. Resultado: dossies genericos ("Nao encontrado").

**Exemplo:** Scheffer via Gemini descobriu Colombia, R$2.8Bi, 220k ha, 28 CNPJs. Grok 4.20 mesmo prompt: tudo "Nao encontrado", 1 CNPJ.

## Web Search Brave (Fase 10)

**Implementado:** `api/open-web-search.ts` (Brave Search), `utils/llm/webSearchService.ts` (5 queries + curadoria), injecao no `waterfall-orchestrator.ts`.

**Pendente:** Deploy preview + smoke com Grok + web search.

## Proximo Passo

1. Deploy preview `scoutagro-no9vz1mwu` com Brave Search
2. Smoke autenticado Grok + web search
3. Decisao: se web search nao resolver, encerrar experimento

## Bloq. Ativos

- **Gemini 429 credits depleted** — sem solucao
- **LiteLLM sem foundation cache** — descoberta critica
- **Web Search deploy pendente** — aguardando build

## Regras Criticas

- **NAO mergear** PR #386 — experimental
- **NAO adicionar n8n** — fora de escopo
- **NAO liberar bypass em producao** — so preview

## Merge Guard

NAO mergear. PR #386 e experimental. Token MERGE nao se aplica.
