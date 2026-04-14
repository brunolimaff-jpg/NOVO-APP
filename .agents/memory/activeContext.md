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

Finish and merge the repo-local agent memory and `plan-work` PR:

- Keep `.agents/memory/` tracked in the repo.
- Keep `.agents/skills/plan-work/` tracked in the repo.
- Keep `HANDOFF_AI.md`, `docs/SKILLS-GOVERNANCE.md`, `skills-lock.json`, and `AGENTS.md` aligned.

## Immediate next step

After this PR lands, restart Codex on each machine so the repo-local `plan-work` skill is discovered, then start planning Sprint 3 using the refactor docs above.
