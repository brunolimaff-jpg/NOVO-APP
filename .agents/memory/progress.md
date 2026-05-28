# Progress

Last updated: 2026-05-28 (18:30 UTC-3)

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.  
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento
| Data | P0 | Branch | Link |
|------|-----|--------|------|
| 2026-05-28 | **Reaplicar patches uteis de #307 em nova PR limpa** — remover DDG HTML da cascata, manter fadeoutTimerRef, cache delete, scoutDiag grounding. 6 arquivos. | (nova branch de main) | — |

## Concluido recente

| Data | Marco | Link |
|------|-------|------|
| 2026-05-28 | **PR #306 mergeada** — `feat: instrumentação completa do ciclo de vida do dossiê com persistência Supabase` (merge commit `45a7d81`). 4 commits, tabela `scout_diagnostics`, endpoint `/api/diagnostics`, logger cliente `diagnosticLog.ts`, instrumentação no `processMessage`, `LoadingSmart`, `MessageRow`. | PR #306 |
| 2026-05-28 | **PR #307 fechada + investigacao tela branca CONCLUIDA** — causa raiz confirmada: DDG HTML (`html.duckduckgo.com/html/`) bloqueado por IPs Vercel -> timeout runtime -> 504 Gateway Timeout. Vercel runtime logs confirmam 4 ocorrencias de 504. Branch `fix/consolidated-grounding-loading-fixes` fechada como "too polluted". Patches uteis pendentes de reaplicacao. | PR #307 (CLOSED) |
| 2026-05-28 | **PR #306 (4 commits)** — sistema de diagnostico persistente em 3 fases: (1) instrumentacao ciclo de vida + Supabase, (2) visibility tracking multi-evento, (3) heartbeat 30s + deadline 60s + server-side watermark + instrumentacao Virtuoso. Analise do planner revelou que bug raiz sao 6-7min de operacao client-side (Chrome throttles setTimeout apos 5min em background). | PR #306 |
| 2026-05-28 | **PR #305 merged** — `fix/loadingsmart-overlay-transition-trace` com 3 commits. Bug 1 (overlay orfao) resolvido via Promise.race 15s no deleteWaterfallFoundationCache. | PR #305 |
| 2026-05-27 | **PR #302 MERGEADA** — `8cdc326` (perf O(1) + React.memo), `7f098e8` (review + freeze 95%), `f3679b7` (tela branca) | PR #302 |
| 2026-05-27 | **Branch `fix/dossier-link-integrity-fontes` arquivada** — 13 commits obsoletos, conteudo ja entregue por PR #301 e PR #302 | — |
| 2026-05-27 | **PR #301 MERGEADA** — squash `29e0a8b`: integridade links, pool fontes, rodape, fallback continue | `docs/handoffs/2026-05-27-dossier-link-integrity-pr301.md`, vault `20-SESSOES/2026-05/2026-05-27T14-00-00-dossier-link-integrity-fontes-pr301.md` |
| 2026-05-27 | **PR #301 aberta** — integridade links, footer Fontes, preview waterfall (local pendente push) | `docs/handoffs/2026-05-27-dossier-link-integrity-pr301.md` |
| 2026-05-26 | **PR #300 MERGEADA** — fix sync dossie (`22cc0b1`): mergeChatSessions, pull guard, waterfall flush | `docs/handoffs/2026-05-26-dossier-sync-pr300.md` |
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
