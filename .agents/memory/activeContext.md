# Active Context

Last updated: 2026-07-13 — Fase 3B.3A Runtime Safety Preflight

## Estado

- **main:** `b7c6f671` (PR #427 MERGED — 3B.2B)
- **Branch:** `feat/fase-3b3a-runtime-safety-preflight`
- **Foco:** hardening de paths + política DCG project-local + preflight determinístico fail-closed
- **Testes (baseline pós-#427 + 3B.3A):** orch **133** · executor **58** · skills **32** · harness **37** · runtime-safety **28**
- **Runtime real:** **não autorizado**

## Atenção

- Stashes `wip-pre-main-checkout-after-pr424-merge` / `wip-remaining-after-pr424`: **não aplicar**
- Não incluir `.cursor/hooks/state/`
- Não instalar DCG globalmente; CI usa apenas fixtures
- Não iniciar 3B.3B
