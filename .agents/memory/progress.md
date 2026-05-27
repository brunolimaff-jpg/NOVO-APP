# Progress

Last updated: 2026-05-27

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.  
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

| Item | Status | Link |
|------|--------|------|
| PR #301 integridade links + fontes | branch `fix/dossier-link-integrity-fontes`, CI verde | `docs/handoffs/2026-05-27-dossier-link-integrity-pr301.md` |

## Concluido recente

| Data | Marco | Link |
|------|-------|------|
| 2026-05-27 | **PR #301 aberta** — integridade links, footer Fontes, preview waterfall (local pendente push) | `docs/handoffs/2026-05-27-dossier-link-integrity-pr301.md` |
| 2026-05-26 | **PR #300 MERGEADA** — fix sync dossiê (`22cc0b1`): mergeChatSessions, pull guard, waterfall flush | `docs/handoffs/2026-05-26-dossier-sync-pr300.md` |
| 2026-05-26 | **PR #299 MERGEADA** — `fix/filiais-root-branch-count` (16 commits squash) em `f029893`: rootBranchCount, React.memo, SyncIndicator icone, LoadingSmart, failedCnaeRef, badge filial | `HANDOFF_AI.md`, vault `20-SESSOES/2026-05/2026-05-26T21-00-00-filiais-root-branch-count-pr299.md` |
| 2026-05-26 | **PR #299 criada** — 14 commits: rootBranchCount no SocietaryGraph, Math.max countCompanyFilials, failedCnaeRef, badge filial Gemini, React.memo SocietaryMap+Matrix, SyncIndicator icone, LoadingSmart progresso, CNAE loop kill, useCallback | `features/dossier/societaryGraph.ts`, `features/dossier/SocietaryMatrix.tsx`, vault `20-SESSOES/2026-05/2026-05-26T21-00-00-filiais-root-branch-count-pr299.md` |
| 2026-05-26 | **PR #298 MERGEADA** — `fix/export-dropdown-polish` (auto-dismiss, badge Recomendado, CSS extraido) em `8990f1c` | `HANDOFF_AI.md`, `components/ExportDropdown.tsx`, `utils/printExport.css.ts` |
| 2026-05-26 | **12 PRs mergeadas** (#287-#297) — export HTML redesign, teia mapa render, mapa societario UX, Trilha A, lint, foundation cache, etc. | `HANDOFF_AI.md` |
| 2026-05-26 | **PR #298 criada** — auto-dismiss 5s no ExportDropdown, badge "Recomendado", CSS editorial extraido para `utils/printExport.css.ts` | `components/ExportDropdown.tsx`, `utils/printExport.css.ts` |
| 2026-05-26 | PR #297 merged — redesign exportação HTML editorial + ExportDropdown | vault `20-SESSOES/2026-05/2026-05-26T19-00-00-export-html-redesign-pr297.md` |
| 2026-05-26 | PR #296 -- fix teia mapa render UX: ghost text, flicker, LRU, per-instance cleanup | vault `2026-05-26-teia-mapa-render-pr296.md` |
| 2026-05-26 | PR #293 -- lint no-empty + merge redundant `if` blocks | merged em `main` |
| 2026-05-26 | Trilha A: auto-sync `user_context` (A1-A7), env Dev Vercel | `docs/handoffs/2026-05-26-trilha-a-supabase-user-context.md` |
| 2026-05-26 | SocietaryMap: KPIs, filtros, subgraphs Mermaid (`71a2ded`) | 45 testes locais green |

## Comandos de validacao

```bash
npm run typecheck
npm test
npm run lint
npm run build
```
