---
grok_wiki: false
page_id: 'page-hybrid-model-map'
title: 'HYBRID_MODEL_MAP — Roteamento Inteligente por Modulo'
description: 'Mapa que define qual modelo/provedor cada modulo do waterfall usa. Decisao arquitetural que separa qualidade por custo conforme criticidade.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-24T23:59:00.000Z'
source_files:
  - 'utils/llm/modelRouter.ts'
  - 'utils/llm/modelCatalog.ts'
  - 'utils/llm/types.ts'
  - 'features/dossier/waterfall-orchestrator.ts'
  - 'tests/utils/modelRouter.test.ts'
---

# HYBRID_MODEL_MAP — Roteamento Inteligente por Modulo

## O que e

HYBRID_MODEL_MAP e uma constante em `utils/llm/modelRouter.ts:112` que define qual modelo de IA cada modulo do sistema deve usar. E o coracao do pipeline hibrido da Fase 5.

```typescript
export const HYBRID_MODEL_MAP: Record<string, string> = {
  'teia-societaria': 'bedrock/deepseek.v3.2',
  operacao: 'bedrock/us.anthropic.claude-sonnet-4-6',
  'tech-stack': 'bedrock/deepseek.v3.2',
  'riscos-compliance': 'bedrock/deepseek.v3.2',
  'radar-expansao': 'bedrock/deepseek.v3.2',
  'rh-sindicatos': 'bedrock/deepseek.v3.2',
  decisores: 'bedrock/deepseek.v3.2',
  'caminho-venda': 'bedrock/us.anthropic.claude-sonnet-4-6',
};
```

## Por que existe

Cada modulo do waterfall tem necessidades diferentes:

- **Modulos criticos** (Operacao, Caminho de Venda) precisam de analise profunda, contexto amplo e alta precisao. Justificam um modelo premium.
- **Modulos operacionais** (Teia, Tech Stack, Riscos, Radar, RH, Decisores) sao analises de suporte. Um modelo com bom custo-beneficio e suficiente.
- **Modulo sem entrada no mapa** usa Gemini como fallback — caso residual apos a eliminacao do Gemini como provider principal.

Sem o mapa, todos os modulos usariam o mesmo modelo, pagando mais caro onde nao e necessario ou recebendo qualidade inferior onde e critico.

---

## Tres Tiers de Modelo

O sistema foi projetado com 3 tiers, definidos na [[DI-2026-06-24-24]]:

| Tier      | Modelos                    | Custo/dossie | Uso                            |
| --------- | -------------------------- | ------------ | ------------------------------ |
| Economico | DeepSeek V4 Pro direto     | ~$0.06       | Exploracao, prototipagem, seed |
| Padrao    | Sonnet 4.6 + DeepSeek V3.2 | ~$0.17       | Dossies comerciais (default)   |
| Premium   | Opus 4.7 + Sonnet 4.6      | ~$0.60       | Dossies de alto valor          |

**Status atual:** O tier Padrao ja esta implementado e funcional (2 waterwalls validados). O tier Economico e Premium sao propostas — aguardam feature flag `VITE_WATERFALL_TIER`.

---

## Como o Tier Resolve para Modelo/Provider

O fluxo de selecao:

1. `waterfall-orchestrator` chama `selectExperimentModel` com `moduleName`
2. Se `HYBRID_PIPELINE_ENABLED=true` (env var), consulta `HYBRID_MODEL_MAP[moduleName]`
3. Se o modulo existe no mapa, retorna o modelo correspondente
4. Se nao existe, retorna `undefined` -> fallback Gemini (caso residual)
5. Se o pipeline hibrido nao esta ativo, usa o modo experimental padrao (fixed/random)

Para modulos **fora do waterfall** (ex: War Room), a selecao depende do experiment mode configurado.

---

## Catalogo de Modelos

Definido em `utils/llm/modelCatalog.ts`, contem 14 modelos catalogados com precos por milhao de tokens:

| Modelo                         | Variant | Input $/M | Output $/M | Reasoning |
| ------------------------------ | ------- | --------- | ---------- | --------- |
| Claude Sonnet 4.6 (Bedrock)    | S       | $3.30     | $16.50     | Nao       |
| DeepSeek V3.2 (Bedrock)        | Z       | $0.62     | $1.85      | Nao       |
| DeepSeek R1 (Huawei)           | A       | $0.54     | $2.16      | Sim       |
| DeepSeek V4 Flash (Huawei)     | B       | $0.14     | $0.27      | Sim       |
| GLM-5 (Huawei)                 | I       | $0.81     | $2.96      | Sim       |
| DeepSeek V3.2 (Huawei)         | D       | $0.27     | $0.40      | Nao       |
| Grok 4.1 Fast (Oracle)         | E       | $0.20     | $0.50      | Nao       |
| Grok 4 Fast Reasoning (Oracle) | F       | $0.20     | $0.50      | Sim       |
| DeepSeek V4 Pro (Huawei)       | H       | $0.27     | $1.10      | Sim       |
| Grok 4.20 (Oracle)             | G       | $0.20     | $0.50      | Sim       |
| Kimi K2 Thinking (Bedrock)     | C       | $0.60     | $2.50      | Sim       |
| Amazon Nova 2 Lite (Bedrock)   | J       | $0.33     | $2.75      | Nao       |
| Claude Haiku 4.5 (Bedrock)     | K       | $1.10     | $5.50      | Nao       |

**A variante** e uma letra unica usada para identificar o modelo em experimentos e tracing.

---

## Onde esta definido

- **Codigo:** `utils/llm/modelRouter.ts:112-121`
- **Feature flag:** `VITE_HYBRID_PIPELINE_ENABLED` (env var)
- **Testes:** `tests/utils/modelRouter.test.ts`

---

## Como testar

1. Setar `VITE_HYBRID_PIPELINE_ENABLED=true` no ambiente
2. Configurar `VITE_LLM_ALLOWLIST` com email do operador de teste
3. Rodar waterfall normalmente
4. Verificar nos logs qual modelo foi usado por modulo

Para testar com modelo especifico, use `LLM_PROVIDER` no env:

- `litellm` -> ativa pipeline hibrido
- `gemini` -> volta ao Gemini como provider (legado)

---

## Decisao Arquitetural

[[DI-2026-06-24-27]]: Zero Gemini implementado — roteamento exclusivo via HYBRID_MODEL_MAP. Fallback removido intencionalmente para que erros de provider sejam visiveis, nao silenciosos.

**Principio:** Se o LiteLLM estiver offline, o usuario ve erro em vez de dossie Gemini. Trade-off consciente de confiabilidade vs disponibilidade.
