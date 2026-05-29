# Senior Scout 360

Senior Scout 360 is a React 19 + TypeScript + Vite web app for commercial intelligence in agribusiness. The product helps Senior sellers investigate prospects, build dossier-style analysis, qualify accounts with Score PORTA, and support follow-up through CRM and radar workflows.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Main commands:

```bash
npm run test
npm run typecheck
npm run build
npm run lint
```

## Project shape

- `App.tsx`: main app orchestrator
- `components/`: UI and view composition
- `services/`: AI, data, and backend-facing logic
- `prompts/`: prompt assets and prompt builders
- `api/`: Vercel serverless handlers
- `tests/` and `tests-e2e/`: automated validation

## AI operating model

This repo intentionally uses a minimal AI setup:

- `GitHub` is the primary external integration.
- Repo-local skills are curated and versioned under `.agents/skills/`.
- Global `~/.codex/skills` content must not be required to operate the repo.
- No extra MCP servers are configured as part of the standard project setup.

The canonical skill policy lives in [`docs/SKILLS-GOVERNANCE.md`](./docs/SKILLS-GOVERNANCE.md).

## Obsidian repo graph

The repo now includes a versioned Obsidian documentation layer under [`docs/obsidian/`](./docs/obsidian/).

- Start from [`docs/obsidian/00-MASTER.md`](./docs/obsidian/00-MASTER.md) for the architecture + roadmap graph entrypoint.
- Treat it as a navigation layer. The canonical live status still lives in `HANDOFF_AI.md`, `.agents/memory/*`, and `docs/ai-context/refactor/*`.
- Validate the graph contract with `npm run docs:obsidian:check`.

## Core docs

| Document                                                                           | Purpose                                              |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`AGENTS.md`](./AGENTS.md)                                                         | Primary repo instructions                            |
| [`docs/GUIA-INICIANTE.md`](./docs/GUIA-INICIANTE.md)                               | Fast onboarding                                      |
| [`docs/SKILLS-GOVERNANCE.md`](./docs/SKILLS-GOVERNANCE.md)                         | Allowed skills and environment policy                |
| [`docs/obsidian/00-MASTER.md`](./docs/obsidian/00-MASTER.md)                       | Obsidian graph entrypoint for architecture + roadmap |
| [`docs/obsidian/OBSIDIAN-README.md`](./docs/obsidian/OBSIDIAN-README.md)           | Vault usage and maintenance contract                 |
| [`HANDOFF_AI.md`](./HANDOFF_AI.md)                                                 | Stable entrypoint for AI handoff                     |
| [`ARQUITETURA.md`](./ARQUITETURA.md)                                               | Technical architecture                               |
| [`docs/ai-context/refactor/00-README.md`](./docs/ai-context/refactor/00-README.md) | Refactor program context                             |

## CI and delivery

- CI checks live in `.github/workflows/ci.yml`.
- `main` should remain the protected production branch.
- Prefer merging only after `test`, `typecheck`, and `build` are green.
