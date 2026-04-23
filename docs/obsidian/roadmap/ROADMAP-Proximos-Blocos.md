---
type: roadmap-note
area: next
status: tracked
source_of_truth:
  - docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md
  - docs/ai-context/refactor/02-BOARD.md
  - docs/ai-context/ARCHITECTURE_MAP.md
last_reviewed: 2026-04-23
tags:
  - obsidian
  - roadmap
  - next
---

# ROADMAP Proximos Blocos

Back to [[00-MASTER]].

## Proximo horizonte tecnico

- Iniciar Sprint 9: desacoplamento do app shell (`App.tsx`) + governanca da fase
- Iniciar Sprint 10 depois de Sprint 9 green: mover runtime de Radar para `features/radar/*`
- Iniciar Sprint 11: reducao de complexidade em `CRMDetail`, `LoadingSmart` e `WarRoom`
- Sprint 12 fecha a fase com hardening de warnings e closeout documental

## Follow-ups relevantes fora do fluxo principal

- warning de chunking em `utils/idbStorage.ts` (OI-003)
- warning de `SessionsSidebar` (OI-004)
- backlog de warnings de lint (OI-005)

## Areas puxadas por esse horizonte

- [[ARCH-App-Orchestration]]
- [[ARCH-Chat-Experience]]
- [[ARCH-State-Storage]]
- [[ARCH-Services-Gemini]]
- [[ARCH-Serverless-RAG]]

## Navegacao

- [[ROADMAP-Overview]]
- [[ROADMAP-Refactor-Track]]
