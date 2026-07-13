# Active Context

Last updated: 2026-07-13 — Fase 3B.1.5 (hardening harness Codex)

## Estado atual

- **Branch:** `chore/fase-3b15-harness-hardening` (base `origin/main` @ `f889f57a`)
- **PR #424 / 3B.1:** MERGED em main
- **Fase ativa:** 3B.1.5 — política Codex + benchmark controlado + auditor
- **Não iniciar:** Fase 3B.2

## Fonte da verdade

1. `HANDOFF_AI.md`
2. `docs/benchmarks/codex-harness-5.6.md`
3. `.codex/config.toml` (`max_threads=3`, `max_depth=1`)
4. Este arquivo + `progress.md` + `decisions.md`

## Atenção operacional

- Multi-Agent V2 **não** é roteador confiável até prova de runtime (CLI).
- Subagentes: orçamento em `AGENTS.md`; sem Ultra/Fast; máx. 2 filhos; 1 escritor.
- Gates próprios: Skills Governance, Agent Orchestration (+ harness policy), Agent Execution, Build.
- Stashes `wip-pre-main-checkout-after-pr424-merge` / `wip-remaining-after-pr424`: **não aplicar**.

---

## Histórico

### 2026-07-13 — Fase 3B.1.5 iniciada

- Limpeza `AGENTS.md`, redução `max_threads` 6→3, benchmark + auditor de política.

### 2026-07-13 — Fase 3B.1 mergeada (#424)

- Squash `9c8b3228`; docs sync `f889f57a`.
