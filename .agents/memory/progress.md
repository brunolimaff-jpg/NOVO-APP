# Progress

Last updated: 2026-04-22

## Completed

- Merged repo-local memory and `plan-work` setup into `origin/main`.
- Merged Sprint 3 / corte 1 loading into `main` (`371c18185da86831731425a97aa6b882df2d5f40` via PR `#216`).
- Merged Sprint 3 / corte 2A session controller move into `main` (`602380d7cb0d9dc26ad472032fc94233d5983744` via PR `#217`).
- Merged Sprint 3 / corte 2B App import swap into `main` (`958af340483f5d9a52fee4b9a44ec746324f4788` via PR `#218`).
- Merged Sprint 3 / corte 2C session remote save into `main` (`5d963f74dad84f49838790d56125e6db24269cae` via PR `#219`).
- Merged Sprint 3 / corte 3 feedback actions into `main` (`a4d41de1d02fe1af2adae202f5cb6b63f63c04ff` via PR `#220`).
- Merged Sprint 3 / corte final message orchestrator into `main` (`dadac29` via PR `#221`).
- Merged dossier markdown golden regression into `main` (`3ebccf616472ec8618c49a09d8f442ed15bd4bc3` via PR `#222`).
- Sprint 3 manual validation completed in runtime real on `2026-04-15`.
- Merged Sprint 4 / Onda 1 dossier runtime extraction into `main` (`7e110b91c7a2bd62a33158aab1f47035d9f2f97e` via PR `#227`).
- Merged Sprint 4 / Onda 2 stores and feature boundaries into `main` (`16c8f2e001e92e4830415506d7406ca236ed91f8` via PR `#228`).
- Merged Sprint 5 chat interface modularization into `main` via PR `#229` on `2026-04-17`, preserving `ChatInterfaceProps` and the `services/geminiService.ts` facade.
- Accepted Sprint 5 manual validation on `2026-04-20` based on the operator confirmation and the post-merge runtime usage without complaints.
- Added War Room PR documentation artifacts in `main` via PR `#230`.
- Added additional waterfall/persistence regression coverage in `main` via PR `#233`.
- Added the versioned Obsidian repo graph layer in `main` via PR `#234`.
- Synced `BOARD` / `HANDOFF` / `HANDOFF_AI` / repo-local memory to close Sprint 5 and point the next official step to Sprint 6.
- Merged Sprint 6 mega prompts modularization into `main` via PR `#236` on `2026-04-22`, preserving the public prompt facade and prompt contracts.

## In progress

- Sprint 7 planning/opening for `constants.ts` hygiene, `hooks/useChat.ts` removal, and light `services/apiConfig.ts` hardening.
- `mcp-server/` is explicitly deferred until after Sprints 6-8 and is outside the current sprint scope.

## Blockers

- None known.

## Validation status

- Passed: Sprint 5 focused suite for `tests/components/ChatInterface.test.tsx`, `tests/components/chat/Composer.test.tsx`, `tests/components/chat/MessageTimeline.test.tsx`, and `tests/components/chat/ChatPanels.test.tsx` on `2026-04-17`.
- Passed: Sprint 5 full gate rerun with `npm run test`, `npm run typecheck`, and `npm run build` on `2026-04-17`.
- Passed: Sprint 5 review-fix validation with `npm run typecheck` and `tests/components/ChatInterface.test.tsx` on `2026-04-17`.
- Passed: Sprint 5 sidebar UX patch validation with `tests/components/SessionsSidebar.test.tsx` and `tests/components/ChatInterface.test.tsx` on `2026-04-17`.
- Passed: `npm run docs:obsidian:check` on `2026-04-19`.
- Passed: `npm run typecheck` on `2026-04-19`.
- Accepted: Sprint 5 manual validation in runtime real was treated as complete on `2026-04-20` based on operator confirmation and continued usage without complaints.
- Passed: Sprint 6 prompt facade extraction with `npm run typecheck` on `2026-04-22`.
- Passed: Sprint 6 prompt contract suite `tests/prompts/megaPrompts.test.ts` on `2026-04-22`.
- Passed: Sprint 6 facade contract coverage now explicitly locks `PROMPT_VERSION`, `ALL_SPECIALIST_PROMPTS`, `buildLegacyCompatibleHiddenPrompt`, and the default export alignment in `tests/prompts/megaPrompts.test.ts` on `2026-04-22`.
- Passed: Sprint 6 dossier consumer suite `tests/features/dossier/waterfall-orchestrator.test.ts` on `2026-04-22`.
- Passed: Sprint 6 dossier fast-check `npm run test:dossier` on `2026-04-22`.
- Passed: Sprint 6 production build `npm run build` on `2026-04-22`.
- Passed: Sprint 6 Playwright smoke suite `npm run test:e2e:smoke` on `2026-04-22` after hardening `tests-e2e/smoke.chat-shell.spec.ts`.
- Accepted: no separate Sprint 6 manual Deep Dive validation was required because the user confirmed the Deep Dive flow is currently hidden behind the active product surface.
- Accepted warning: build chunking warning involving `utils/idbStorage.ts`, already tracked as OI-003 in `docs/ai-context/refactor/03-OPEN-ITEMS.md`.
- `npm run lint` remains red from the historical repo backlog (`37` errors, `217` warnings in `2026-04-11`).

## Important refs

- Refactor status: `docs/ai-context/refactor/02-BOARD.md`
- Open items and risk gates: `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- Next safe step: `docs/ai-context/refactor/06-HANDOFF.md`
- Canonical quick-entry handoff: `HANDOFF_AI.md`
- New internal prompt modules: `prompts/mega/*`
- Next Sprint 7 hotspot: `constants.ts`
- Auxiliary prompt file: `prompts/systemPrompts.ts`
- Chat facade: `components/ChatInterface.tsx`
- Chat shell: `components/chat/ChatShell.tsx`
- Message timeline: `components/chat/MessageTimeline.tsx`
- Composer: `components/chat/Composer.tsx`
- Chat panels: `components/chat/ChatPanels.tsx`
- Obsidian graph entrypoint: `docs/obsidian/00-MASTER.md`
- Obsidian graph manifest: `docs/obsidian/_meta/manifest.json`
- Obsidian checker: `scripts/obsidian/check.mjs`

## Next checkpoint

- Open Sprint 7 from `main`, starting with high-ROI extraction from `constants.ts` into `market-intelligence.ts`.
- Preserve markers `[[PORTA_*]]`, public builders, and existing prompt contracts already stabilized by Sprint 6.
- Do not include `mcp-server/` in Sprint 6-8 work unless the user reprioritizes it after the refactor track.
- Remove `hooks/useChat.ts` only after validating import consumers and preserving the existing guardrail.
- Prefer `npm run test:dossier` if Sprint 7 hygiene touches dossier-adjacent behavior indirectly.
- Keep `types.ts` centralized unless a clear ROI trigger appears during Sprint 7.
