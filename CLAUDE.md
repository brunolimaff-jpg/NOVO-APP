# Senior Scout 360 - AI Context Guide

## What this project is

Senior Scout 360 is a commercial intelligence app for account executives focused on agribusiness accounts. It combines AI-assisted investigation, scoring, dossier generation, Radar monitoring, and a lightweight CRM workflow.

Production app: `https://scoutagro.vercel.app`

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS
- Clerk
- Google Gemini
- Pinecone
- Vercel serverless functions in `api/*.ts`
- Vitest

## Repository structure

- `App.tsx`: main app orchestration
- `components/`: UI components
- `contexts/`: React providers
- `hooks/`: custom hooks
- `services/`: domain and integration services
- `prompts/`: AI prompt definitions
- `utils/`: shared utilities
- `api/`: serverless endpoints
- `tests/`: automated tests

## Rules for agents

1. Read the current file before proposing changes.
2. Do not assume legacy paths such as `src/*`.
3. Keep prompts in `prompts/`.
4. Keep secrets and API keys out of frontend code.
5. Avoid empty catches.
6. Preserve user-visible loading states for AI operations.
7. Run relevant validation when possible: `npm run typecheck`, `npm run test`, `npm run build`.

## Domain vocabulary

- Dossie: investigative report
- PORTA: proprietary scoring framework
- Radar: proactive monitoring
- Deep Dive: focused follow-up analysis
- War Room: extended competitive or strategic analysis
