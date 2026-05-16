# Active Context

Last updated: 2026-05-16

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/ai-context/refactor/02-BOARD.md`
7. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current refactor phase

Fase 2 (manutenibilidade) está em andamento.

- Fase 1 (Sprints 1-8) concluída em `main`.
- Sprint 9 concluída e mergeada via PR `#254`.
- `origin/main` pós-OI-066: `66591f16f5463e7ab40bb718ec886a88f52eae40`.
- Sprint atual: Sprint 10, Radar boundary completion.

## Current task context

Branch ativa desta entrega: `codex/sprint-10-radar-boundary`, derivada de `origin/main@66591f1`.

PR ativa: `#257` — <https://github.com/brunolimaff-jpg/NOVO-APP/pull/257>.
Preview Vercel: <https://scoutagro-git-codex-sprint-10-143bdc-brunolimaff-3629s-projects.vercel.app>.

Esta Sprint 10 existe para fechar o runtime do Radar dentro do boundary `features/radar/*`:

- `features/radar/useRadar.ts` passa a ser dono do hook de estado/persistência/scan.
- `features/radar/service.ts` passa a ser dono do cliente `/api/radar-scan`.
- `features/radar/index.ts` exporta hook, service, tipos e constantes estáveis.
- `hooks/useRadar.ts` e `services/radarService.ts` ficam como facades de compatibilidade.
- `App.tsx` deve importar Radar pelo barrel `features/radar`.
- Componentes visuais `Radar*` ficam fora desta PR.

## Workspace note

O workspace principal original estava em `refactor/code-quality` com mudanças não commitadas em:

- `AGENTS.md`
- `CODEBASE_INDEX.md`
- `docs/ai-context/refactor/00-README.md`
- `.agents/memory/last-session-context.md`
- `docs/ai-context/refactor/09-CODEBASE-EXPLORATION-2026-05-16.md`

Essas mudanças foram preservadas fora do fluxo desta branch; a Sprint 10 também está sendo feita em worktree limpa para não misturar escopos.

## Immediate next step

1. Validar preview Vercel da PR `#257` com checklist manual do Radar.
2. Após validação manual, mergear PR `#257`.
3. Iniciar Sprint 11 somente depois do merge.
