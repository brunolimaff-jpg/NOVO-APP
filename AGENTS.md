# AGENTS.md

## Overview

Senior Scout 360 is a React 19 + TypeScript + Vite web app for commercial intelligence in agribusiness.

## Repo layout

- `App.tsx` is the main app orchestrator.
- `components/`, `contexts/`, `hooks/`, `services/`, `prompts/`, `utils/`, `api/`, and `tests/` live at the repo root.
- Do not assume a `src/` directory for application code in this repository.

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
- `npm run dev` starts the Vite frontend; it does not emulate all production serverless behavior.
- Clerk requires valid configuration for full authenticated UI flows.

## Working rules

- Read the current code before editing.
- Keep prompts in `prompts/`.
- Keep secrets out of frontend code.
- Avoid empty catches.
- Prefer typed solutions over `any`.
- Do not revert unrelated local changes.
