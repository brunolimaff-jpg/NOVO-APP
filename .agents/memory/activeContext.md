# Active Context

Last updated: 2026-07-13 — PR #425 MERGED (Fase 3B.1.5 em main)

## Estado atual

- **Branch canônica:** `main` @ `46765ab8` (squash merge PR #425)
- **PR #425:** MERGED — hardening e benchmark do harness Codex
- **PR #424 / 3B.1:** MERGED anteriormente (`9c8b3228`)
- **Escopo concluído:** política Codex conservadora, orçamento de subagentes, auditor fail-closed (37 testes), protocolo de benchmark
- **Próximo:** Fase 3B.2 (propagação planner→comandos + schema condicional) — **não iniciar sem pedido**

## Fonte da verdade

1. `HANDOFF_AI.md`
2. `docs/benchmarks/codex-harness-5.6.md`
3. `.codex/config.toml` (`max_threads=3`, `max_depth=1`)
4. Este arquivo + `progress.md` + `decisions.md`
5. Contrato operacional do executor: `.agents/orquestracao/executor/README.md`

## Atenção operacional

- Multi-Agent V2 **não** é roteador confiável até prova de runtime (CLI).
- Subagentes: orçamento em `AGENTS.md`; sem Ultra/Fast; máx. 2 filhos; 1 escritor.
- Gates próprios: Skills Governance, Agent Orchestration (+ harness policy), Agent Execution, Build.
- Probe A documentado como `BLOCKED_BY_HARNESS`; Probe B `NOT_EXECUTED`.
- Stashes `wip-pre-main-checkout-after-pr424-merge` / `wip-remaining-after-pr424`: **não aplicar**.

---

## Histórico

### 2026-07-13 — Fase 3B.1.5 mergeada (#425)

- Squash `46765ab8`; auditor TOML fail-closed; 37 testes.

### 2026-07-13 — Fase 3B.1 mergeada (#424)

- Squash `9c8b3228`; docs sync `f889f57a`.
