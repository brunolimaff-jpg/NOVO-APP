# Decisions

Last updated: 2026-04-22

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

## 2026-04-19 - Obsidian repo graph as versioned navigation layer

Decision: add `docs/obsidian/` as a versioned Obsidian graph layer for architecture + roadmap, with `docs/obsidian/00-MASTER.md` as the entrypoint and `scripts/obsidian/check.mjs` as the local contract check.

Reason: this gives AI-led workflows and human reviewers a durable visual map of the repo while keeping canonical live status in `HANDOFF_AI.md`, `.agents/memory/*`, and `docs/ai-context/refactor/*` instead of duplicating authority into the graph layer.

## 2026-04-22 - Defer `mcp-server/` until after the sprint program

Decision: keep `mcp-server/` explicitly out of scope for Sprints 6-8, and do not surface it as a blocker, review target, or PR scope item during the remaining refactor track unless the user reprioritizes it.

Reason: the current priority is to finish the planned structural refactor first; `mcp-server/` is not shipping now and should not contaminate the active sprint branches.
