# Active Context

Last updated: 2026-04-16

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

The repo is still on the post-`#227` baseline in `main`, but Sprint 4 / Onda 2 is now implemented on branch `codex/sprint4-wave2-stores-boundaries`.

- `stores/chatStore.tsx` now owns session/message/loading state plus operational refs.
- `stores/dossierStore.tsx` now owns export/save status state.
- `App.tsx` now consumes `useChatStore()` and `useDossierStore()` while keeping shell-only UI local.
- `ChatErrorBoundary.tsx` and `DossierErrorBoundary.tsx` are wired in the real render path.
- `components/ErrorBoundary.tsx` now shares audit/persistence helpers through `utils/errorBoundaryAudit.ts`.
- The canonical dossier fixture still lives under `tests/fixtures/dossier/scheffer-04733767000180/`.
- The practical day-to-day command remains `npm run test:dossier`.
- Sprint 4 uses `Context + Reducer` for `stores/*`; do not add `zustand`.
- Automated gates for Onda 2 passed on `2026-04-16`; the remaining step before merge is PR/manual runtime validation.

## Immediate next step

1. open/review the dedicated PR for `codex/sprint4-wave2-stores-boundaries`
2. run the Onda 2 manual runtime pass in preview/Vercel, focusing on chat shell recovery, dossier rendering fallback, export/save remoto, and the hero loading overlay
3. after merge, sync board/handoff/memory again and only then open Sprint 5 planning
