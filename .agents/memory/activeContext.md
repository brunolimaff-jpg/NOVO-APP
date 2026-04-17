# Active Context

Last updated: 2026-04-17

## Current operating context

This repo now uses repo-local memory plus canonical handoff docs so future Codex sessions can resume on any machine.

Read order for a new session:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`

## Current refactor sprint

The structural refactor program is active. The canonical live status is in:

- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/06-HANDOFF.md`

Sprint 3 chat extraction is merged in `main` through PR `#221`, and the offline dossier golden regression is merged through PR `#222`.
Sprint 3 is now `done` after the integrated manual validation completed on `2026-04-15`.
Sprint 4 is now `done` after PR `#228` landed in `main` on `2026-04-17`.
Sprint 5 is now `active`.

## Current task

`origin/main` is now on the post-`#228` baseline (`16c8f2e001e92e4830415506d7406ca236ed91f8`), and Sprint 5 is implemented locally on branch `codex/sprint5-chatinterface-modularization`.

- `components/ChatInterface.tsx` is now a thinner orchestration facade; `ChatInterfaceProps` stayed unchanged.
- `components/chat/ChatShell.tsx` owns the layout shell, sidebar/header composition, and panel mounting slots.
- `components/chat/MessageTimeline.tsx` owns the operator gate, initial home, virtualized list, viewport fallback, and `MessageRow` wiring.
- `components/chat/Composer.tsx` owns textarea state, prefill listener, processing indicator, and retry/stop footer behavior.
- `components/chat/ChatPanels.tsx` centralizes the lazy overlays for dashboard, settings, war room, and radar.
- `components/chat/contracts.ts` holds the internal chat-slice contracts, including the `RadarProps` re-export path preserved by the facade.
- `services/geminiService.ts` stayed untouched as the stable public AI facade.
- The canonical dossier fixture still lives under `tests/fixtures/dossier/scheffer-04733767000180/`.
- The practical day-to-day command remains `npm run test:dossier`.
- Sprint 5 is structural only; do not use it to widen `ChatInterfaceProps` or move domain rules into `components/chat/*`.
- Automated validation for Sprint 5 passed on `2026-04-17`: focused `ChatInterface`/`components/chat/*`, `npm run test`, `npm run typecheck`, and `npm run build`.
- The first PR review patch for Sprint 5 also landed on `2026-04-17`: `ChatInterface.tsx` now uses `Sender.User` in the markdown copy path and `RadarAlert` in the radar context formatter.
- The accepted build warning about `utils/idbStorage.ts` chunking remains unchanged from the previous baseline.

## Immediate next step

1. open the Sprint 5 PR from `codex/sprint5-chatinterface-modularization`
2. run the manual smoke pass in preview/Vercel for operator gate, initial home, active-session timeline, header actions, and composer send/stop/retry
3. if the smoke pass stays green, merge Sprint 5 and sync board/handoff/memory again before opening Sprint 6 planning
