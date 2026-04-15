# Decisions

Last updated: 2026-04-15

## 2026-04-14 - Repo-local memory v1

Decision: use repo-local Markdown files under `.agents/memory/` for persistent memory.

Reason: this is simple, inspectable, versionable, and works in Codex without requiring a database, MCP server, or global user profile state.

## 2026-04-14 - `plan-work` as default planning skill

Decision: install and prefer `plan-work` for implementation plans.

Reason: it is lightweight, Codex-oriented, and forces repo research, option analysis, Q&A, and a concrete implementation plan before edits.

## 2026-04-14 - Handoff hierarchy

Decision: `HANDOFF_AI.md` remains the canonical quick-entry handoff. `.agents/memory/*` is the short cross-session memory layer. The refactor program status remains canonical in `docs/ai-context/refactor/02-BOARD.md`, with risks in `03-OPEN-ITEMS.md` and next safe step in `06-HANDOFF.md`.

Reason: this avoids depending on chat memory while preserving the dedicated refactor board as the live source of truth.

## 2026-04-15 - Sprint 4 store strategy

Decision: Sprint 4 will introduce `stores/*` using `Context + Reducer` typed state instead of adding `zustand`.

Reason: the repo does not currently depend on `zustand`, the Sprint 4 goal is structural extraction rather than state-library rollout, and `Context + Reducer` keeps the state boundary explicit without mixing a new dependency into the dossier refactor.
