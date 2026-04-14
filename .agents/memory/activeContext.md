# Active Context

Last updated: 2026-04-14

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

Current sprint from the board: Sprint 3, extract chat flow from `App.tsx` into `features/chat/*` in small, validated slices.

## Current task

Sprint 3 / corte 1 is in progress on branch `codex/sprint-3-chat-loading`.

- Goal: extract chat loading/progress state from `App.tsx` into `features/chat/loading-progress.ts`.
- Keep `App.tsx` as orchestration facade for send/retry/dossier/PORTA during this cut.
- Keep `components/ChatInterface.tsx` public props unchanged.

## Immediate next step

Open/review the PR for the loading cut. After it lands, continue Sprint 3 with the next small slice: session/save remote into `features/chat/session-controller.ts`.
