# AGENTS.md

## Overview

Senior Scout 360 is a React 19 + TypeScript + Vite web app for commercial intelligence in agribusiness.

## Repo layout

- `App.tsx` is the main app orchestrator.
- `components/`, `contexts/`, `hooks/`, `services/`, `prompts/`, `utils/`, `api/`, and `tests/` live at the repo root.
- Do not assume a `src/` directory for application code in this repository.
- `services/geminiService.ts` is the stable public AI façade; internal orchestration modules live under `services/gemini/`.
- `hooks/useChat.ts` is legacy and must not gain new production consumers.

## Persistent memory protocol

Repo-local memory is the canonical cross-session handoff for agents in this project.

- At the start of every session, read `.agents/memory/activeContext.md` and `.agents/memory/progress.md` before diagnosing, planning, or editing.
- Treat `.agents/memory/decisions.md` as durable project context for decisions that should survive beyond the current sprint.
- Use `HANDOFF_AI.md` as the canonical quick-entry handoff, then follow any source-of-truth docs it references.
- Use `docs/obsidian/00-MASTER.md` as the visual navigation layer for architecture + roadmap after reading the canonical handoff sources above. Do not treat it as a higher-priority source than `HANDOFF_AI.md`, `.agents/memory/*`, or `docs/ai-context/refactor/*`.
- Before planning implementation work, use `plan-work` when available in the global environment.
- At task close, update memory with what changed, what validation ran, residual risks, and the immediate next step.
- Do not treat root `PLAN.md` as canonical unless one of the memory files or handoff docs explicitly references it.

## Useful commands

```bash
npm run dev
npm run build
npm run test
npm run typecheck
npm run lint
```

## Known constraints

- Vercel serverless handlers live in `api/*.ts`.
- Vercel is the real runtime environment for production validation; local `npm run dev` is only a frontend convenience and does not emulate all production serverless behavior.
- Auth in this repo is local-only via `contexts/OperatorContext.tsx`; Clerk is not active in runtime.
- No standard external AI integration is required for this repo.
- Skill governance for this repo lives in `docs/SKILLS-GOVERNANCE.md`.
- Do not assume any specific global skill set is available or required.

## Working rules

- Read the current code before editing.
- Keep prompts in `prompts/`.
- Keep secrets out of frontend code.
- Avoid empty catches.
- Prefer typed solutions over `any`.
- Do not revert unrelated local changes.
