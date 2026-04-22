---
type: roadmap-note
area: sprint
status: active
source_of_truth:
  - .agents/memory/activeContext.md
  - .agents/memory/progress.md
  - docs/ai-context/refactor/02-BOARD.md
last_reviewed: 2026-04-22
tags:
  - obsidian
  - roadmap
  - sprint-7
---

# ROADMAP Sprint Atual

Back to [[00-MASTER]].

## Sprint viva

- Sprint 7
- foco: constantes, legado e higiene
- status: implementada localmente em `codex/sprint7-constants-legacy-hygiene`, com validacao automatizada green

## Exit criteria ainda abertos

- abrir PR da Sprint 7 sem incluir `mcp-server/`
- rodar validacao manual em Vercel
- sincronizar board/handoff/memory apos merge e aceite manual

## Modulos mais tocados

- [[ARCH-App-Orchestration]]
- [[ARCH-Chat-Experience]]
- [[ARCH-Services-Gemini]]
- [[ARCH-State-Storage]]
- [[ARCH-Tests-Quality]]

## Gatilhos de risco

- manter `constants.ts` como facade publica
- nao recriar `hooks/useChat.ts`
- nao puxar `mcp-server/` para o PR
- nao misturar mudanca estrutural com expansao de escopo

## Proxima leitura

- [[ROADMAP-Overview]]
- [[ROADMAP-Refactor-Track]]
