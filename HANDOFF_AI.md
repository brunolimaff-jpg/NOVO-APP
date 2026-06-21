# Handoff — PR #386 LiteLLM: 3 modelos testados, descoberta critica cache, Brave Search em andamento

**Atualizado:** 2026-06-21 — validacao Grok 4.20 + DeepSeek V4 Pro + Web Search Brave
**Producao:** `scoutagro.vercel.app` — `LLM_PROVIDER=gemini` (sem mudanca)
**Branch:** `feat/litellm-experiment` | **HEAD local:** `78a7805c` (6 commits novos)
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
**Preview:** `scoutagro-no9vz1mwu-brunolimaff-3629s-projects.vercel.app` (deploy pendente web search)

## Estado Atual

| Item                                 | Status                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Fase 1-2 (gate fix 3 camadas)        | OK                                                                                                             |
| Fase 6 validacao DeepSeek V4 Flash   | **LENTO** — 2/6 modulos, 4 timeouts (62-119s/modulo)                                                           |
| Fase 6 validacao Grok 4.20 Reasoning | **RAPIDO** — 6/6 modulos, 12-22s/modulo, 0 erros                                                               |
| Fase 6 validacao DeepSeek V4 Pro     | **LENTO** — 1/6 modulos, 44s                                                                                   |
| **Descoberta critica**               | **Gemini recebe foundation cache (43k chars) + web search. LiteLLM models recebem ~15k chars, sem web search** |
| Fase 10 Brave Search API             | **IMPLEMENTADO** — deploy pendente                                                                             |

## Descoberta Critica — Foundation Cache Gap

Gemini produz dossies excelentes porque recebe:

- **Foundation cache** de ~43k caracteres (contexto completo do CNPJ)
- **Google Search grounding** nativo (fontes atualizadas da web)
- Temperatura 0.1-0.3 para modulos factuais

Modelos via LiteLLM recebem:

- Apenas ~15k chars de contexto (sem foundation cache)
- **Sem web search** — sem acesso a dados atualizados
- Dossies genericos: "Nao encontrado" em quase todos os campos

**Exemplo concreto:** Scheffer R3 via Gemini descobriu Colombia, R$2.8Bi, 220k ha, 28 CNPJs, TOTVS Protheus+AdvPL. Grok 4.20 mesmo prompt: tudo "Nao encontrado", 1 CNPJ.

**Conclusao:** Sem foundation cache + web search, nenhum modelo via LiteLLM producira dossies comparaveis ao Gemini.

## Resultados Validacao (CNPJ Scheffer 04.733.767/0001-80)

| Modelo                  | Modulos | Erros      | Tempo/modulo | Qualidade              |
| ----------------------- | ------- | ---------- | ------------ | ---------------------- |
| DeepSeek V4 Flash       | 2/6     | 4 timeouts | 62-119s      | Inviavel               |
| **Grok 4.20 Reasoning** | **6/6** | **0**      | **12-22s**   | **Generico (sem web)** |
| DeepSeek V4 Pro         | 1/6     | lento      | 44s          | Inviavel               |

## Web Search Brave — Feito e Pendente

**Implementado:**

- `api/open-web-search.ts`: Brave Search como provider primario, DuckDuckGo fallback
- `utils/llm/webSearchService.ts`: 5 queries paralelas + curadoria + grounding block
- `waterfall-orchestrator.ts`: injecao no `sharedDossierModuleOptions.groundingContextBlock`
- `utils/llm/modelCatalog.ts`: modelos `grok-4.20` e `deepseek-v4-pro` adicionados

**Pendente:**

- Deploy do preview `scoutagro-no9vz1mwu` (aguardando build)
- Smoke autenticado com Grok + web search (validar se groundingContextBlock melhora qualidade)

## Commits Novos (desde ultimo handoff)

```
69242e26 fix preview local auth (3 camadas)
fa6938b3 adicionar grok-4.20 ao catalogo
110fc2ad adicionar deepseek-v4-pro ao catalogo
36754f58 fix priorizar Supabase Bearer token
129a08a3 feat web search Brave Search
78a7805c fix types Brave Search + remover api/web-search.ts
```

## Bloqueios Ativos

- **Gemini 429 credits depleted** — ainda sem solucao. LiteLLM como unico provider.
- **LiteLLM sem foundation cache** — descobrimos que este e o real diferencial do Gemini
- **Web Search Brave deploy pendente** — aguardando build para smoke

## Proximo Passo

1. Finalizar deploy do preview com Brave Search (`scoutagro-no9vz1mwu`)
2. Smoke autenticado com Grok 4.20 + web search (validar se grounding melhora dossie)
3. Se web search nao resolver: experimento encerrado com relatorio "modelos alternativos incapazes de replicar Gemini sem foundation cache"

## Regras Criticas

- **NAO fazer merge** — PR experimental, nunca mergear em main
- **NAO adicionar n8n** — fora de escopo
- **NAO liberar bypass auth local em producao** — `LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH` so para preview
- **NAO usar fetch nativo com cookies no Vercel Edge** — Brave Search usa REST API com API key

## Prompt de Retomada

PR #386 feat/litellm-experiment, HEAD 78a7805c. Gate LiteLLM resolvido em 3 camadas. Validacao real: Grok 4.20 rapido (12-22s/modulo) mas dossie generico sem web search; DeepSeek V4 Flash e V4 Pro lentos demais. **Descoberta critica:** o real diferencial do Gemini nao e modelo, e foundation cache (43k chars) + Google Search grounding. LiteLLM models recebem ~15k chars sem web search. Fase 10 implementou Brave Search como fonte de grounding para modelos LiteLLM. Deploy do preview com web search pendente. Gemini 429 ainda sem solucao. Nao mergear.
