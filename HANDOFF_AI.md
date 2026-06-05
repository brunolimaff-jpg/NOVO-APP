# Handoff — 05/06/2026 — Bug P0 overlay hero RESOLVIDO, PR #342 aberta

Bug P0: overlay hero/spinner preso apos waterfall completar em **producao**. Preview funcionava, producao nao.

## Status PRs

| PR | Status | Descricao |
|----|--------|-----------|
| #333 | MERGED | Review fixes Gemini + Qodo (null checks, useEffect, import facade) |
| #334 | MERGED | Remove PWA/SW (VitePWA, manifest.json, sw.js) + hard invariant inicial |
| #335 | MERGED | Gemini follow-up (display:none, useMemo, ES2024, optional chaining) |
| #342 | **ABERTA** | `codex/finalize-waterfall-ui` — finalizeWaterfallUI zera atomicamente TODOS os estados de loading |

## Root Cause (3 camadas)

1. **Service Worker CacheFirst**: servia bundles JS/CSS antigos em producao. Preview sem SW nunca reproduzia o bug.
2. **Gap waterfall vs setIsLoading**: `finalizeWaterfallUI` chamado incondicionalmente no `finally` — gap entre waterfall completar e overlay ser liberado.
3. **abortControllerRef nullificado pelo finalizeWaterfallUI**: `isAbort=true` no `processMessage:finally` → `flushDiagnosticsNow` nunca chamado. **FIX: removida nullificacao do finalizeWaterfallUI.**

## O que finalizeWaterfallUI faz (PR #342)

- `setIsLoading(false)` + `setLoadingVariant(undefined)`
- `completeLoadingProgress()` + `setFailureCount(0)`
- `delete activeGenerationRef[sessionId]`
- DOM safety net: `requestAnimationFrame` + `querySelector` direto (3 seletores, sem TreeWalker)
- Log `ui-finalize-state` + `ui-finalize-post-render`

## Bugs secundarios corrigidos (PR #342)

- AbortError pos-render → `debug` (nao `error`)
- ContinuityQuestion JSON parse fail → `debug` (nao `warn`)

## O que foi removido (PRs #333-#335)

- VitePWA plugin + `vite-plugin-pwa` do `package.json`
- `public/manifest.json`
- `public/sw.js` antigo (CacheFirst) → kill-switch
- Dependencia Pinecone do dossie (War Room mantem RAG)

## Licoes-chave

- NUNCA nullificar `abortControllerRef` fora do `processMessage:finally`
- NUNCA usar `TreeWalker`/`document.body` scan para DOM cleanup (bloqueia main thread)
- DOM cleanup DOM `display:none` e **safety net**; React render condition e o mecanismo primario
- `hasRenderableBotMessage` deve ser condicao em TODOS os gates de loading
- Optional chaining deve ir ate o fim da cadeia (`.trim()?.length`)
- `useMemo` deve ser puro; side effects em `useEffect`
- Sempre incluir `hostname` em logs de diagnostico
- Hard invariant como airbag contra UI quebrada apos waterfall

## Proximo passo

1. Code review da PR #342 — branch `codex/finalize-waterfall-ui`
2. Smoke producao apos merge
3. Monitorar `scout_diagnostics` para `overlay-force-removed`
4. Remover kill-switch `sw.js` apos 1-2 releases
5. Ajustar logs `ContinuityQuestion` e `AbortError` para `debug`

## Links

- **PR #333**: https://github.com/brunolimaff-jpg/NOVO-APP/pull/333 (MERGED)
- **PR #334**: https://github.com/brunolimaff-jpg/NOVO-APP/pull/334 (MERGED)
- **PR #335**: https://github.com/brunolimaff-jpg/NOVO-APP/pull/335 (MERGED)
- **PR #342**: https://github.com/brunolimaff-jpg/NOVO-APP/pull/342 (ABERTA — branch `codex/finalize-waterfall-ui`)
