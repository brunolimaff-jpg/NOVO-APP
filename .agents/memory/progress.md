# Progress

Last updated: 2026-04-16

## Completed

- Merged repo-local memory and `plan-work` setup into `origin/main`.
- Merged Sprint 3 / corte 1 loading into `main` (`371c18185da86831731425a97aa6b882df2d5f40` via PR `#216`).
- Merged Sprint 3 / corte 2A session controller move into `main` (`602380d7cb0d9dc26ad472032fc94233d5983744` via PR `#217`).
- Merged Sprint 3 / corte 2B App import swap into `main` (`958af340483f5d9a52fee4b9a44ec746324f4788` via PR `#218`).
- Merged Sprint 3 / corte 2C session remote save into `main` (`5d963f74dad84f49838790d56125e6db24269cae` via PR `#219`).
- Merged Sprint 3 / corte 3 feedback actions into `main` (`a4d41de1d02fe1af2adae202f5cb6b63f63c04ff` via PR `#220`).
- Merged Sprint 3 / corte final message orchestrator into `main` (`dadac29` via PR `#221`).
- Merged dossier markdown golden regression into `main` (`3ebccf616472ec8618c49a09d8f442ed15bd4bc3` via PR `#222`).
- Manual validation for the full session package (`2A` + `2B` + `2C`) completed on 2026-04-14.
- User reported the feedback checkpoint as manually validated on 2026-04-15.
- Integrated manual validation for the full Sprint 3 flow completed in runtime real on 2026-04-15.
- Sprint 3 was marked `done` and Sprint 4 was opened as `active`.
- Sprint 4 sequencing was locked as:
  - Onda 1: `features/dossier/*`
  - Onda 2: `stores/*` with `Context + Reducer` typed state plus feature error boundaries
- Added `features/chat/loading-progress.ts` with `useChatLoadingProgress`.
- Added `features/chat/session-controller.ts` and moved the session lifecycle logic there.
- Added `features/chat/feedback-actions.ts` and moved feedback handlers there.
- Added `features/chat/message-helpers.ts` with shared helpers for company hinting, abort detection, and continuity suggestion fallback.
- Added `features/chat/message-orchestrator.ts` with `useChatMessageOrchestrator`.
- Updated `App.tsx` to delegate the standard send flow and retry flow to the feature hook while keeping the dossier waterfall local.
- Applied the PR `#221` review-fix patch:
  - removed duplicated chat helper implementations from `App.tsx` in favor of `features/chat/message-helpers.ts`
  - restored canonical UTF-8 strings/regexes in `App.tsx` and removed the BOM
  - normalized mega-prompt detection in `features/chat/message-orchestrator.ts`
  - switched `handleSendMessage` to `sessionsRef.current`
  - moved `tests/App.portaRecovery.test.ts` to import `ensureContinuitySuggestions` from `features/chat/message-helpers`
- Added an automated dossier markdown golden test for the canonical Scheffer case (`CNPJ 04.733.767/0001-80`).
- Added canonical dossier fixtures under `tests/fixtures/dossier/scheffer-04733767000180/`:
  - `expected-dossier.md`
  - `case.json`
  - `lookup.json`
  - `continuity-suggestions.json`
  - `modules/*.md`
- Added `tests/helpers/dossierGolden.ts` for BOM-safe fixture loading plus checklist-style dossier validation.
- Added `tests/App.dossierGolden.test.tsx` to run the dossier waterfall through `App`, export markdown, and validate the result offline against the Scheffer fixture.
- Added the quick regression command `npm run test:dossier`.
- Implemented Sprint 4 / Onda 1 dossier extraction:
  - added `features/dossier/waterfall-orchestrator.ts`
  - added `features/dossier/benchmark-stage.ts`
  - added `features/dossier/porta-reconciliation.ts`
  - updated `App.tsx` to wire dossier runtime through `useDossierWaterfallOrchestrator`
  - migrated `tests/App.portaRecovery.test.ts` to `tests/features/dossier/porta-reconciliation.test.ts`
  - added `tests/features/dossier/benchmark-stage.test.ts`
