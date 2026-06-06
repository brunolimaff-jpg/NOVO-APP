# Handoff Final — Bug P0 Overlay Hero RESOLVIDO

**Bug P0**: overlay/spinner hero preso apos waterfall completar em producao. 4 PRs mergeadas (#333, #334, #335, #342). Chrome mostrava "Pagina sem resposta" com dossie Scheffer ~30KB.

## Root Cause (4 camadas)

| # | Causa | Onde | Fix (PR) |
|---|-------|------|----------|
| 1 | **Service Worker CacheFirst** servia bundles JS/CSS antigos em producao. Preview sem SW nunca reproduzia. | VitePWA + `public/sw.js` | #334: remove PWA/SW |
| 2 | **Gap waterfall vs setIsLoading**: `finalizeWaterfallUI` no finally sem bridge entre completar waterfall e liberar overlay | `waterfall-orchestrator.ts` | #342: finalizeWaterfallUI incondicional no finally |
| 3 | **abortControllerRef nullificado** pelo finalizeWaterfallUI: `isAbort=true` falso -> `flushDiagnosticsNow` nunca chamado | `waterfall-orchestrator.ts` | #342: abortControllerRef so no processMessage:finally |
| 4 | **Static fallback display:none**: `flex-1` pai com `flex-basis:0%` + filho `h-full` = altura 0. Browser colapsava fallback invisivel. | `MessageTimeline.tsx` | #342: parent flex-col, child flex-1 |

## PRs

| PR | Branch | Status | O que fez |
|----|--------|--------|-----------|
| #333 | `main` | MERGED | Review fixes Gemini + Qodo (null checks, useEffect, import facade, backendKey) |
| #334 | `main` | MERGED | Remove PWA/SW (VitePWA, manifest.json, sw.js) + hard invariant |
| #335 | `main` | MERGED | Gemini follow-up: display:none, useMemo puro, ES2024, optional chaining |
| #342 | `codex/finalize-waterfall-ui` | MERGED | finalizeWaterfallUI + static fallback fix + LayoutTrace + DOM safety net |

## Bugs secundarios corrigidos

- AbortError pos-render: `debug` (nao `error`)
- ContinuityQuestion JSON truncado: `debug` (nao `warn`)
- Mock scoutDiag: adicionado `debug: vi.fn()` (3 arquivos de teste)
- `absolute inset-0` revertido para `h-full w-full`

## Decisoes arquiteturais ativas

1. `abortControllerRef` pertence ao ciclo de vida do `processMessage`, NUNCA ao helper de UI
2. DOM cleanup via `querySelector` direto (3 seletores), NUNCA `TreeWalker(document.body)`
3. DOM cleanup display:none e safety net; React render condition e primario
4. Hard invariant como airbag: condicoes observaveis do waterfall disparam liberacao forcada
5. LayoutTrace como ferramenta de diagnostico para painel branco pos-waterfall

## Pendenciais nao bloqueantes

- Kill-switch sw.js: manter 1-2 releases, depois remover
- ContinuityQuestion JSON truncado: fallback funcional, logar como debug
- AbortError CNPJ lookup: debug, nao error
- foundationCacheName null em producao
- `scoutagro.vercel.app` NÃO esta nos domains do projeto Vercel — alias orfao

## Licoes-chave (16)

| # | Licao |
|---|-------|
| 1 | NUNCA nullificar `abortControllerRef` fora do `processMessage:finally` |
| 2 | NUNCA usar `TreeWalker`/`document.body` scan para DOM cleanup (bloqueia main thread) |
| 3 | DOM cleanup DOM display:none e safety net; React render condition e primario |
| 4 | `h-full` nao funciona em filho de flex item com `flex-basis:0%` (height:100% de 0 = 0) |
| 5 | `absolute inset-0` causa display:none em certos contextos de flex |
| 6 | Service Worker CacheFirst e perigoso em apps com deploy frequente |
| 7 | Preview sem SW vs Producao com SW cria falsa confianca |
| 8 | Preview Vercel revela bugs que testes unitarios nao pegam |
| 9 | Optional chaining deve ir ate o fim da cadeia (`.trim()?.length`) |
| 10 | `useMemo` deve ser puro; side effects em `useEffect` |
| 11 | Mock de scoutDiag precisa incluir `debug: vi.fn()` |
| 12 | Sempre verificar hostname em logs de diagnostico |
| 13 | Hard invariant como airbag contra UI quebrada apos waterfall |
| 14 | DOM cleanup com `.remove()` quebra reconciliacao do React |
| 15 | `hasRenderableBotMessage` deve ser condicao em TODOS os gates de loading |
| 16 | Vercel alias orfao pode servir codigo sem estar no projeto |

## Arquivos alterados (PR #342)

| Arquivo | Mudanca |
|---------|---------|
| `features/dossier/waterfall-orchestrator.ts` | finalizeWaterfallUI sem nullificar abortControllerRef + DOM safety net querySelector |
| `components/MessageTimeline.tsx` | Static fallback: parent flex-col + child flex-1; revert absolute inset-0 |
| `components/MessageTimeline.tsx` | LayoutTrace: instrumentacao para diagnosticar painel branco |
| tests (3 files) | Adicionado `debug: vi.fn()` ao mock de scoutDiag |

## Links

- PR #333: https://github.com/brunolimaff-jpg/NOVO-APP/pull/333
- PR #334: https://github.com/brunolimaff-jpg/NOVO-APP/pull/334
- PR #335: https://github.com/brunolimaff-jpg/NOVO-APP/pull/335
- PR #342: https://github.com/brunolimaff-jpg/NOVO-APP/pull/342
- Vault sessoes: `Bruno Vault/20-SESSOES/2026-06/2026-06-05T19-30-00-NOVO-APP-overlay-hero-camada4-static-fallback.md`
- Vault licoes: `Bruno Vault/30-LICOES/LICOES-SW-CACHEFIRST-OVERLAY-PWA-2026-06-05.md` (16 licoes)
