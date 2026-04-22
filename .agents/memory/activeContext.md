# Active Context

Last updated: 2026-04-22

## Current operating context

This repo now uses repo-local memory plus canonical handoff docs so future Codex sessions can resume on any machine.

Read order for a new session:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/obsidian/00-MASTER.md` for visual navigation of architecture + roadmap after the canonical sources above

## Current refactor sprint

The structural refactor program remains active. The canonical live status is in:

- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/06-HANDOFF.md`

Sprint 3 chat extraction is merged in `main` through PR `#221`, and the offline dossier golden regression is merged through PR `#222`.
Sprint 3 is `done` after the integrated manual validation completed on `2026-04-15`.
Sprint 4 is `done` after PR `#228` landed in `main` on `2026-04-17`.
Sprint 5 is now `done` after PR `#229` landed in `main` on `2026-04-17`, with manual validation accepted on `2026-04-20` based on user confirmation plus ongoing usage without complaints.
Sprint 6 is now the next official step.

## Current task

`origin/main` is now on the post-`#235` baseline (`478419c8f3d3028088a553da5ed53d6be5e2a2b5`), and Sprint 6 is active locally on branch `codex/sprint6-mega-prompts-modularization`.

- `components/ChatInterface.tsx` is now a thinner orchestration facade; `ChatInterfaceProps` stayed unchanged.
- `components/chat/ChatShell.tsx` owns the layout shell, sidebar/header composition, and panel mounting slots.
- `components/chat/MessageTimeline.tsx` owns the operator gate, initial home, virtualized list, viewport fallback, and `MessageRow` wiring.
- `components/chat/Composer.tsx` owns textarea state, prefill listener, processing indicator, and retry/stop footer behavior.
- `components/chat/ChatPanels.tsx` centralizes the lazy overlays for dashboard, settings, war room, and radar.
- `components/chat/contracts.ts` holds the internal chat-slice contracts, including the `RadarProps` re-export path preserved by the facade.
- `services/geminiService.ts` stayed untouched as the stable public AI facade.
- `prompts/megaPrompts.ts` is now a thin facade that re-exports the Sprint 6 internals under `prompts/mega/*`.
- `prompts/mega/contracts.ts` now holds the public prompt-builder types.
- `prompts/mega/foundation.ts` now owns the shared governance/foundation blocks and the investigation orchestrator constants.
- `prompts/mega/specialist-prompts.ts` now owns the specialist deep-dive prompt constants.
- `prompts/mega/builders.ts` now owns `SHARED_FOUNDATION_BLOCK`, `INVESTIGATION_MODE_BLOCKS`, both builders, `PROMPT_VERSION`, `ALL_SPECIALIST_PROMPTS`, and the compatibility default export.
- The old Sprint 6 plan item about removing `@ts-nocheck` is stale on the current baseline; the pragma was already absent from `prompts/megaPrompts.ts` when the sprint started.
- `mcp-server/` is deferred local-only work and must stay out of Sprint 6-8 scope unless the user reprioritizes it after the refactor track.
- The canonical dossier fixture still lives under `tests/fixtures/dossier/scheffer-04733767000180/`.
- The practical day-to-day command remains `npm run test:dossier`.
- The accepted build warning about `utils/idbStorage.ts` chunking remains unchanged from the previous baseline.
- Sprint 6 validation already green on `2026-04-22` for:
  - `npm run typecheck`
  - `vitest run tests/prompts/megaPrompts.test.ts`
  - `vitest run tests/features/dossier/waterfall-orchestrator.test.ts`
  - `npm run test:dossier`
  - `npm run build`
  - facade contract coverage now explicitly locking `PROMPT_VERSION`, `ALL_SPECIALIST_PROMPTS`, `buildLegacyCompatibleHiddenPrompt`, and the default export in `tests/prompts/megaPrompts.test.ts`

## Immediate next step

1. treat the current Sprint 6 branch as PR-ready; the user confirmed the Deep Dive flow is currently hidden, so there is no separate manual Deep Dive spot-check to require before the PR
2. preserve markers `[[PORTA_*]]`, public builders, and current prompt text contracts; do not do blind encoding cleanup without a concrete defect
3. sync board/handoff/memory to the implementation state when opening or merging the Sprint 6 PR, and keep `mcp-server/` deferred until after Sprints 6-8

## Additional documentation context

- Added canonical War Room hardening documentation on `2026-04-17`:
  - `docs/PR_WAR_ROOM_HARDENING.md`
  - `docs/ai-context/WAR_ROOM_EXECUTIVE_SUMMARY.md`
  - `docs/ai-context/ROADMAP_WAR_ROOM.md`
- `docs/ai-context/ARCHITECTURE_MAP.md` now records War Room hallucination hardening as resolved and tracks `Concorrentes` / domain-restricted search as follow-up items.
- Added a versioned Obsidian repo graph layer on `2026-04-19`:
  - `docs/obsidian/00-MASTER.md`
  - `docs/obsidian/OBSIDIAN-README.md`
  - `docs/obsidian/_meta/manifest.json`
  - `scripts/obsidian/check.mjs`
- The Obsidian layer is navigation-only. Canonical live status remains `HANDOFF_AI.md`, `.agents/memory/*`, and `docs/ai-context/refactor/*`.
