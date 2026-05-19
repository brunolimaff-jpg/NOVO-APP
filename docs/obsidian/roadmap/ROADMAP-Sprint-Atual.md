---
type: roadmap-note
area: sprint
status: active
source_of_truth:
  - .agents/memory/activeContext.md
  - .agents/memory/progress.md
  - docs/ai-context/refactor/02-BOARD.md
last_reviewed: 2026-05-19
tags:
  - obsidian
  - roadmap
  - sprint-11
---

# ROADMAP Sprint Atual

Back to [[00-MASTER]].

## Sprint viva

- Sprint 11
- foco: Onda 1B `LoadingSmart`, depois `WarRoom` em PR separado
- status: ativa após PR `#259`

## Exit criteria ainda abertos

- `LoadingSmart` com fachada preservada e lógica de timeline/progresso extraída
- próxima fatia de `LoadingSmart` definida ou PR curto fechado
- `WarRoom` mantido como próxima onda separada
- gates técnicos verdes antes de promover a sprint

## Modulos mais tocados

- [[ARCH-App-Orchestration]]
- [[ARCH-Chat-Experience]]
- [[ARCH-Services-Gemini]]
- [[ARCH-State-Storage]]
- [[ARCH-Tests-Quality]]

## Gatilhos de risco

- preservar fachadas públicas congeladas durante refactors estruturais
- não puxar `mcp-server/` para a Sprint 11
- não misturar Onda 1A documental com refactor de runtime
- não reintroduzir Mini CRM local

## Proxima leitura

- [[ROADMAP-Overview]]
- [[ROADMAP-Refactor-Track]]
