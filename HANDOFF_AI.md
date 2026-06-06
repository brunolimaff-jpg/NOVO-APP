# Handoff Final -- Bug P0 Overlay Hero RESOLVIDO + setTimeout swap

**Bug P0**: overlay/spinner hero preso apos waterfall completar em producao. 5 PRs mergeadas (#333, #334, #335, #342, #343). Chrome mostrava "Pagina sem resposta" com dossie Scheffer ~30KB.

## Root Cause (5 camadas)

| #   | Causa                                                                                                                                                                                                                                                                                     | Onde                        | Fix (PR)                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------- |
| 1   | **Service Worker CacheFirst** servia bundles JS/CSS antigos em producao. Preview sem SW nunca reproduzia.                                                                                                                                                                                 | VitePWA + `public/sw.js`    | #334: remove PWA/SW                                   |
| 2   | **Gap waterfall vs setIsLoading**: `finalizeWaterfallUI` no finally sem bridge entre completar waterfall e liberar overlay                                                                                                                                                                | `waterfall-orchestrator.ts` | #342: finalizeWaterfallUI incondicional no finally    |
| 3   | **abortControllerRef nullificado** pelo finalizeWaterfallUI: `isAbort=true` falso -> `flushDiagnosticsNow` nunca chamado                                                                                                                                                                  | `waterfall-orchestrator.ts` | #342: abortControllerRef so no processMessage:finally |
| 4   | **Static fallback display:none**: `flex-1` pai com `flex-basis:0%` + filho `h-full` = altura 0. Browser colapsava fallback invisivel.                                                                                                                                                     | `MessageTimeline.tsx`       | #342: parent flex-col, child flex-1                   |
| 5   | **flushDiagnosticsNow sincrono bloqueia React render**: chamado no mesmo tick que `setIsLoading(false)`. setState disparava render sincrono, mas flush ocupava main thread antes do render completar. Playwright reproduziu: `post-render-scheduled` aparecia, `post-render-fired` nunca. | `message-orchestrator.ts`   | #343: setTimeout(0) agendado ANTES do setState        |

O timer entra na macrotask queue antes do React render comecar. O render ocorre. O timer dispara depois que o render termina e devolve controle ao event loop.

## PRs

| PR   | Branch                        | Status | O que fez                                                                                        |
| ---- | ----------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| #333 | `main`                        | MERGED | Review fixes Gemini + Qodo (null checks, useEffect, import facade, backendKey)                   |
| #334 | `main`                        | MERGED | Remove PWA/SW (VitePWA, manifest.json, sw.js) + hard invariant                                   |
| #335 | `main`                        | MERGED | Gemini follow-up: display:none, useMemo puro, ES2024, optional chaining                          |
| #342 | `codex/finalize-waterfall-ui` | MERGED | finalizeWaterfallUI + static fallback fix + LayoutTrace + DOM safety net                         |
| #343 | `codex/finalize-waterfall-ui` | MERGED | setTimeout swap: flushDiagnosticsNow deferido com setTimeout(0) para desbloquear React re-render |

## Bugs secundarios corrigidos

- AbortError pos-render: `debug` (nao `error`)
- ContinuityQuestion JSON truncado: `debug` (nao `warn`)
- Mock scoutDiag: adicionado `debug: vi.fn()` (3 arquivos de teste)
- `absolute inset-0` revertido para `h-full w-full`
- `flushDiagnosticsNow` sincrono: movido para `setTimeout(0)` (PR #343)

## Decisoes arquiteturais ativas

1. `abortControllerRef` pertence ao ciclo de vida do `processMessage`, NUNCA ao helper de UI
2. DOM cleanup via `querySelector` direto (3 seletores), NUNCA `TreeWalker(document.body)`
3. DOM cleanup display:none e safety net; React render condition e primario
4. Hard invariant como airbag: condicoes observaveis do waterfall disparam liberacao forcada
5. LayoutTrace como ferramenta de diagnostico para painel branco pos-waterfall
6. `flushDiagnosticsNow` deve ser deferido com `setTimeout(0)` e agendado ANTES do `setState`, nao depois

## Pendencias

| Item                                 | Status              | Acao                            |
| ------------------------------------ | ------------------- | ------------------------------- |
| PR #343 setTimeout swap              | ABERTA              | Code review + merge             |
| Kill-switch sw.js                    | MANTER 1-2 RELEASES | Remover depois                  |
| ContinuityQuestion JSON truncado     | DEBUG LOG           | Ja feito                        |
| AbortError CNPJ lookup               | DEBUG LOG           | Ja feito                        |
| foundationCacheName null em producao | INVESTIGAR          | Separado                        |
| `scoutagro.vercel.app` alias orfao   | INVESTIGAR          | Nao esta nos domains do projeto |

## Licoes-chave (17)

| #   | Licao                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | NUNCA nullificar `abortControllerRef` fora do `processMessage:finally`                                                                                                                                |
| 2   | NUNCA usar `TreeWalker`/`document.body` scan para DOM cleanup (bloqueia main thread)                                                                                                                  |
| 3   | DOM cleanup DOM display:none e safety net; React render condition e primario                                                                                                                          |
| 4   | `h-full` nao funciona em filho de flex item com `flex-basis:0%` (height:100% de 0 = 0)                                                                                                                |
| 5   | `absolute inset-0` causa display:none em certos contextos de flex                                                                                                                                     |
| 6   | Service Worker CacheFirst e perigoso em apps com deploy frequente                                                                                                                                     |
| 7   | Preview sem SW vs Producao com SW cria falsa confianca                                                                                                                                                |
| 8   | Preview Vercel revela bugs que testes unitarios nao pegam                                                                                                                                             |
| 9   | Optional chaining deve ir ate o fim da cadeia (`.trim()?.length`)                                                                                                                                     |
| 10  | `useMemo` deve ser puro; side effects em `useEffect`                                                                                                                                                  |
| 11  | Mock de scoutDiag precisa incluir `debug: vi.fn()`                                                                                                                                                    |
| 12  | Sempre verificar hostname em logs de diagnostico                                                                                                                                                      |
| 13  | Hard invariant como airbag contra UI quebrada apos waterfall                                                                                                                                          |
| 14  | DOM cleanup com `.remove()` quebra reconciliacao do React                                                                                                                                             |
| 15  | `hasRenderableBotMessage` deve ser condicao em TODOS os gates de loading                                                                                                                              |
| 16  | Vercel alias orfao pode servir codigo sem estar no projeto                                                                                                                                            |
| 17  | **`flushDiagnosticsNow` sincrono pos-setState bloqueia React re-render. Agendar `setTimeout(0)` ANTES do `setState`, nao depois. Se agendado depois, o setTimeout nunca roda ate o render terminar.** |

## Arquivos alterados (PR #343)

| Arquivo                                 | Mudanca                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `features/chat/message-orchestrator.ts` | flushDiagnosticsNow movido para setTimeout(0); agendado ANTES de setIsLoading(false) |
| `components/chat/MessageTimeline.tsx`   | Ajuste LayoutTrace (1 linha)                                                         |

## Links

- PR #333: https://github.com/brunolimaff-jpg/NOVO-APP/pull/333
- PR #334: https://github.com/brunolimaff-jpg/NOVO-APP/pull/334
- PR #335: https://github.com/brunolimaff-jpg/NOVO-APP/pull/335
- PR #342: https://github.com/brunolimaff-jpg/NOVO-APP/pull/342
- PR #343: https://github.com/brunolimaff-jpg/NOVO-APP/pull/343 (ABERTA)
- Vault sessoes: `Bruno Vault/20-SESSOES/2026-06/2026-06-05T19-30-00-NOVO-APP-overlay-hero-camada4-static-fallback.md`
- Vault licoes: `Bruno Vault/30-LICOES/LICOES-SW-CACHEFIRST-OVERLAY-PWA-2026-06-05.md`
