# Progress

Last updated: 2026-05-27

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.  
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

| Item | Status | Link |
|------|--------|------|
| PR #302 `perf/dossier-link-integrity-and-memo` | **PRONTA PARA MERGE** — 3 review comments resolvidos, deploy Vercel verde | https://github.com/brunolimaff-jpg/NOVO-APP/pull/302 |
| Branch residual UX waterfall `fix/dossier-link-integrity-fontes` | 10 commits nao mergeados em `main` — decidir destino | branch `fix/dossier-link-integrity-fontes` |

## Concluido recente

| Data | Marco | Link |
|------|-------|------|
| 2026-05-27 | **PR #302 PRONTA** — commits `8cdc326` (perf O(1) + React.memo), `7f098e8` (review + freeze 95%), `f3679b7` (tela branca) | PR #302 |
| 2026-05-27 | **PR #301 MERGEADA** — squash `29e0a8b`: integridade links, pool fontes, rodape, fallback continue | `docs/handoffs/2026-05-27-dossier-link-integrity-pr301.md`, vault `20-SESSOES/2026-05/2026-05-27T14-00-00-dossier-link-integrity-fontes-pr301.md` |
| 2026-05-27 | **PR #301 aberta** — integridade links, footer Fontes, preview waterfall (local pendente push) | `docs/handoffs/2026-05-27-dossier-link-integrity-pr301.md` |
| 2026-05-26 | **PR #300 MERGEADA** — fix sync dossiê (`22cc0b1`): mergeChatSessions, pull guard, waterfall flush | `docs/handoffs/2026-05-26-dossier-sync-pr300.md` |
| 2026-05-26 | **PR #299 MERGEADA** — `fix/filiais-root-branch-count` (16 commits squash) em `f029893`: rootBranchCount, React.memo, SyncIndicator icone, LoadingSmart, failedCnaeRef, badge filial | `HANDOFF_AI.md`, vault `20-SESSOES/2026-05/2026-05-26T21-00-00-filiais-root-branch-count-pr299.md` |
| 2026-05-26 | **PR #299 criada** — 14 commits: rootBranchCount no SocietaryGraph, Math.max countCompanyFilials, failedCnaeRef, badge filial Gemini, React.memo SocietaryMap+Matrix, SyncIndicator icone, LoadingSmart progresso, CNAE loop kill, useCallback | `features/dossier/societaryGraph.ts`, `features/dossier/SocietaryMatrix.tsx`, vault `20-SESSOES/2026-05/2026-05-26T21-00-00-filiais-root-branch-count-pr299.md` |
| 2026-05-26 | **PR #298 MERGEADA** — `fix/export-dropdown-polish` (auto-dismiss, badge Recomendado, CSS extraido) em `8990f1c` | `HANDOFF_AI.md`, `components/ExportDropdown.tsx`, `utils/printExport.css.ts` |
| 2026-05-26 | **12 PRs mergeadas** (#287-#297) — export HTML redesign, teia mapa render, mapa societario UX, Trilha A, lint, foundation cache, etc. | `HANDOFF_AI.md` |

## Comandos de validacao

```bash
npm run typecheck
npm test
npm run lint
npm run build
```
