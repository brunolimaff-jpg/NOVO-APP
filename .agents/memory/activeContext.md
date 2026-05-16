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
- `origin/main` pós-OI-066: `66591f16f5463e7ab40bb718ec886a88f52eae40`.
- Sprint 10 mergeada via PR `#257` em `2026-05-16`.
- Sprint atual: Sprint 11, Onda 0 — testes de caracterização para componentes grandes.

## Current task context

Branch ativa desta entrega: `codex/sprint-11-onda-0-tests`, derivada de `origin/main@fbf5536`.

Worktree limpo: `~/.config/superpowers/worktrees/NOVO-APP/codex-sprint-11-onda-0-tests`.

Esta Onda 0 existe para criar rede de proteção antes de refatorar `CRMDetail`, `LoadingSmart` e `WarRoom`:

- `tests/components/CRMDetail.test.tsx` cobre header, dados da empresa, CNPJ, ExactSpotter, notas, anexos, sessões vinculadas, revenue profile, IA e exclusão.
- `tests/components/WarRoom.test.tsx` cobre shell aberto/fechado, envio técnico, cancelamento, fontes, benchmark e erro retryable.
- `@vitest/coverage-v8` foi adicionado como devDependency porque o gate de cobertura da Sprint 11 usa `vitest --coverage`.
- Nenhum componente de produção foi alterado nesta onda.

## Workspace note

O workspace principal original estava em `refactor/code-quality` com mudanças não commitadas em:

- `AGENTS.md`
- `CODEBASE_INDEX.md`
- `docs/ai-context/refactor/00-README.md`
- `.agents/memory/last-session-context.md`
- `docs/ai-context/refactor/09-CODEBASE-EXPLORATION-2026-05-16.md`

Essas mudanças foram preservadas fora do fluxo desta branch; a Sprint 11 Onda 0 também está sendo feita em worktree limpa para não misturar escopos.

## Immediate next step

1. Abrir PR da branch `codex/sprint-11-onda-0-tests`.
2. Após review/merge, iniciar Sprint 11 Onda 1 em `CRMDetail` usando estes testes como rede.
