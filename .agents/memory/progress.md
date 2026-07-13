# Progress

## 2026-07-13 — Fase 3B.1.5 (em PR)

- Branch: `chore/fase-3b15-harness-hardening`
- Removido `<claude-mem-context>` do `AGENTS.md`
- Política de orçamento de subagentes adicionada
- `.codex/config.toml`: `max_threads=3`, `max_depth=1` (sem flags experimentais)
- Docs: Multi-Agent V2 não confiável até prova de runtime
- Protocolo: `docs/benchmarks/codex-harness-5.6.md`
- Auditor: `scripts/validate-codex-harness-policy.rb` + `scripts/test-codex-harness-policy.rb`
- Integração no job CI Agent Orchestration
- Contagens atualizadas: Orchestration **57**, Execution **54**, Skills **32**
- **Não iniciado:** Fase 3B.2

## 2026-07-13 — PR #424 MERGED (Fase 3B.1)

- Squash `9c8b3228`; docs sync `f889f57a`
- Executor local, 54 testes, fail-closed de status

## 2026-07-13 — PR #423 MERGED (Fase 3A)

- Squash `0f9858a1` — 57 testes de orquestração
