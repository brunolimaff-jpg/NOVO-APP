# Active Context

Last updated: 2026-07-13 — PR #424 MERGED (Fase 3B.1 em main)

## Estado atual

- **Branch ativa canônica:** `main` @ `9c8b3228` (squash merge PR #424)
- **PR #424:** MERGED — execução local controlada de missões
- **PR #423:** MERGED anteriormente — Fase 3A (`0f9858a1`)
- **Escopo concluído:** executor controlado + relatório + CI Agent Execution Control + hooks Cursor documentados
- **Próximo:** Fase 3B.2 (propagação planner→comandos + schema condicional)

## Fonte da verdade

1. `HANDOFF_AI.md` — handoff canônico pós-merge 3B.1
2. `.agents/orquestracao/executor/README.md` — contrato operacional do executor
3. Este arquivo + `progress.md` + `decisions.md`

## Atenção operacional

- Gates próprios da orquestração: Skills Governance, Agent Orchestration, Agent Execution Control, Build.
- Gates Scout (Typecheck/Tests/Dossier/E2E) fora do escopo da trilha de agentes nesta fase.
- Hook branch-health: higiene (`failClosed: false`), não fronteira de segurança.
- Cartão/plano: IDs manuais alinhados até 3B.2.
- Só `planejado` executa; `planejado-com-restricoes` negado.

## Worktree

Worktree `.claude/worktrees/fase-3b-execucao-controlada` pode ter stashes `wip-pre-main-checkout-after-pr424-merge` / `wip-remaining-after-pr424` com WIP não relacionado — não misturar com follow-ups da 3B.2.

---

## Histórico

### 2026-07-13 — Fase 3B.1 (PR #424) — concluída e mergeada

- Executor local, 54 testes, fail-closed de status, process group timeout, exit codes, paths/UTF-8, hooks commit-only + cwd raiz.
- Squash: `9c8b3228`.

### 2026-07-13 — Fase 3A (PR #423) — concluída

- Planner dry-run, schemas, 57 testes de orquestração. Squash: `0f9858a1`.
