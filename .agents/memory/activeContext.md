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

The repo is on the post-`#222` state in `main`, with Sprint 3 closed and Sprint 4 open.

- Goal: execute Sprint 4 in waves; Onda 1 of the dossier extraction is now implemented and validated, and Onda 2 is next.
- The canonical dossier fixture lives under `tests/fixtures/dossier/scheffer-04733767000180/`.
- The practical day-to-day command is `npm run test:dossier`.
- Sprint 4 uses `Context + Reducer` for `stores/*`; do not add `zustand`.
- Every wave must end with validation, docs/memory sync, and a dedicated PR.
- Onda 1 moved the dossier runtime into `features/dossier/*` and reduced `App.tsx` to wiring for that boundary.

## Immediate next step

1. open/review/merge the Sprint 4 / Onda 1 PR
2. implement Sprint 4 / Onda 2 with `stores/*` plus feature error boundaries
3. validate Onda 2 with `npm run test:dossier`, `npm run test`, `npm run typecheck`, and `npm run build`
