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

Sprint 3 / corte final is in progress on branch `codex/sprint-3-message-orchestrator`.

- Goal: move the standard send-message orchestration into `features/chat/message-orchestrator.ts`.
- Keep the modular dossier waterfall, PORTA exported helpers, and Deep Dive wrapper in `App.tsx`.
- Preserve `ChatInterfaceProps` and the public facade in `services/geminiService.ts`.

## Immediate next step

Open and review the final Sprint 3 PR, then run the integrated manual validation for:

1. initial investigation
2. follow-up
3. retry
4. full dossier
5. remote save
6. feedback

If that passes, mark Sprint 3 as done and prepare Sprint 4 planning.
