# Senior Scout 360 — AI Operating Guide

## Purpose

This file defines the minimal AI operating model for this repository.

The repo should reflect the real workflow in use today:
- No external AI integration is a repo requirement.
- Active skills are no longer versioned inside this repository.
- Global skill content may be used, but must not be assumed.

## Read Order

Before substantial work, read in this order:

1. `AGENTS.md`
2. `docs/SKILLS-GOVERNANCE.md`
3. `HANDOFF_AI.md`
4. `docs/ai-context/refactor/00-README.md` when the task touches the refactor roadmap
5. `docs/obsidian/00-MASTER.md` when the task touches architecture or roadmap navigation; treat it as a graph/index layer, not as the canonical live status

## Approved AI Surface

### External integration

- None required by default

### Repo skills

- No active repo-local skills are versioned in this repository.
- Historical materials under `.agents/skills/archive/` stay versioned as reference.
- If a global skill is used, treat it as environment-specific rather than repo-required.

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
- Playwright may still be used as a local test dependency, but not as an operational MCP standard.
- If the environment model changes, update `docs/SKILLS-GOVERNANCE.md` first, then align docs and lockfiles.
- If architecture or roadmap notes change, update `docs/obsidian/00-MASTER.md` and keep the linked Obsidian notes aligned with the canonical handoff/memory docs.
