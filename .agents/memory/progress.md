# Progress

Last updated: 2026-05-29 15:30 (PR #312 mergeada)

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.  
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

| Item                                           | Status                             | Link                                                          |
| ---------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| PR #302 `perf/dossier-link-integrity-and-memo` | Merce merge (pendente desde 27/05) | PR #302                                                       |
| Branch `feat/crm-supabase-migration`           | WIP (com stashed changes)          | `docs/superpowers/plans/2026-05-29-crm-supabase-migration.md` |
| P0 withTimeout (api/gemini.ts:416, :491)       | Documentado, nao corrigido         | `30-DECISOES/ACHADO-P0-WITHTIMEOUT-ABORTSIGNAL-2026-05-28.md` |

## Concluido recente

| Data       | Marco                                                                                                                                                                                                                                                  | Link                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 2026-05-29 | **PR #312 MERGEADA** — `feat/dossier-tracking-events` (squash `c35b45b`): trackOperatorEvent fire-and-forget, stale closure fix, benchmark timeout fix (20s + 1 retry)                                                                                 | `HANDOFF_AI.md`, PR #312, vault `2026-05-29T15-30-00-fechamento-pr312-dossier-tracking-events.md` |
| 2026-05-29 | **PR #311 MERGEADA** — `7007d0e`: extrai status HTTP de geminiProxy para evitar UNKNOWN                                                                                                                                                                | vault `2026-05-29T15-00-00-fechamento-pr311-pr312-supabase-cleanup.md`                            |
| 2026-05-29 | **PR #310 MERGEADA** — `bdbefaf`: classificacao erro billing Gemini + fallback de chave + auto-retry                                                                                                                                                   | vault `2026-05-29T12-30-00-fechamento-pr310.md`                                                   |
| 2026-05-29 | **PR #309 MERGEADA** — `e312a4d`: tracking operadores Supabase, diagnostico, qualidade anti-regressao                                                                                                                                                  | vault `2026-05-29T15-00-00-fechamento-pr311-pr312-supabase-cleanup.md`                            |
| 2026-05-28 | **Automacoes .claude/ + trava commits + code review max-effort + plano merge** — `.claude/settings.json`, `check-branch-health.sh` (5/8), code review 9 angulos (18 findings)                                                                          | vault `2026-05-28T23-59-00-automacoes-claude-code-trava-commits.md`                               |
| 2026-05-28 | **Code review 61 arquivos + 10 bugs corrigidos** — ff() console.warn, touch cleanup, initSessionTracking async, void promises .catch(), finally try/catch, AbortController, AbortSignal.timeout, setupVisibilityTracking cleanup, App.tsx toast+useRef | commits `718ff20` `3cd37ce` `9137a3c` `d0f1980` `d2a3a13` `7700cfd` `15379b0`                     |
| 2026-05-28 | **Testes anti-regressao 5 fases** — contratos, E2E, data-testid, benchmarks                                                                                                                                                                            | vault `2026-05-28T22-30-00-test-anti-regression.md`                                               |
| 2026-05-27 | **PR #302 PRONTA** — commits `8cdc326` (perf O(1) + React.memo), `7f098e8` (review + freeze 95%), `f3679b7` (tela branca)                                                                                                                              | PR #302                                                                                           |
| 2026-05-27 | **PR #301 MERGEADA** — squash `29e0a8b`: integridade links, pool fontes, rodape, fallback continue                                                                                                                                                     | vault `2026-05-27T14-00-00-dossier-link-integrity-fontes-pr301.md`                                |
| 2026-05-26 | **PR #300 MERGEADA** — fix sync dossie (`22cc0b1`)                                                                                                                                                                                                     | `docs/handoffs/2026-05-26-dossier-sync-pr300.md`                                                  |
| 2026-05-26 | **PR #299 MERGEADA** — `fix/filiais-root-branch-count` (16 commits squash) em `f029893`                                                                                                                                                                | vault `2026-05-26T21-00-00-filiais-root-branch-count-pr299.md`                                    |
| 2026-05-26 | **PR #298 MERGEADA** — `fix/export-dropdown-polish` em `8990f1c`                                                                                                                                                                                       | `components/ExportDropdown.tsx`                                                                   |

## Comandos de validacao

```bash
npm run typecheck
npm test
npm run test:contracts
npm run test:e2e:blank
npm run test:e2e:loading
npm run test:e2e:errors
npm run lint
npm run build
```
