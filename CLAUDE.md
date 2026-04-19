# Senior Scout 360 — AI Operating Guide

## Purpose

This file defines the minimal AI operating model for this repository.

The repo should reflect the real workflow in use today:
- `GitHub` is the primary external integration.
- Repo-local skills are intentionally curated and versioned.
- Global `~/.codex/skills` content must not be assumed.

## Read Order

Before substantial work, read in this order:

1. `AGENTS.md`
2. `docs/SKILLS-GOVERNANCE.md`
3. `HANDOFF_AI.md`
4. `docs/ai-context/refactor/00-README.md` when the task touches the refactor roadmap

## Approved AI Surface

### External integration

- `GitHub` plugin only

### Operational tools (non-AI integrations)

- `Obsidian Web Clipper` is approved for capture and triage workflows.
- Scope of the current standard: Phase 1 on Chromium desktop (Chrome/Edge/Brave).
- Operational contract and templates: `docs/obsidian/clipper/`.

### Repo-local skills allowlist

- `scoutagro-pilot-os`
- `clean-code`
- `codedocs`
- `code-review-mastery`
- `refactoring-patterns`
- `clean-architecture`

Do not assume any other local skill is active unless it is explicitly restored from archive.

## Current repo conventions

- App entrypoint: `App.tsx`
- Main chat UI: `components/ChatInterface.tsx`
- Main AI orchestration: `services/geminiService.ts`
- Prompts stay in `prompts/`
- Server handlers stay in `api/`
- Do not assume a `src/` directory

## Working rules

- Read current code before editing.
- Prefer typed solutions over `any`.
- Keep secrets out of frontend code.
- Avoid empty catches.
- Do not revert unrelated local changes.
- Keep architecture and refactor decisions aligned with `docs/ai-context/refactor/`.

## Commands

```bash
npm run dev
npm run test
npm run typecheck
npm run build
npm run lint
```

## Notes

- No extra MCP servers are configured in this repo today.
- `Obsidian Web Clipper` does not change the MCP policy and does not require `.mcp.json` changes in this phase.
- Playwright may still be used as a local test dependency, but not as an operational MCP standard.
- If the environment model changes, update `docs/SKILLS-GOVERNANCE.md` first, then align docs and lockfiles.
