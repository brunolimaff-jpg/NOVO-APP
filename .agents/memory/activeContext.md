# Active Context

Last updated: 2026-05-20

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

**Fase 2 (Manutenibilidade) CONCLUÍDA.**

- Fase 1 (Sprints 1-8): concluída.
- Fase 2 (Sprints 9-12): concluída em `2026-05-20`.
- Commit final: `0694997` em `main`.
- Validação manual em Vercel aceita pelo owner.
- Gates finais verdes: `test` (117 arq, 834 testes), `typecheck`, `build`, `lint --quiet`, `analyze:circular`.

## Current task context

Nenhuma sprint ativa. Aguardando definição da Fase 3.

Próximos passos possíveis:
- Sprints 13–16: Modularização de Prompts (pré-requisito: golden test baseline já criado).
- Sprints 17–20: Design System.
- Sprints 21–24: Observability & Monitoring.
- Repriorizar `mcp-server/` e itens deferred.

## Workspace note

`CODE.md` é instrução local para Codex e está ignorado via `.git/info/exclude`.

## Immediate next step

1. Quando houver demanda, planejar Fase 3.
2. Repriorizar itens deferred.
