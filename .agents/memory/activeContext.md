# Active Context

Last updated: 2026-04-14

## Current sprint

Repo-local agent memory and planning guardrails are being installed for Senior Scout 360.

## Current task

Implement the "Repo-Local Memory + plan-work Skill Setup" plan:

- Install `plan-work` under `.agents/skills/`.
- Create repo-local memory files under `.agents/memory/`.
- Update root `AGENTS.md` so future sessions read memory first and use `plan-work` before implementation planning.

## Active assumptions

- Repo-local Markdown memory is preferred over a global ledger or MCP memory server.
- `.agents/memory/` should be tracked with the repo unless the user later asks for private/local memory.
- `plan-work` is the default planning skill for normal implementation work.
- Existing `superhuman` remains available for larger multi-wave work.

## Immediate next step

After this setup is committed or accepted, ask future agents "onde parei?" and verify they answer from `.agents/memory/activeContext.md` and `.agents/memory/progress.md`.
