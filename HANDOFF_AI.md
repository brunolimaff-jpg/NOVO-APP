# Handoff — Fase 3B.3A (Runtime Safety Preflight)

> **Atualizado:** 2026-07-13
> **Branch:** `feat/fase-3b3a-runtime-safety-preflight`
> **Baseline main:** `b7c6f671` (squash PR #427 — Fase 3B.2B)
> **Próxima etapa:** 3B.3B (runtime supervisionado) — **não iniciada**

## Estado

| Fase  | Status                         | Entrega                                                            |
| ----- | ------------------------------ | ------------------------------------------------------------------ |
| 3B.2A | **MERGED** `#426` → `9f72b694` | topologia, `executavel`, runner `PLAN_NOT_EXECUTABLE`              |
| 3B.2B | **MERGED** `#427` → `b7c6f671` | estratégia/tarefas explícitas; limites fail-closed                 |
| 3B.3A | **em andamento**               | path hardening + DCG policy + preflight determinístico (sem spawn) |
| 3B.3B | não iniciada                   | spawn supervisionado / handoff runtime                             |

### Contagens (head 3B.3A)

- Orquestração: **133**
- Executor: **58**
- Skills Governance: **32**
- Codex harness: **37**
- Runtime Safety: **28**

## Princípio 3B.3A

Barreira fail-closed **antes** de qualquer spawn real. DCG é segunda barreira, não autorização primária. Nenhum runtime de agente autorizado nesta fase.

## DI-2026-07-13-12

Path hardening canônico (UTF-8, null byte, percent-decode limitado, NFC, realpath/ancestral, symlink escape) — atendido nesta fase.

## Não fazer

- Spawn real / `codex exec` / instalação global de DCG / curl\|bash
- Alteração de hooks globais do usuário
- Iniciar 3B.3B / merge sem **MERGE**
