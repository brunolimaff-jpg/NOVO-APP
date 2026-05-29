# Guia: Gemini Foundation Cache no Waterfall

## O que faz

Reduz tokens repetidos no dossiê modular cacheando **uma vez por investigação**:

- `SHARED_FOUNDATION_BLOCK` (prompts/mega)
- Contexto estático: seed do dossiê, lookup CRM, evidência Senior, pesquisa Teia

Cada módulo (7–9 chamadas) envia só o prompt dinâmico (specialist + accumulated text + hints) via `contents`, referenciando o cache com `cachedContent`.

## Flags (default: desligado)

| Camada     | Variável                                 | Onde configurar                          |
| ---------- | ---------------------------------------- | ---------------------------------------- |
| API Vercel | `GEMINI_FOUNDATION_CACHE_ENABLED=1`      | Project Settings → Environment Variables |
| Build Vite | `VITE_GEMINI_FOUNDATION_CACHE_ENABLED=1` | Mesmo projeto ou `.env.local` em dev     |

**Ambas** precisam estar `1` para o fluxo completo funcionar. Sem a flag server, `createCachedContent` retorna 403. Sem a flag client, o waterfall não tenta criar cache.

## Fluxo runtime

```
runMegaPromptWaterfall
  → buildStaticDossierContext(seed, lookup, senior, teia)
  → createWaterfallFoundationCache (TTL 600s, tools: googleSearch no create)
  → loop módulos: generateDossierModule(..., foundationCacheName) — generate sem tools no payload
  → reconcileWaterfallPorta (mesmo cacheName)
  → finally: deleteWaterfallFoundationCache
```

## Observabilidade

Logs `[Scout360][FoundationCache]` — create/delete do cache.

Logs `[Scout360][DossierModule]` com `usageMetadata` — procurar `cachedContentTokenCount` > 0 a partir do 2º módulo.

## Fallback seguro

- Flag off → comportamento anterior (`systemInstruction` monolítico).
- Falha no create → warn + continua sem cache.
- Falha no delete → warn + TTL expira sozinho.

## Grounding

`googleSearch` é registrado no **`createCachedContent`** (junto com foundation + contexto estático). Cada `generateContent` usa só `cachedContent` + `contents` — a API Gemini rejeita `tools` no generate quando há cache.

Resultados de busca **não** são persistidos no cache (regra do projeto: Search Grounding nunca cachear). Reconciliação PORTA usa o mesmo cache e pode acionar grounding se o modelo decidir buscar.

## Arquivos principais

| Arquivo                                          | Papel                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `api/gemini.ts`                                  | Actions `createCachedContent`, `deleteCachedContent`; `generateContent` com `cachedContent` |
| `services/geminiProxy.ts`                        | Proxy cliente                                                                               |
| `services/gemini/foundation-cache.ts`            | Helper de domínio                                                                           |
| `services/gemini/investigation-orchestration.ts` | Split cached vs dynamic em `generateDossierModule`                                          |
| `features/dossier/waterfall-orchestrator.ts`     | Orquestração create/use/delete                                                              |
| `features/dossier/porta-reconciliation.ts`       | Reconciliação PORTA com cache opcional                                                      |

## Validação manual recomendada

1. Ligar flags em preview.
2. Gerar dossiê Scheffer (ou empresa golden).
3. Console: confirmar 1 create + N módulos com `foundationCacheName` + 1 delete.
4. Comparar qualidade e fontes de grounding vs flag off.

## Referências

- Ideia: `docs/ideias/gemini-context-caching-waterfall.md`
- Decisão: `.agents/memory/decisions.md` (2026-05-26)
- Google: https://ai.google.dev/gemini-api/docs/caching
