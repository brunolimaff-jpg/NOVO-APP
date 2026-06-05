# Progress

Last updated: 2026-06-05 — PR #342 aberta. Bug P0 overlay hero resolvido (3 camadas).

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` — ver `docs/OBSIDIAN_VAULT.md`.
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

| Data | Marco | Link |
|------|-------|------|
| 2026-06-05 | **PR #342 ABERTA** — `codex/finalize-waterfall-ui`: finalizeWaterfallUI zerando atomicamente todos os estados de loading. DOM safety net com querySelector (sem TreeWalker). abortControllerRef nao nullificado. AbortError/ContinuityQuestion como debug. | PR #342 |
| 2026-06-05 | **PR #335 MERGEADA** — Gemini follow-up: display:none, useMemo puro, optional chaining ate o fim, ES2024 | PR #335 |
| 2026-06-05 | **PR #334 MERGEADA** — Remove PWA/SW + hard invariant (setIsLoading + DOM cleanup) + kill-switch sw.js | PR #334 |
| 2026-06-05 | **PR #333 MERGEADA** — Review fixes Gemini + Qodo: null checks, useEffect, import facade, backendKey | PR #333 |

## Concluido recente

| Data | Marco |
|------|-------|
| 2026-06-05 | Root Cause camada 3 descoberta: abortControllerRef nullificado pelo finalizeWaterfallUI causava isAbort=true → flushDiagnosticsNow nunca chamado |
| 2026-06-05 | Bug P0 overlay hero completamente resolvido (3 camadas de causa, 4 PRs) |
| 2026-06-05 | PWA/SW removido do projeto. CacheFirst em producao era causa raiz primaria |
| 2026-06-05 | Hard invariant adicionado ao waterfall-orchestrator como airbag |
| 2026-06-03 | PR #331 mergeada — handoff estatico sincrono pos-waterfall |
| 2026-06-03 | PR #330 mergeada — blank panel fix |

## Comandos de validacao

```bash
npm run typecheck
npm test
npm run build
```
