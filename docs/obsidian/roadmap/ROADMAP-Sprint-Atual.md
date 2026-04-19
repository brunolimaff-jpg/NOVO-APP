---
type: roadmap-note
area: sprint
status: active
source_of_truth:
  - .agents/memory/activeContext.md
  - .agents/memory/progress.md
  - docs/ai-context/refactor/02-BOARD.md
last_reviewed: 2026-04-19
tags:
  - obsidian
  - roadmap
  - sprint-5
---

# ROADMAP Sprint Atual

Back to [[00-MASTER]].

## Sprint viva

- Sprint 5
- foco: modularizar `components/ChatInterface.tsx` em `components/chat/*`
- status: implementada no branch, com validacao automatizada green

## Exit criteria ainda abertos

- abrir PR da Sprint 5
- rodar smoke manual em preview/Vercel
- sincronizar board/handoff/memory depois do merge

## Modulos mais tocados

- [[ARCH-App-Orchestration]]
- [[ARCH-Chat-Experience]]
- [[ARCH-State-Storage]]

## Gatilhos de risco

- manter `ChatInterfaceProps` estavel
- nao reabrir `services/geminiService.ts`
- nao misturar mudanca estrutural com expansao de escopo

## Proxima leitura

- [[ROADMAP-Overview]]
- [[ROADMAP-Refactor-Track]]
