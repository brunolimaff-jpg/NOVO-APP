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

Sprint 3 chat extraction is now merged in `main` through PR `#221`.

## Current task

This branch is `codex/dossier-markdown-golden-test` with PR `#222` open.

- Goal: add a deterministic offline regression harness for the canonical Scheffer dossier case (`CNPJ 04.733.767/0001-80`).
- The canonical fixture lives under `tests/fixtures/dossier/scheffer-04733767000180/`.
- The practical day-to-day command is `npm run test:dossier`.
- The test runs the dossier waterfall through `App`, exports markdown, and validates the result with a checklist-style golden helper instead of brittle full-text equality.

## Immediate next step

Review and merge PR `#222`.

After merge:

1. use `npm run test:dossier` as the fast regression check for this canonical dossier flow
2. only do manual dossier export validation when changing real dossier behavior
3. if the user wants broader coverage, add a second canonical fixture instead of weakening this one
