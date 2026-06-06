# Progress

Last updated: 2026-06-05 -- Bug P0 OVERLAY RESOLVIDO. PR #343 ABERTA (setTimeout swap).

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

- **PR #343** setTimeout swap: flushDiagnosticsNow deferido com setTimeout(0) para desbloquear React re-render pos-waterfall (branch: `codex/finalize-waterfall-ui`)

## Concluido

| Data | Marco |
|------|-------|
| 2026-06-05 | **Camada 5 descoberta**: flushDiagnosticsNow sincrono pos-setState bloqueava React re-render |
| 2026-06-05 | **PR #343 ABERTA** -- setTimeout swap: agendar flush ANTES do setState, nao depois |
| 2026-06-05 | **PR #342 MERGEADA** -- finalizeWaterfallUI sem nullificar abortControllerRef + static fallback fix + LayoutTrace |
| 2026-06-05 | **Camada 4 descoberta**: static fallback display:none por height:100% de flex-basis:0% = 0px |
| 2026-06-05 | **Bug P0 completamente resolvido**: 4 camadas de causa, 4 PRs mergeadas (#333, #334, #335, #342) |
| 2026-06-05 | PWA/SW removido do projeto. CacheFirst em producao era causa raiz primaria |
| 2026-06-05 | Hard invariant adicionado ao waterfall-orchestrator como airbag |
| 2026-06-03 | PR #331 mergeada -- handoff estatico sincrono pos-waterfall |
| 2026-06-03 | PR #330 mergeada -- blank panel fix |

## Licoes registradas

17 licoes do bug P0 + setTimeout swap em `Bruno Vault/30-LICOES/LICOES-SW-CACHEFIRST-OVERLAY-PWA-2026-06-05.md` e `CALIBER_LEARNINGS.md`.

## Comandos de validacao

```bash
npm run typecheck
npm test
npm run build
```
