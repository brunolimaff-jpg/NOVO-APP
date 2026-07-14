# Handoff — Fase 3B.3B (Runtime Codex single-agent)

> **Atualizado:** 2026-07-13
> **Branch:** `feat/fase-3b3b-single-agent-runtime`
> **Baseline main:** `2239975a` (squash PR #428 — Fase 3B.3A)
> **Próxima etapa:** 3B.3C — **não iniciada**

## Estado

| Fase  | Status                         | Entrega                                                                |
| ----- | ------------------------------ | ---------------------------------------------------------------------- |
| 3B.3A | **MERGED** `#428` → `2239975a` | path hardening + DCG policy + preflight (sem spawn)                    |
| 3B.3B | **em andamento**               | runtime Codex single-agent controlado (fake em testes; sem Codex real) |
| 3B.3C | não iniciada                   | piloto supervisionado / correção automática                            |

## Princípio 3B.3B

Runtime desligado por padrão. Só avança com **três chaves simultâneas**:

1. `--agent-runtime`
2. `--runtime-ack RUN_SINGLE_AGENT`
3. `AGENT_RUNTIME_EXECUTE=1`

Relatório externo de preflight **não** autoriza. Imediatamente antes do spawn o runner refaz preflight **live**. DCG obrigatório para `workspace-write`. Codex só via argv/`Open3` (sem shell). Um agente, um writer, worktree isolada. Pós-execução: planejado × observado (escopo, HEAD, commit, protegidos).

## Codex testado

- CLI: **0.144.0**
- Doc: `.agents/seguranca/CODEX-RUNTIME.md`
- Capacidades: `exec` + `-C` + `-s workspace-write` + `-c approval_policy=never` + `-c sandbox_workspace_write.network_access=false` + `--json` + prompt via stdin `-`

## Não fazer

- Codex real nesta PR / instalação global de DCG / alterar hooks globais
- Multi-agent, subdelegação, commit/push/PR/merge/deploy automáticos
- Iniciar 3B.3C / merge sem **MERGE**
