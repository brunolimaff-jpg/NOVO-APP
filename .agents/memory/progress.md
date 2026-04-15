# Progress

Last updated: 2026-04-14

## Completed

- Merged repo-local memory and `plan-work` setup into `origin/main`.
- Merged Sprint 3 / corte 1 loading into `main` (`371c18185da86831731425a97aa6b882df2d5f40` via PR `#216`).
- Merged Sprint 3 / corte 2A session controller move into `main` (`602380d7cb0d9dc26ad472032fc94233d5983744` via PR `#217`).
- Merged Sprint 3 / corte 2B App import swap into `main` (`958af340483f5d9a52fee4b9a44ec746324f4788` via PR `#218`).
- Merged Sprint 3 / corte 2C session remote save into `main` (`5d963f74dad84f49838790d56125e6db24269cae` via PR `#219`).
- Merged Sprint 3 / corte 3 feedback actions into `main` (`a4d41de1d02fe1af2adae202f5cb6b63f63c04ff` via PR `#220`).
- Manual validation for the full session package (`2A` + `2B` + `2C`) completed on 2026-04-14.
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
- Started Sprint 3 / corte 3 from `origin/main@5d963f7`.
- Added `features/chat/feedback-actions.ts` with `useChatFeedbackActions`.
- Updated `App.tsx` to consume feedback handlers from the feature module.
- Added feature tests covering feedback toggle, section feedback, source toggle, remote submit, and error reporting.
- Started Sprint 3 / corte final from `origin/main@a4d41de`.
- Added `features/chat/message-helpers.ts` with shared helpers for company hinting, abort detection, and continuity suggestion fallback.
- Added `features/chat/message-orchestrator.ts` with `useChatMessageOrchestrator`.
- Updated `App.tsx` to delegate the standard send flow and retry flow to the feature hook while keeping the dossier waterfall local.
- Added `tests/features/chat/message-orchestrator.test.ts` covering new session bootstrap, follow-up, placeholder, abort, error, retry, waterfall delegation, deep dive path, and remote investigation logging.

## In progress

- PR preparation for Sprint 3 / corte final message orchestrator (`codex/sprint-3-message-orchestrator`).

## Blockers

- None known. Sprint 3 is implemented; only the final integrated manual validation remains before closure.

## Validation status

- Passed: focused tests for loading hook, loading variant regression, and useChat import guard.
- Passed: focused tests for session controller move, loading variant regression, layout, and useChat import guard.
- Passed: focused tests for App import swap, session controller, loading variant regression, layout, and useChat import guard.
- Passed: focused tests for remote save extraction, session controller, loading variant regression, layout, and useChat import guard.
- Passed: focused tests for feedback actions, App layout/loading regression, and useChat import guard.
- Passed: focused tests for message orchestrator, App loading variant regression, App PORTA recovery, ChatInterface, and useChat import guard.
- Passed: `npm run test` (92 files, 754 tests)
- Passed: `npm run typecheck`
- Passed: `npm run build`
- Accepted warning: build chunking warning involving `utils/idbStorage.ts`, already tracked as OI-003 in `docs/ai-context/refactor/03-OPEN-ITEMS.md`.

## Important refs

- Refactor status: `docs/ai-context/refactor/02-BOARD.md`
- Open items and risk gates: `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- Next safe step: `docs/ai-context/refactor/06-HANDOFF.md`
- Loading hook: `features/chat/loading-progress.ts`
- Session controller: `features/chat/session-controller.ts`
- Feedback actions: `features/chat/feedback-actions.ts`
- Message helpers: `features/chat/message-helpers.ts`
- Message orchestrator: `features/chat/message-orchestrator.ts`

## Next checkpoint

- Open the PR for `codex/sprint-3-message-orchestrator`.
- Do not include unrelated local artifacts such as `mcp-server/`.
- Run the integrated manual validation for the end of Sprint 3: initial investigation, follow-up, retry, full dossier, remote save, and feedback.
- If that passes after merge, mark Sprint 3 as done and start Sprint 4 planning.
