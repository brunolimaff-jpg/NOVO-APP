# Senior Scout 360 - GitHub Copilot Instructions

## Project

Senior Scout 360 is a commercial intelligence app for account executives selling into agribusiness. The production app is `https://scoutagro.vercel.app`.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Clerk
- Google Gemini
- Vercel serverless functions in `api/*.ts`
- Vitest

## Repository layout

- `App.tsx` orchestrates the main app shell and session flow.
- `components/` contains UI components.
- `contexts/` contains React providers and shared state.
- `hooks/` contains custom hooks.
- `services/` contains integration and domain services.
- `prompts/` contains reusable AI prompts.
- `utils/` contains shared utilities.
- `api/` contains Vercel serverless handlers.
- `tests/` contains Vitest coverage.

## Required conventions

- Keep prompts in `prompts/`, not inline in components.
- Keep API keys and secrets out of frontend code.
- Do not add empty `catch` blocks.
- Prefer strong typing and avoid `any` unless there is a documented reason.
- Preserve explicit loading states for AI flows.
- Check current file contents before proposing edits.

## Domain notes

- PORTA is the proprietary 0-100 scoring model: Porte, Operacao, Retorno, Tecnologia, Adocao.
- Dossie = investigative report for a target account.
- Radar = proactive monitoring flow.
- Deep Dive and War Room are advanced analysis modes.

## Validation

- Preferred checks are `npm run typecheck`, `npm run test`, and `npm run build`.
- If a failure is pre-existing, say so clearly instead of blaming the current diff.
