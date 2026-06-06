# Progress

Last updated: 2026-06-06 -- Investigacao freeze intermitente. PR #344 mergeda.

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

- **Freeze intermitente pos-waterfall**: instrumentacao diagnostica em `fix/diagnostic-render-freeze` com `freezeDiag.ts`
- **PR #345**: fix CSS static fallback (`absolute inset-0` -> `flex-1 min-h-0 w-full`), validada, aguardando merge

## Concluido

| Data       | Marco                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| 2026-06-06 | **PR #344 mergeda** — truncamento frontend de dossie (3 secoes + Ver relatorio completo)             |
| 2026-06-06 | **Foundation Cache habilitado em producao** — mitigacao de latencia Gemini                           |
| 2026-06-06 | **PR #345 criada e validada** — fix CSS static fallback (2/2 manual SUCESSO)                         |
| 2026-06-06 | **Branch `fix/diagnostic-render-freeze` criada** — instrumentacao diagnostica do freeze intermitente |
| 2026-06-06 | **Hipotese freeze**: react-markdown processa ~8k chars por secao sincronamente, bloquela main thread |
| 2026-06-05 | **Camada 5 descoberta**: flushDiagnosticsNow sincrono pos-setState bloqueava React re-render         |
| 2026-06-05 | **PR #343 MERGEADA** — setTimeout swap (flush ANTES do setState)                                     |
| 2026-06-05 | **PR #342 MERGEADA** — finalizeWaterfallUI + static fallback fix + LayoutTrace                       |
| 2026-06-05 | **Bug P0 completamente resolvido** (4 camadas, 4 PRs mergeadas #333-#342)                            |

## Licoes registradas

Vault: `Bruno Vault/30-LICOES/LICOES-SW-CACHEFIRST-OVERLAY-PWA-2026-06-05.md`
Nova (freeze intermitente): a ser registrada quando reproduzido com instrumentacao.

## Comandos de validacao

```bash
npm run typecheck
npm test
npm run build
```
