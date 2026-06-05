# Handoff — 05/06/2026 — PRs #333, #334, #335 MERGEADAS em `main`

Bug P0: overlay hero/spinner preso apos waterfall completar em **producao**. Preview funcionava, producao nao.

| Item | Valor |
| --- | --- |
| PRs | #333 (review fixes), #334 (PWA/SW removal), #335 (Gemini follow-up) -- TODAS MERGED |
| Branch base | `main` |

## Root Cause (2 camadas)

1. **Service Worker CacheFirst**: `public/sw.js` manual + VitePWA registravam SW com CacheFirst em producao. Servia bundles **antigos** do cache. Preview nunca teve SW (gate `!isPreviewBuild`).
2. **Gap waterfall vs setIsLoading**: `setIsLoading(false)` no `processMessage:finally` rodava depois do `health-check-final`. Conteudo visivel mas overlay ainda bloqueando.

## O que foi removido

- VitePWA plugin + vite-plugin-pwa do `package.json`
- `public/manifest.json`
- `public/sw.js` antigo (CacheFirst) → substituido por kill-switch

## O que foi adicionado

- `waterfall-orchestrator.ts`: hard invariant — se `waterfallEndStatus` completed/failed/partial OU `botMsgTextLen>0`, forca `setIsLoading(false)` + `setLoadingVariant(undefined)` + `display:none` no overlay
- `App.tsx`: `hasRenderableBotMessage` no `shouldShowHeroLoadingOverlay` + `useEffect` seguranca + SW/cache cleanup + build-info + `overlay:render-decision`
- `loadingVariant.ts`: `shouldShowHeroLoadingOverlay` com parametro `hasRenderableBotMessage`
- `build-globals.d.ts`: types para `__BUILD_SHA__`, `__VERCEL_ENV__`, `__BUILD_TS__`
- `vite.config.ts`: `define` com build metadata
- `tsconfig.json`: ES2022 → ES2024
- Testes: hard invariant test + overlay regression tests

## Pendencias Nao Bloqueantes

1. Trocar log `overlay-force-removed` de `error` para `warn`/`info`
2. Manter kill-switch `sw.js` por 1-2 releases, depois remover
3. Ajustar `ContinuityQuestion` para evitar JSON truncado
4. Tratar `AbortError` dos CNPJ lookups como `debug`/`info`
5. Investigar `foundationCacheName` null em producao

## Licoes-chave

- Service Worker CacheFirst e perigoso em apps com deploy frequente
- Preview sem SW vs Producao com SW cria falsa confianca
- DOM cleanup com `.remove()` quebra React; usar `display:none`
- `useMemo` deve ser puro; side effects em `useEffect`
- Optional chaining deve ir ate o fim da cadeia (`.trim()?.length`)
- Sempre verificar `hostname` nos logs para confirmar ambiente
- Hard invariant como airbag contra UI quebrada apos waterfall

## Links

- **PR #333**: https://github.com/brunolimaff-jpg/NOVO-APP/pull/333 (MERGED)
- **PR #334**: https://github.com/brunolimaff-jpg/NOVO-APP/pull/334 (MERGED)
- **PR #335**: https://github.com/brunolimaff-jpg/NOVO-APP/pull/335 (MERGED)
- **Vault sessao**: `20-SESSOES/2026-06/2026-06-05T15-30-00-NOVO-APP-overlay-hero-pwa-removal.md`
- **Vault licoes**: `30-LICOES/LICOES-SW-CACHEFIRST-OVERLAY-PWA-2026-06-05.md`
