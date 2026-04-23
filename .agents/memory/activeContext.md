# Active Context

Last updated: 2026-04-23

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current refactor phase

Fase 1 (Sprints 1-8) esta concluida em `main`.

- Sprint 8 mergeada via PR `#241` (`ccd2001518367961637b1a9488c2319aa83d0a21`)
- `services/war-room/*` ativo com fachada publica preservada em `services/warRoomService.ts`
- `features/radar/*` oficializado como boundary inicial (stub)

Fase 2 (manutenibilidade) foi aberta de forma documental:

- `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
- Sprint 9-12 definidas como trilha curta de reducao de acoplamento

## Current task context

Sincronizacao documental pos-Sprint 8 e kickoff da Fase 2:

- pacote canonico de refactor alinhado (`00`, `01`, `02`, `03`, `06`, `07`, `08`)
- handoff/memory/roadmap alinhados para continuidade entre sessoes
- baseline de hotspots confirmada:
  - `App.tsx` (`724` linhas, `44` imports)
  - `components/CRMDetail.tsx` (`664`)
  - `components/LoadingSmart.tsx` (`704`)
  - `components/WarRoom.tsx` (`513`)
  - `hooks/useRadar.ts` (`248`) + `services/radarService.ts` (`200`)

## Immediate next step

1. Publicar o PR de documentacao da Fase 2.
2. Iniciar Sprint 9 (App shell decoupling + governanca).
3. Manter APIs publicas congeladas e `mcp-server/` fora do escopo.
