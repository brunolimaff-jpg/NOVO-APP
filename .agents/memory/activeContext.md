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
Sprint 6 is now `done`. Sprint 7 is now `done` after PR `#239` merged in `main` on `2026-04-23` and manual validation was accepted on `2026-04-23`. Sprint 8 is the next official step.

## Current task

`main` now includes the Sprint 7 merge commit from PR `#239` (`e9ca55088d2ede31be101d1f37e1f2729788c16d`), and Sprint 8 is the next planned refactor step.

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
- `npm run lint` exits 0 on the current branch but still reports warning backlog (`182` warnings), including warnings under the deferred untracked `mcp-server/`.
- Sprint 7 manual validation was accepted in runtime real on `2026-04-23` based on operator confirmation.
- The next structural hotspot is `services/warRoomService.ts`, which Sprint 8 will split into `services/war-room/` while preserving compatibility.

## Immediate next step

1. Open Sprint 8 from `main`
2. Create `services/war-room/` and modularize `services/warRoomService.ts` while preserving the public facade
3. Update the final architecture/roadmap docs as Sprint 8 progresses
4. Keep `mcp-server/` deferred until after the refactor track

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
