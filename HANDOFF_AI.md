# Handoff — Fase 3B.2B (estratégia explícita)

> **Atualizado:** 2026-07-13
> **Branch:** `feat/fase-3b2b-estrategia-explicita`
> **Baseline main:** `9f72b694` (squash PR #426 — Fase 3B.2A)
> **Próxima etapa:** 3B.3 (runtime/handoff) — **não iniciada**

## Estado

| Fase  | Status                         | Entrega                                               |
| ----- | ------------------------------ | ----------------------------------------------------- |
| 3B.2A | **MERGED** `#426` → `9f72b694` | topologia, `executavel`, runner `PLAN_NOT_EXECUTABLE` |
| 3B.2B | **esta branch**                | estratégia/tarefas explícitas no cartão → plano       |
| 3B.3  | não iniciada                   | spawn / handoff runtime                               |

### Contagens pós-#426

- Orquestração: **86**
- Executor: **56**
- Skills Governance: **32**
- Codex harness: **37**

## Princípio 3B.2B

Cartão declara intenção; planner normaliza/valida/resume. **Sem** heurística semântica de texto livre. Default: `agente-unico`.

## Referências conceituais (não instaladas)

- **Ponytail:** YAGNI, menor diff correto
- **Agency Agents:** responsabilidade, exclusões, entrega, evidência (sem catálogo externo)

## Não fazer

- Spawn real / `codex exec` / Multi-Agent V2
- Scheduler, task ledger runtime, novos papéis
- Scout funcional / merge sem **MERGE**
