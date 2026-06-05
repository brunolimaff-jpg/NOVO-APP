# Active Context

Last updated: 2026-06-05 — Bug P0 resolvido. PR #342 aberta (finalizeWaterfallUI).

## Estado

- **PRs #333, #334, #335** mergeadas em `main`: overlay hero preso em producao corrigido
- **PR #342** aberta (branch `codex/finalize-waterfall-ui`): finalizeWaterfallUI refatorada com DOM safety net, TreeWalker removido, abortControllerRef nao nullificado, logs AbortError/ContinuityQuestion como debug
- Root Cause 3 camadas identificada: SW CacheFirst → gap waterfall/setIsLoading → abortControllerRef nullificado pelo finalizeWaterfallUI

## Root Cause camada 3 (nova)

FinalizeWaterfallUI nullificava `abortControllerRef`, o que fazia `isAbort=true` no `processMessage:finally` → `flushDiagnosticsNow` nunca era chamado. FIX: removida nullificacao do finalizeWaterfallUI. `abortControllerRef` so deve ser nullificado no proprio `processMessage:finally`.

## Proximo passo

1. Code review e merge da PR #342
2. Smoke producao no fluxo Scheffer
3. Monitorar Sentry/scout_diagnostics para `overlay-force-removed`
4. Remover kill-switch sw.js apos 1-2 releases

## Ponteiros

- PR #342: https://github.com/brunolimaff-jpg/NOVO-APP/pull/342 (ABERTA)
- Branch: `codex/finalize-waterfall-ui`
