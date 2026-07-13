# Active Context

Last updated: 2026-07-13 — Fase 3B.2A em andamento (`feat/fase-3b2a-plano-minimo`)

## Estado atual

- **Branch:** `feat/fase-3b2a-plano-minimo` (baseline `origin/main` @ `0f9bfda7`)
- **Escopo:** plano mínimo + topologia explícita (parcial 3B.2); **sem** spawn real de agentes
- **Testes orch:** 84
- **Próximo após merge:** Fase 3B.2B — sob pedido explícito

## Fonte da verdade

1. `HANDOFF_AI.md`
2. Este arquivo + `progress.md` + `decisions.md` (DI-06..08)
3. `.agents/orquestracao/executor/README.md`
4. `docs/benchmarks/codex-harness-5.6.md` (harness 3B.1.5)

## Atenção operacional

- Default single-agent; multi-agent só via validador + justificativa.
- Schema `if/then` ainda deferido.
- Stashes `wip-pre-main-checkout-after-pr424-merge` / `wip-remaining-after-pr424`: **não aplicar**.

---

## Histórico

### 2026-07-13 — Fase 3B.2A (esta branch)

- Propagação comandos + topologia + `validate_operational_plan!` + `--resumo`.

### 2026-07-13 — Fase 3B.1.5 mergeada (#425)

- Squash `46765ab8`; auditor TOML fail-closed; 37 testes.
