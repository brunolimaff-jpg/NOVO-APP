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

Sprint 3 / corte 2C is in progress on branch `codex/sprint-3-session-remote-save`.

- Goal: move remote session save state/action into `features/chat/session-controller`.
- Keep `ChatInterfaceProps` and the visible save contract unchanged.
- Do not touch the standard send-message flow in this PR.

## Immediate next step

Finish PR 2C validation and open the PR for remote save extraction. After it lands, run the manual session-package validation and then continue Sprint 3 with feedback actions.
