# Progress

## 2026-07-13 — PR #427 rodada corretiva (Fase 3B.2B)

- Reconcilia 2ª `resolve_planned_execution` (negações + status + dedupe)
- `max_agentes` fail-closed (`SINGLE_AGENT_MAX_AGENTS_INVALID` / `MAX_AGENTS_TOO_LOW` / `MAX_AGENTS_EXCEEDED`)
- Orçamento contratual: tempo ≤3600, retries/rodadas ≤1, paralelo ≤2
- Contagens: orch **121** · executor **56** · skills **32** · harness **37**

## 2026-07-13 — Fase 3B.2B iniciada

- Branch `feat/fase-3b2b-estrategia-explicita` a partir de `origin/main` @ `9f72b694`
- Objetivo: estratégia/tarefas explícitas no Cartão → Plano; default single-agent; sem heurística semântica

## 2026-07-13 — PR #426 MERGED (Fase 3B.2A)

- Squash `9f72b6944302997bf4779e515f515a737006053c`
- Runner exige `resumo_operacional.executavel=true` (`PLAN_NOT_EXECUTABLE`)

## 2026-07-13 — PR #425 MERGED (Fase 3B.1.5)

- Squash `46765ab8`
