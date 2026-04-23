---
type: roadmap-note
area: sprint
status: planned
source_of_truth:
  - .agents/memory/activeContext.md
  - .agents/memory/progress.md
  - docs/ai-context/refactor/02-BOARD.md
last_reviewed: 2026-04-23
tags:
  - obsidian
  - roadmap
  - sprint-8
---

# ROADMAP Sprint Atual

Back to [[00-MASTER]].

## Sprint viva

- Sprint 8
- foco: War Room e fechamento documental da trilha
- status: planejada a partir do `main`, sem branch ativa ainda

## Exit criteria ainda abertos

- abrir a branch da Sprint 8 a partir do `main`
- criar `services/war-room/` e modularizar `services/warRoomService.ts` preservando compatibilidade
- consolidar board, handoff, memory e docs finais ao longo da sprint

## Modulos mais tocados

- [[ARCH-App-Orchestration]]
- [[ARCH-Chat-Experience]]
- [[ARCH-Services-Gemini]]
- [[ARCH-State-Storage]]
- [[ARCH-Tests-Quality]]

## Gatilhos de risco

- preservar a facade publica de `services/warRoomService.ts` durante a modularizacao
- nao puxar `mcp-server/` para a Sprint 8
- manter o War Room dentro do escopo estrutural, sem expansao funcional ad hoc
- nao misturar mudanca estrutural com expansao de escopo

## Proxima leitura

- [[ROADMAP-Overview]]
- [[ROADMAP-Refactor-Track]]
