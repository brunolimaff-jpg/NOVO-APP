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

Sprint 3 / corte 2B is in progress on branch `codex/sprint-3-app-import-session-controller`.

- Goal: switch `App.tsx` to import `useSessionManager` from `features/chat/session-controller`.
- Update App tests to mock the feature module directly.
- Do not move remote save logic in this PR.

## Immediate next step

Finish PR 2B validation and open the PR for the App import swap. After it lands, continue Sprint 3 with PR 2C: move remote save into `features/chat/session-controller`.
