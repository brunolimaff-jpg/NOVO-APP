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
Sprint 6 is now `done`. Sprint 7 is implemented locally on `codex/sprint7-constants-legacy-hygiene` and is pending PR/review plus manual Vercel validation before it can be marked `done`.

## Current task

`main` includes the Sprint 6 merge commit from PR `#236` (`d514733f7ababa0a9dab4c4a26f133d39bc6e342`) and the Sprint 6 closeout docs from PR `#238` (`288cfb4`). Sprint 7 was opened from the Sprint 6 baseline on branch `codex/sprint7-constants-legacy-hygiene` and then merged with `origin/main`.

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
- Manual Vercel validation has not been run yet.

## Immediate next step

1. Review the Sprint 7 diff on `codex/sprint7-constants-legacy-hygiene`
2. Open the Sprint 7 PR without staging or including `mcp-server/`
3. Run/record manual Vercel validation: nova sessao, primeira mensagem, follow-up, dossie completo, save/reload/export and CRM
4. Mark Sprint 7 `done` only after PR merge and manual validation are accepted

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
