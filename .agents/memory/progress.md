# Progress

Last updated: 2026-04-14

## Completed

- Merged repo-local memory and `plan-work` setup into `origin/main`.
- Merged Sprint 3 / corte 1 loading into `main` (`371c18185da86831731425a97aa6b882df2d5f40` via PR `#216`).
- Started the next Sprint 3 slice from `origin/main@371c181`.
- Created `features/chat/loading-progress.ts` with `useChatLoadingProgress`.
- Updated `App.tsx` to consume the loading hook while preserving current UI props and behavior.
- Added `features/**/*` to `tsconfig.json`.
- Extended the `hooks/useChat.ts` import guardrail to cover `features/`.
- Added `tests/features/chat/loading-progress.test.tsx`.
- Moved the session lifecycle hook implementation to `features/chat/session-controller.ts`.
- Replaced `hooks/useSessionManager.ts` with a temporary re-export facade.
- Moved session lifecycle tests to `tests/features/chat/session-controller.test.ts`.

## In progress

- PR preparation for Sprint 3 / corte 2A (`codex/sprint-3-session-controller-move`).

## Blockers

- None known. Manual Vercel preview validation is still pending.

## Validation status

- Passed: focused tests for loading hook, loading variant regression, and useChat import guard.
- Passed: focused tests for session controller move, loading variant regression, layout, and useChat import guard.
- Passed: `npm run test` (90 files, 734 tests)
- Passed: `npm run typecheck`
- Passed: `npm run build`
- Accepted warning: build chunking warning involving `utils/idbStorage.ts`, already tracked as OI-003 in `docs/ai-context/refactor/03-OPEN-ITEMS.md`.

## Important refs

- Refactor status: `docs/ai-context/refactor/02-BOARD.md`
- Open items and risk gates: `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- Next safe step: `docs/ai-context/refactor/06-HANDOFF.md`
- Loading hook: `features/chat/loading-progress.ts`
- Session controller: `features/chat/session-controller.ts`

## Next checkpoint

- Open the PR for `codex/sprint-3-session-controller-move`.
- Do not include unrelated local artifacts such as `mcp-server/`.
- After merge, continue with PR 2B: make `App.tsx` import from `features/chat/session-controller`.