- Documented the runtime manual scope for Onda 1: dossier completo, follow-up, retry, exportacao, continuity suggestions, and remote persistence.
- Merged Sprint 4 / Onda 1 dossier runtime extraction into `main` (`7e110b91c7a2bd62a33158aab1f47035d9f2f97e` via PR `#227`).
- Synced the local baseline to the post-`#227` `main` state before opening Onda 2 work.
- Implemented Sprint 4 / Onda 2 on `codex/sprint4-wave2-stores-boundaries`:
  - added `stores/chatStore.tsx`
  - added `stores/dossierStore.tsx`
  - updated `index.tsx` and `App.tsx` to consume store providers/hooks
  - added `features/chat/ChatErrorBoundary.tsx`
  - added `features/dossier/DossierErrorBoundary.tsx`
  - added `utils/errorBoundaryAudit.ts` and reused it from `components/ErrorBoundary.tsx`
  - wired dossier fallback inside `components/MessageRow.tsx`
  - added tests for stores and feature boundaries
  - exposed `useMaybeOperator`, `useMaybeMode`, `useMaybeChatStore`, and `useMaybeDossierStore` to keep hooks testable without provider-only coupling

## In progress

- PR/review/manual runtime validation for Sprint 4 / Onda 2 on branch `codex/sprint4-wave2-stores-boundaries`.

## Blockers

- None known.

## Validation status

- Passed: focused tests for loading hook, loading variant regression, and useChat import guard.
- Passed: focused tests for session controller move, loading variant regression, layout, and useChat import guard.
- Passed: focused tests for App import swap, session controller, loading variant regression, layout, and useChat import guard.
- Passed: focused tests for remote save extraction, session controller, loading variant regression, layout, and useChat import guard.
- Passed: focused tests for feedback actions, App layout/loading regression, and useChat import guard.
- Passed: focused tests for message orchestrator, App loading variant regression, App PORTA recovery, ChatInterface, and useChat import guard.
- Passed: focused post-review-fix regression set for `message-orchestrator`, `App.loadingVariant`, `App.portaRecovery`, `components/ChatInterface`, and `useChatImportGuard`.
- Passed: integrated manual validation for the full Sprint 3 flow in runtime real on 2026-04-15.
- Passed: Onda 0 reran `npm run test:dossier`, `npm run test`, `npm run typecheck`, and `npm run build` before opening Sprint 4 work.
- Passed: focused dossier extraction regression set (`tests/features/dossier/benchmark-stage.test.ts`, `tests/features/dossier/porta-reconciliation.test.ts`, `tests/App.dossierGolden.test.tsx`, `tests/features/chat/message-orchestrator.test.ts`, `tests/App.loadingVariant.test.tsx`).
- Passed: `npm run test:dossier` on `2026-04-16`
- Passed: `npm run test` on `2026-04-16`
- Passed: `npm run typecheck` on `2026-04-16`
- Passed: `npm run build` on `2026-04-16`
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
- Dossier golden fixture: `tests/fixtures/dossier/scheffer-04733767000180/expected-dossier.md`
- Dossier golden helper: `tests/helpers/dossierGolden.ts`
- Dossier golden test: `tests/App.dossierGolden.test.tsx`
- Dossier benchmark stage: `features/dossier/benchmark-stage.ts`
- Dossier PORTA reconciliation: `features/dossier/porta-reconciliation.ts`
- Dossier waterfall orchestrator: `features/dossier/waterfall-orchestrator.ts`
- Chat store: `stores/chatStore.tsx`
- Dossier store: `stores/dossierStore.tsx`
- Chat boundary: `features/chat/ChatErrorBoundary.tsx`
- Dossier boundary: `features/dossier/DossierErrorBoundary.tsx`
- Error audit helper: `utils/errorBoundaryAudit.ts`

## Next checkpoint

- Open/review the Sprint 4 / Onda 2 PR and run the manual preview/Vercel checklist before merge.
- Do not include unrelated local artifacts such as `mcp-server/`.
- Prefer `npm run test:dossier` before doing another manual dossier export pass.
- If broader dossier regression coverage is needed later, add a second canonical fixture instead of relaxing the Scheffer golden case.
- After Onda 2 lands in `main`, sync board/handoff/memory again before opening Sprint 5.
