# Handoff — Fase 3B.3C (Planejado × Observado + piloto supervisionado)

> **Atualizado:** 2026-07-14
> **Branch:** `feat/fase-3b3c-planned-observed-pilot`
> **Baseline main:** `c14ffef1` (squash PR #429 — Fase 3B.3B)
> **Próxima etapa:** piloto real supervisionado **somente após merge** + autorização humana

## Estado

| Fase  | Status                         | Entrega                                                            |
| ----- | ------------------------------ | ------------------------------------------------------------------ |
| 3B.3A | **MERGED** `#428` → `2239975a` | path hardening + DCG policy + preflight (sem spawn)                |
| 3B.3B | **MERGED** `#429` → `c14ffef1` | runtime Codex single-agent (fake em testes; sem Codex real)        |
| 3B.3C | **em andamento**               | snapshots planejado×observado, ledger, handoff humano, piloto prep |

## Princípio 3B.3C

Runtime da 3B.3B permanece **desligado por padrão** (três chaves). Esta fase transforma a execução em evidência auditável: snapshot planejado, snapshot observado, comparação `conforme|desvio|violacao|indisponivel`, task ledger de **uma** tarefa, handoff para revisor humano (`requer_aprovacao_humana: true`).

Piloto real exige **seis** condições (`--agent-runtime` + ack + env + `--supervised-pilot` + pilot-ack + `AGENT_RUNTIME_PILOT=1`). **Nenhum piloto real nesta PR.**

## Contagens de suites (início da 3B.3C)

| Suite                         | Contagem |
| ----------------------------- | -------- |
| `test-agent-runtime.rb`       | 50       |
| `test-agent-execution.rb`     | 64       |
| `test-runtime-safety.rb`      | 42       |
| `test-agent-orchestration.rb` | 136      |

## Não fazer

- Codex real / piloto real nesta PR
- Instalação global de DCG / alterar hooks globais
- Multi-agent, subdelegação, commit/push/PR/merge/deploy automáticos
- Iniciar Fase 3C / merge sem **MERGE**
