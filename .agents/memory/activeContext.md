# Active Context

Last updated: 2026-07-13 — Fase 3B.3B Runtime Codex single-agent

## Estado

- **main:** `2239975a` (PR #428 MERGED — 3B.3A)
- **Branch:** `feat/fase-3b3b-single-agent-runtime`
- **Foco:** runtime single-agent Codex com três chaves, preflight live, escopo observado
- **Runtime real:** desligado por padrão; testes usam **fake Codex** apenas
- **DCG:** obrigatório para escrita; não instalar globalmente nesta PR

## Atenção

- Stashes `wip-pre-main-checkout-after-pr424-merge` / `wip-remaining-after-pr424`: **não aplicar**
- Não incluir `.cursor/hooks/state/`
- Não executar Codex real; não iniciar 3B.3C
