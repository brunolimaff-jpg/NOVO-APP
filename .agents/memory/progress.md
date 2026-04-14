# Progress

Last updated: 2026-04-14

## Completed

- Merged repo-local memory and `plan-work` setup into `origin/main`.
- Merged Sprint 3 / corte 1 loading into `main` (`371c18185da86831731425a97aa6b882df2d5f40` via PR `#216`).
- Merged Sprint 3 / corte 2A session controller move into `main` (`602380d7cb0d9dc26ad472032fc94233d5983744` via PR `#217`).
- Merged Sprint 3 / corte 2B App import swap into `main` (`958af340483f5d9a52fee4b9a44ec746324f4788` via PR `#218`).
- Created `features/chat/loading-progress.ts` with `useChatLoadingProgress`.
- Updated `App.tsx` to consume the loading hook while preserving current UI props and behavior.
- Added `features/**/*` to `tsconfig.json`.
- Extended the `hooks/useChat.ts` import guardrail to cover `features/`.
- Added `tests/features/chat/loading-progress.test.tsx`.
- Moved the session lifecycle hook implementation to `features/chat/session-controller.ts`.
- Replaced `hooks/useSessionManager.ts` with a temporary re-export facade.
- Moved session lifecycle tests to `tests/features/chat/session-controller.test.ts`.
- Started Sprint 3 / corte 2B from `origin/main@602380d`.
- Updated `App.tsx` to import `useSessionManager` from `features/chat/session-controller`.
- Updated `App` tests to mock `features/chat/session-controller` directly.
- Started Sprint 3 / corte 2C from `origin/main@958af34`.
- Added `useSessionRemoteSave` to `features/chat/session-controller`.
- Updated `App.tsx` to consume remote save state/action from the feature module.
- Added feature tests covering remote save success, no-session guard, and error path.

## In progress

- PR preparation for Sprint 3 / corte 2C (`codex/sprint-3-session-remote-save`).

## Blockers

- None known. Manual Vercel preview validation is still pending.

## Validation status

- Passed: focused tests for loading hook, loading variant regression, and useChat import guard.
- Passed: focused tests for session controller move, loading variant regression, layout, and useChat import guard.
- Passed: focused tests for App import swap, session controller, loading variant regression, layout, and useChat import guard.
- Passed: focused tests for remote save extraction, session controller, loading variant regression, layout, and useChat import guard.
- Passed: `npm run test` (90 files, 739 tests)
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

- Open the PR for `codex/sprint-3-session-remote-save`.
- Do not include unrelated local artifacts such as `mcp-server/`.
- After merge, run the manual validation for the full session package and then continue with feedback actions.
