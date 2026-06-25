---
grok_wiki: false
page_id: 'page-grounding-cache-bug-p0'
title: 'Bug P0 — Grounding Cache: groundingSources=0 com Foundation Cache'
description: 'Bug critico onde o foundation cache descarta tools de grounding, resultando em dossies sem fontes citadas.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-24T23:59:00.000Z'
source_files:
  - 'utils/llm/groundingHybrid.ts'
  - 'ARQUITETURA.md'
  - 'CALIBER_LEARNINGS.md'
tags:
  - bug
  - p0
  - grounding
  - cache
  - litellm
---

# Bug P0 — Grounding Cache: groundingSources=0 com Foundation Cache

## Problema

Modulos waterfall que usam **foundation cache** do Gemini retornam `groundingSources: []` — zero fontes citadas, mesmo quando o conteudo gerado tem citações.

O usuario ve um dossie completo, mas sem fontes. A experiencia perde credibilidade: parece que a IA "inventou" os dados.

## Impacto

- Dossie sem fontes visiveis para o usuario
- Perda de confianca no produto
- Experiencia degradada em modulos que dependem de search grounding
- Afeta todos os modulos do waterfall que usam foundation cache simultaneamente

## Causa Raiz

O **foundation cache do Gemini** armazena o contexto do prompt (incluindo dados cadastrais do CNPJ, ~43K chars) para reuso entre modulos. Quando o cache e usado, o LiteLLM proxy (ou a camada de cache do Gemini) **descarta as ferramentas `googleSearch` da resposta** porque:

1. O cache foi construido sem as tools de grounding
2. No cache hit, o proxy nao repassa os tool calls corretamente
3. O resultado e `groundingSources: 0` em todos os modulos que usam cache

## Descoberta

Maio/2026, durante o experimento LiteLLM (PR #386). Ao comparar dossies Gemini (com cache) vs LiteLLM (sem cache), percebeu-se que:

- Dossies Gemini com cache tinham `groundingSources: 0` em todos os modulos
- Dossies sem cache (teste manual) tinham fontes normais
- O padrao se confirmou em **100% das execucoes** com cache ativo

Registrado em `CALIBER_LEARNINGS.md` secao "Foundation cache gap e o real diferencial Gemini, nao o modelo" e no `ARQUITETURA.md` secao 7.

## Status

| Item                  | Valor            |
| --------------------- | ---------------- |
| Prioridade            | P0               |
| Status                | Em aberto        |
| Descoberta            | Maio/2026        |
| Trabalho em andamento | NAO              |
| Workaround            | Sim (ver abaixo) |

## Workaround

Desabilitar foundation cache para modulos que precisam de search grounding:

```typescript
// Em foundation-cache.ts ou configuracao do cache
const modulesWithGrounding = ['operacao', 'caminho-venda'];
// Estes modulos NAO usam foundation cache
// Os demais modulos podem usar cache (sem grounding)
```

Ou usar cache-only **sem grounding** para modulos onde fontes nao sao criticas, e chamada direta (sem cache) para modulos que exigem fontes.

## Referencias

- [[project_grounding-cache-bug]] (memoria do agente)
- [[DI-2026-06-24-28]]: Decisao sobre timeouts e configuracao do cliente (contexto do experimento LiteLLM)
- `CALIBER_LEARNINGS.md`: "Foundation cache gap e o real diferencial Gemini, nao o modelo"
- `ARQUITETURA.md` secao 7: Tabela de bugs conhecidos
- `utils/llm/groundingHybrid.ts`: Implementacao de grounding hibrido (workaround parcial)

## Tags

`#bug` `#p0` `#grounding` `#cache` `#litellm` `#foundation-cache` `#gemini`
