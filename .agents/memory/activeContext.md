# Active Context

Last updated: 2026-04-15

## Current operating context

This repo now uses repo-local memory plus canonical handoff docs so future Codex sessions can resume on any machine.

Read order for a new session:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`

## Current refactor sprint

The structural refactor program is active. The canonical live status is in:

- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/06-HANDOFF.md`

Sprint 3 chat extraction is merged in `main` through PR `#221`, and the offline dossier golden regression is merged through PR `#222`.
Sprint 3 is now `done` after the integrated manual validation completed on `2026-04-15`.
Sprint 4 is now `active`.

## Current task

The repo is on the post-`#226` state in `main`, with Sprint 3 closed and Sprint 4 open.

- Goal: finish Sprint 4 / Onda 1 by opening and reviewing the PR that extracts dossier runtime into `features/dossier/*`.
- `features/dossier/waterfall-orchestrator.ts` now owns `runMegaPromptWaterfall`.
- `features/dossier/benchmark-stage.ts` and `features/dossier/porta-reconciliation.ts` own benchmark and PORTA recovery logic.
- The canonical dossier fixture lives under `tests/fixtures/dossier/scheffer-04733767000180/`.
- The practical day-to-day command is `npm run test:dossier`.
- Sprint 4 uses `Context + Reducer` for `stores/*`; do not add `zustand`.
- Every wave must end with validation, docs/memory sync, and a dedicated PR.

## Immediate next step

1. open/review the Sprint 4 / Onda 1 PR and monitor CI/comments
2. if runtime confirmation is needed, use the manual scope: dossier completo, follow-up, retry, exportacao, continuity suggestions, remote persistence
3. after merge, start Sprint 4 / Onda 2 with `stores/*` plus feature error boundaries
