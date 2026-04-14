# Decisions

Last updated: 2026-04-14

## 2026-04-14 - Repo-local memory v1

Decision: use repo-local Markdown files under `.agents/memory/` for persistent memory.

Reason: this is simple, inspectable, versionable, and works in Codex without requiring a database, MCP server, or global user profile state.

## 2026-04-14 - `plan-work` as default planning skill

Decision: install and prefer `plan-work` for implementation plans.

Reason: it is lightweight, Codex-oriented, and forces repo research, option analysis, Q&A, and a concrete implementation plan before edits.

## 2026-04-14 - `HANDOFF_AI.md` and `PLAN.md` are not canonical

Decision: future agents should not treat root `HANDOFF_AI.md` or `PLAN.md` as the primary sprint state unless `.agents/memory/` references them.

Reason: those files may be stale or task-specific; `.agents/memory/activeContext.md` and `.agents/memory/progress.md` are now the intended cross-session source of truth.
