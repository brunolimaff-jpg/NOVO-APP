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

- [[FECHAMENTO-TEIA-CNPJ-PR285-2026-05-25]] — 2026-05-25 — fechamento da PR #285, validações finais, lições aprendidas e pendências de reestruturação
- [[ACHADO-P0-TEIA-CNPJ-ESCOPO-2026-05-25]] — 2026-05-25 — QSA oficial confirma socio -> CNPJ, nao CNPJ -> grupo; decisao duravel da Teia CNPJ
- [[MELHORIAS-DOSSIE-RAG]] — 2026-05-23 — 10 melhorias no fluxo de dossie (RAG + contexto) em 2 sprints
- [[TEIA-SOCIETARIA-ENRIQUECIMENTO]] — 2026-05-23 — Componente visual de estrutura societaria com drill-down
- [[UX-REDESIGN-DIREÇÕES]] — 2026-05-23 — Redesenho UX do Scout 360 (direcao Paper Executivo, caminho C)
- [[LICOES-APRENDIDAS-TEIA-CNPJ-2026-05-24]] — 2026-05-24 — Licoes do hotfix P0 da Teia CNPJ e PRs #279/#280/#285
- [[HANDOFF-TEIA-CNPJ-2026-05-25]] — 2026-05-25 — Handoff consolidado da PR #285; marca o snapshot `9d1448c` como status anterior e registra CNPJ pendente com `*` + DuckDuckGo-only

## Como usar esta nota

- confirme a decisao duravel aqui
- depois abra a nota de arquitetura afetada
- por fim confira o estado vivo em [[ROADMAP-Overview]]
