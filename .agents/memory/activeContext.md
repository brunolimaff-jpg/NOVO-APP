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

Sprint 3 / corte 3 is in progress on branch `codex/sprint-3-feedback-actions`.

- Goal: move feedback handlers into `features/chat/feedback-actions`.
- Keep `ChatInterfaceProps` and the remote feedback payload contract unchanged.
- Do not touch the standard send-message flow in this PR.

## Immediate next step

Open and review the feedback-actions PR. After it lands, run a short manual feedback validation and then finish Sprint 3 with the last cut for the standard send/message orchestration flow.
