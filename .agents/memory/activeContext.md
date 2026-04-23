# Active Context

Last updated: 2026-04-23

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
Sprint 6 is now `done`. Sprint 7 is now `done` after PR `#239` merged in `main` on `2026-04-23`, with the closeout docs merged through PR `#240` (`caa141246623fe97807b85b2bffa131418eb7c54`) on `2026-04-23`. Sprint 8 is implemented, manually validated, and documented on the working branch while PR `#241` remains open as draft.

## Current task

`origin/main` now includes the Sprint 7 closeout from PR `#240` (`caa141246623fe97807b85b2bffa131418eb7c54`), and the active working branch is `codex/sprint8-war-room-radar-boundary`.

- `constants.ts` is now a public facade for `APP_NAME`, `APP_VERSION`, `ChatMode`, `DEFAULT_MODE`, `MODE_LABELS`, `BASE_SYSTEM_PROMPT` and `OPERACAO_PROMPT`.
- `constants/market-intelligence.ts` now owns the moved market-intelligence blocks: portais, rede de parceiros, budget, concorrentes and portfolio Senior.
- `hooks/useChat.ts` was removed.
- `tests/architecture/useChatImportGuard.test.ts` now blocks imports and asserts the removed legacy hook file stays absent.
- `tests/hooks/useChat.test.ts` was replaced by `tests/utils/sessionTitleHeuristics.test.ts`, covering the utility heuristics it actually exercised.
- `services/apiConfig.ts` now uses a typed env fallback helper with static `import.meta.env.VITE_*` references instead of `import.meta as any` or dynamic env access.
- `services/apiConfig.ts` preserves its public exports and reexports `SENIOR_PRODUCT_URLS` / `findSeniorProductUrl` from `utils/seniorLinks.ts`.
- `utils/seniorLinks.ts` is now the source for the Senior product URL map, with aliases adjusted to preserve the old `apiConfig` compatibility surface.
- `mcp-server/` remains untracked/deferred and was removed from the Sprint 7 PR diff after Gemini review feedback.
- Sprint 7 automated validation is green for focused suites, `npm run test:dossier`, `npm run test`, `npm run typecheck`, `npm run build`, `npm run lint` and `npm run docs:obsidian:check`.
- Sprint 7 left `npm run lint` green but noisy (`182` warnings on `2026-04-22`), including warnings under the deferred untracked `mcp-server/`.
- Sprint 7 manual validation was accepted in runtime real on `2026-04-23` based on operator confirmation.
- Sprint 8 is implemented locally on `codex/sprint8-war-room-radar-boundary`:
  - `services/war-room/` now owns `contracts.ts`, `config.ts`, `history.ts`, `intent.ts`, `retrieval.ts`, `prompting.ts`, `sources.ts`, and `query.ts`
  - `services/warRoomService.ts` is now a thin public facade that preserves `WarRoomMode`, `WarRoomMessage`, `WarRoomResult`, `WarRoomQueryOptions`, and `queryWarRoom`
  - `components/WarRoom.tsx` now consumes `extractCompetitorFromMessage`, `isBlockedIntent`, and `resolveWarRoomIntent` from `services/war-room/intent.ts`
  - `tests/components/warRoomTargetExtract.test.ts` now covers the shared helper instead of a duplicated local regex
  - `features/radar/` now exists as the explicit Radar boundary stub with `README.md`, `types.ts`, and `index.ts`
- Sprint 8 automated validation is green on `2026-04-23` for focused War Room/Radar suites plus `npm run test`, `npm run typecheck`, `npm run build`, and `npm run lint`.
- `npm run lint` now exits 0 with `180` warnings on the current branch; the backlog still includes warnings in deferred/untracked `mcp-server/`.
- Sprint 8 manual preview/Vercel validation was accepted on `2026-04-23` based on operator confirmation after validating the War Room and Radar flows touched by the sprint.
- PR `#241` (`[codex] Sprint 8: modularize War Room and add Radar boundary stub`) is open, mergeable, and still in draft as of `2026-04-23`.

## Immediate next step

1. Move PR `#241` out of draft when ready and complete the merge review
2. Merge the Sprint 8 branch after the final PR pass, preserving the War Room facade and Radar stub shape
3. Keep `mcp-server/` deferred until after the refactor track

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
