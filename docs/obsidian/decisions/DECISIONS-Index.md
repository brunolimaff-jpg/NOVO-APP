---
type: decision-index
area: decisions
status: active
source_of_truth:
  - .agents/memory/decisions.md
  - HANDOFF_AI.md
  - docs/ai-context/refactor/02-BOARD.md
last_reviewed: 2026-04-19
tags:
  - obsidian
  - decisions
  - architecture
  - roadmap
---

# Índice de Decisões

Voltar para [[00-MASTER]].

## Decisoes duraveis atuais

### Memoria repo-local

- a camada `.agents/memory/*` e o handoff curto oficial entre sessoes
- impacto maior em [[ARCH-State-Storage]] e [[ROADMAP-Overview]]

### `plan-work` como padrao de planejamento

- planejamentos relevantes devem nascer de pesquisa do repo antes de editar
- impacto maior em [[ROADMAP-Refactor-Track]]

### Handoffs hierarquicos

- `HANDOFF_AI.md` segue como entrada rapida
- board/open-items/handoff do refactor continuam como verdade viva
- impacto maior em [[ROADMAP-Overview]]

### Stores com `Context + Reducer`

- Sprint 4 escolheu `stores/*` em vez de adicionar `zustand`
- impacto maior em [[ARCH-State-Storage]] e [[ARCH-App-Orchestration]]

## Como usar esta nota

- confirme a decisao duravel aqui
- depois abra a nota de arquitetura afetada
- por fim confira o estado vivo em [[ROADMAP-Overview]]
