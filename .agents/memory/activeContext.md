# Active Context

Last updated: 2026-05-16

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

Fase 2 (manutenibilidade) está em andamento.

- Fase 1 (Sprints 1-8) concluída em `main`.
- Sprint 9 concluída e mergeada via PR `#254`.
- `origin/main` pós-Sprint 9: `922a40316c08e78dab9a978e6fa1172c75198cdd`.
- Próxima sprint canônica após esta ponte curta: Sprint 10, Radar boundary completion.

## Current task context

Branch ativa desta entrega: `refactor/wave-0-1-cleanup`, derivada de `origin/main@922a403`.

Esta Onda 0+1 existe para limpar a base antes da Sprint 10:

- Sincronizar docs/memória que ainda diziam que a PR `#254` estava aberta.
- Registrar um plano de continuação detalhado para agentes futuros.
- Corrigir o bug provável de PORTA que podia tratar falha parcial como integridade irrecuperável.
- Migrar logs cliente de maior risco para `scoutDiag`, sem sweep global.

## Workspace note

O workspace principal original estava em `refactor/code-quality` com mudanças não commitadas em:

- `AGENTS.md`
- `CODEBASE_INDEX.md`
- `docs/ai-context/refactor/00-README.md`
- `.agents/memory/last-session-context.md`
- `docs/ai-context/refactor/09-CODEBASE-EXPLORATION-2026-05-16.md`

Essas mudanças foram preservadas fora do fluxo desta branch; a implementação da Onda 0+1 foi feita em worktree limpa para não misturar escopos.

## Immediate next step

1. Concluir as edições da Onda 0+1.
2. Rodar testes focados e gates completos.
3. Abrir PR da branch `refactor/wave-0-1-cleanup`.
4. Após merge, iniciar Sprint 10 em branch limpa a partir de `main`.
