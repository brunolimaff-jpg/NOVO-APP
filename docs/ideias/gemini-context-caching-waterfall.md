# Gemini Context Caching — Waterfall Foundation

**Status:** implementado (2026-05-26)
**Data:** 2026-05-25
**Tags:** gemini, cache, waterfall, otimizacao, custo, tokens, quick-win

## Ativação

| Ambiente | Variável | Valor |
|----------|----------|-------|
| Serverless (`api/gemini.ts`) | `GEMINI_FOUNDATION_CACHE_ENABLED` | `1` |
| Frontend (waterfall) | `VITE_GEMINI_FOUNDATION_CACHE_ENABLED` | `1` |

Com a flag desligada (default), o waterfall mantém o comportamento anterior (systemInstruction monolítico).

## Implementação (v1)

- Cache explicit por dossiê: `SHARED_FOUNDATION_BLOCK` + contexto estático (seed, lookup CRM, Senior, teia).
- Contexto dinâmico (accumulated text, hints) vai em `contents` de cada módulo.
- `googleSearch` permanece por request — resultados de grounding **não** são cacheados.
- TTL: **600s**; delete best-effort no `finally` do waterfall.
- Observabilidade: `usageMetadata` propagado da API até logs `DossierModule`.

Arquivos principais: `api/gemini.ts`, `services/geminiProxy.ts`, `services/gemini/foundation-cache.ts`, `services/gemini/investigation-orchestration.ts`, `features/dossier/waterfall-orchestrator.ts`.

## Problema

O waterfall do Scout repete o bloco foundation 7-9x por dossiê:

```
Hoje:
  Foundation (15K tokens) → Specialist 1 (12K)
  Foundation (15K tokens) → Specialist 2 (12K)
  Foundation (15K tokens) → Specialist 3 (12K)
  ... (repete 7-9x)

Total: ~109K tokens/dossiê
Tokens repetidos (foundation): ~105K tokens (96% do total!)
```

A foundation é **idêntica** entre as chamadas. Estamos pagando o preço cheio por tokens que nunca mudam.

## Solução

Gemini Context Caching. A API do Gemini tem suporte nativo a cache de contexto:

```
Com cache:
  Foundation (15K) → [CACHE WRITE, custo único]
  Specialist 1 (12K) → [CACHE HIT, -75% custo]
  Specialist 2 (12K) → [CACHE HIT, -75% custo]
  Specialist 3 (12K) → [CACHE HIT, -75% custo]
  ... (repete 7-9x)

Custo com cache:
  Cache write: 15K × preço cheio (1x)
  Cache hit: 15K × 25% preço (7-9x)
  Specialists: 12K × 7-9x (igual)

Redução total: ~70% nos tokens repetidos
```

### Preço do Cache (Gemini)

| Operação | Preço (Flash) |
|----------|--------------|
| Cache write | $0.075/1M tokens |
| Cache hit | $0.01875/1M tokens (25% do preço cheio) |
| Armazenamento | $0.25/1M tokens/hora |

Para 15K tokens cacheados por 1 hora: ~$0.00375 de armazenamento.

### TTL do Cache

TTL configurado em **600s** (`WATERFALL_FOUNDATION_CACHE_TTL`) — waterfall + teia + reconciliação PORTA podem ultrapassar 300s. Delete best-effort no `finally`; TTL auto-expira se o processo cair.

## Validação pós-merge (manual)

1. Setar `GEMINI_FOUNDATION_CACHE_ENABLED=1` na Vercel e `VITE_GEMINI_FOUNDATION_CACHE_ENABLED=1` no build frontend.
2. Rodar 1 dossiê Scheffer; comparar logs `[Scout360][DossierModule]` / `usageMetadata` com flag on vs off.
3. Confirmar `cachedContentTokenCount > 0` a partir do 2º módulo.
4. Confirmar fontes de grounding ainda aparecem nos módulos.

## Limitações v1

- Escopo: waterfall modular apenas (não chat principal / investigação conversacional).
- Grounding: tool `googleSearch` por request; resultados de busca **não** entram no cache.
- Fallback: se `createCachedContent` falhar, waterfall continua com `systemInstruction` monolítico.
- Fora de escopo: LLMLingua, smoke Teia, alteração de conteúdo em `prompts/mega/*`.

## Próximos Passos (pós-v1)

1. Medir economia real em produção (tokens/custo por dossiê).
2. Estender cache ao chat de investigação se métricas forem positivas.
3. Considerar hash de foundation em log para invalidação após deploy de prompt.

## Ganho

| Cenário | Tokens/dossiê | Custo/dossiê (Flash) |
|---------|--------------|---------------------|
| Hoje | 109K | $0.0082 |
| Com cache | 109K (mas 105K com 75% desconto) | ~$0.0032 |
| **Redução** | — | **-61%** |

Se escalar pra 500 dossiês/dia (Demand Intelligence):
- Hoje: ~$4.10/dia → $90/mês
- Com cache: ~$1.60/dia → $35/mês
- **Economia: $55/mês**

## Riscos

- Cache TTL de 600s pode expirar se waterfall demorar >10 min (improvável; monitorar métricas)
- Foundation precisa ser **idêntica** entre chamadas dentro do mesmo dossiê (já garantido pelo split static/dynamic)
- Cache invalida se mudar o prompt da foundation (esperado após deploy)
- Gemini Flash e Pro têm preços de cache diferentes — validar no modelo `gemini-3-flash-preview`

## Esforço

Implementado em 2026-05-26. Ver PR associada e testes em `tests/services/gemini/foundation-cache.test.ts`.

## Referência

https://ai.google.dev/gemini-api/docs/caching
