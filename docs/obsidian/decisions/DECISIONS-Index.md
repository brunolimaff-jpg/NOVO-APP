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

### Teia Societaria Tipo 5

- Mermaid LR dinamico substitui o rumo de SVG manual para producao
- drill-down por socio exige evidencia do grupo, bloqueio de homonimo e cache persistente server-side
- detalhes em [[TEIA-SOCIETARIA-ENRIQUECIMENTO]]

### Stores com `Context + Reducer`

- Sprint 4 escolheu `stores/*` em vez de adicionar `zustand`
- impacto maior em [[ARCH-State-Storage]] e [[ARCH-App-Orchestration]]

## Decisoes recentes

- [[MELHORIAS-DOSSIE-RAG]] — 2026-05-23 — 10 melhorias no fluxo de dossie (RAG + contexto) em 2 sprints
- [[TEIA-SOCIETARIA-ENRIQUECIMENTO]] — 2026-05-23 — Componente visual de estrutura societaria com drill-down
- [[UX-REDESIGN-DIREÇÕES]] — 2026-05-23 — Redesenho UX do Scout 360 (direcao Paper Executivo, caminho C)

## Como usar esta nota

- confirme a decisao duravel aqui
- depois abra a nota de arquitetura afetada
- por fim confira o estado vivo em [[ROADMAP-Overview]]
