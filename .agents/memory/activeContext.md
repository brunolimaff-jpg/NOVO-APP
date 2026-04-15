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

## Current task

The repo is on the post-`#222` state in `main`.

- Goal: close Sprint 3 operationally with the remaining integrated manual validation, then plan Sprint 4 (`features/dossier/*`).
- The canonical dossier fixture lives under `tests/fixtures/dossier/scheffer-04733767000180/`.
- The practical day-to-day command is `npm run test:dossier`.
- The user reported the feedback checkpoint as manually validated on `2026-04-15`, but Sprint 3 still needs the full integrated manual pass before it can move to `done`.

## Immediate next step

1. run the integrated manual validation for Sprint 3 in runtime real
2. if it passes, mark Sprint 3 as `done` in the canonical docs/memory
3. then start Sprint 4 planning, keeping `npm run test:dossier` as the fast dossier regression check
